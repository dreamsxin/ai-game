import { LEVEL } from './level.js';
import { MAX_NAVIGATION_RADIUS } from './rules.js';
import { createNavGrid, crossSignature, findPath, gateSignature, segmentBlocked, simplifyPath } from './navigation.js';

// HANDMADE_ROUTE 只描述"先后要处理哪些目标"这一层策略，具体怎么绕过墙体交给寻路。
// 两个 point 节点是为首关那两道 unclimbable 高墙手工编排的绕行点。
const HANDMADE_ROUTE = [
  { kind: 'object', id: 'orb-1' },
  { kind: 'object', id: 'orb-2' },
  { kind: 'object', id: 'orb-4' },
  { kind: 'object', id: 'cylinder-1' },
  { kind: 'object', id: 'cube-1' },
  { kind: 'object', id: 'prism-1' },
  { kind: 'point', x: 22, z: 14 },
  { kind: 'point', x: 22, z: -13 },
  { kind: 'object', id: 'prism-3' },
  { kind: 'object', id: 'crystal-2' },
  { kind: 'anchor', id: 'north', action: 'dash' },
  { kind: 'anchor', id: 'south', action: 'gravity' },
  { kind: 'anchor', id: 'phase', action: 'phase' },
  { kind: 'object', id: 'core' },
  { kind: 'exit' },
];

// 生成关卡没有手工编排的路线，按质量升序吃：这正是验证器贪心见证走的顺序，
// 所以只要那张图通过了验证，这条路线在原则上就是可行的。
// 同质量时用原始下标兜底，保证确定性。
export function deriveRoute(level) {
  const eatables = level.objects
    .map((object, order) => ({ object, order }))
    .filter(({ object }) => object.id !== 'core')
    .sort((left, right) => (left.object.mass - right.object.mass) || (left.order - right.order))
    .map(({ object }) => ({ kind: 'object', id: object.id }));
  const anchors = level.anchors.map((anchor) => ({ kind: 'anchor', id: anchor.id, action: anchor.ability }));
  return [...eatables, ...anchors, { kind: 'object', id: 'core' }, { kind: 'exit' }];
}

// 只有当关卡确实含有手工路线引用的那些对象时才用手工路线，否则那些 id
// 会全部落空、point 绕行点也指向别的地形。
export function routeForLevel(level) {
  const authored = HANDMADE_ROUTE.every((node) => (
    node.kind !== 'object' || level.objects.some((object) => object.id === node.id)
  ));
  return authored ? HANDMADE_ROUTE : deriveRoute(level);
}

// 目标可能移动（糖果怪会逃），因此路径按固定步数重算，而不是只算一次。
const REPLAN_INTERVAL = 30;
const WAYPOINT_ARRIVAL = 1.4;
// 单个可吞噬目标的步数预算（30 秒）。实测生成关卡上会出现"某个对象卡在
// 当前质量下关着的窄门后面"的情况：贪心见证跳过了它，但按质量升序走的
// 路线会死磕在那里。超预算就先放过，等吃胖一圈后再回来。
const OBJECT_STEP_BUDGET = 1800;

const navigationRadius = (player) => Math.min(player.radius, MAX_NAVIGATION_RADIUS);
// 半径量化到 0.25，避免每帧重建网格
const quantizeRadius = (player) => Math.round(navigationRadius(player) * 4) / 4;

export function createReplayAgent() {
  let index = 0;
  let route = null;
  let nodeAge = 0;
  let previousDash = false;
  let previousPhase = false;
  let active = false;
  let grid = null;
  let gridKey = '';
  let path = null;
  let pathSlot = 0;
  let pathKey = '';
  let sinceReplan = 0;
  // 诊断计数：确认寻路真的被用到，而不是永远走直线。deferred 记录被暂时
  // 放过的目标数，非零说明这张图上有当前质量下够不着的对象。
  const stats = { plans: 0, followedSteps: 0, straightSteps: 0, failedPlans: 0, deferred: 0 };

  const clearPath = () => { path = null; pathSlot = 0; pathKey = ''; };

  // 推进到下一个节点并立刻重算这一帧的输入，避免空转一帧。
  const advance = (state, self) => {
    index += 1;
    nodeAge = 0;
    clearPath();
    return self.snapshot(state);
  };

  const ensureGrid = (player, level) => {
    const radius = quantizeRadius(player);
    // 网格同时取决于半径、可跨越墙体和窄门开合，三者任一变化都要重建
    const key = `${radius}|${crossSignature(player.mass, level)}|${gateSignature(player.mass, level)}`;
    if (!grid || key !== gridKey) {
      grid = createNavGrid(radius, player.mass, level);
      gridKey = key;
      clearPath();
    }
    return grid;
  };

  return {
    start() {
      index = 0;
      route = null;
      nodeAge = 0;
      previousDash = false;
      previousPhase = false;
      active = true;
      grid = null;
      gridKey = '';
      sinceReplan = 0;
      clearPath();
    },
    stop() { active = false; },
    isActive() { return active; },
    stats() { return { ...stats }; },
    snapshot(state) {
      if (!active || state.status !== 'playing') return {};
      const level = state.level ?? LEVEL;
      // 路线在开演时派生一次。不能按 level 引用判断是否重派生：step 每帧
      // 都会返回一个新的 level 对象，那样 index 每帧都会被清零，回放永远
      // 走不过 point 节点。
      if (!route) route = routeForLevel(level).slice();
      const node = route[index];
      if (!node) { active = false; return {}; }
      nodeAge += 1;
      // 死磕超预算的可吞噬目标先放过，挪到路线末尾等回头再吃。只放一次，
      // 否则会无限往后追加。锚点、核心与出口是必经目标，验证器保证可达，
      // 不允许跳过。
      if (node.kind === 'object' && node.id !== 'core' && !node.deferred && nodeAge > OBJECT_STEP_BUDGET) {
        route.push({ ...node, deferred: true });
        stats.deferred += 1;
        return advance(state, this);
      }
      let target;
      if (node.kind === 'object') {
        target = state.objects.find((object) => object.id === node.id && object.active);
        if (!target) return advance(state, this);
      } else if (node.kind === 'anchor') {
        target = state.anchors.find((anchor) => anchor.id === node.id && anchor.active);
        if (!target) return advance(state, this);
      } else if (node.kind === 'exit') {
        target = level.exit;
      } else {
        target = node;
      }

      const player = state.player;
      const distance = Math.hypot(target.x - player.x, target.z - player.z);
      const arrival = node.kind === 'exit' ? level.exit.radius : node.kind === 'anchor' ? 1.4 : 1.9;
      if (distance <= arrival && node.kind === 'point') {
        return advance(state, this);
      }

      const navGrid = ensureGrid(player, level);
      const key = `${index}|${node.kind}|${node.id ?? `${target.x},${target.z}`}`;
      sinceReplan += 1;
      const stale = key !== pathKey || !path || pathSlot >= path.length || sinceReplan >= REPLAN_INTERVAL;
      // 视野无阻时直奔目标，只有被墙挡住才动用寻路
      const blocked = segmentBlocked(navGrid, player, target);
      if (blocked && stale) {
        path = simplifyPath(findPath(navGrid, player, target));
        pathSlot = 0;
        pathKey = key;
        sinceReplan = 0;
        stats.plans += 1;
        if (!path) stats.failedPlans += 1;
      } else if (!blocked) {
        clearPath();
        sinceReplan = 0;
      }

      let steer = { x: target.x - player.x, z: target.z - player.z };
      if (blocked && path && path.length) {
        while (pathSlot < path.length - 1) {
          const waypoint = path[pathSlot];
          if (Math.hypot(waypoint.x - player.x, waypoint.z - player.z) > WAYPOINT_ARRIVAL) break;
          pathSlot += 1;
        }
        const waypoint = path[pathSlot];
        steer = { x: waypoint.x - player.x, z: waypoint.z - player.z };
        stats.followedSteps += 1;
      } else {
        stats.straightSteps += 1;
      }

      const nearbyBreakable = state.structures.find((structure) => (
        structure.active
        && structure.kind === 'breakable'
        && Math.hypot(player.x - structure.x, player.z - structure.z) < 4.5
      ));
      const polarityPull = node.kind === 'object' && target.polarity === 'dark' && distance < 6.8;
      const dashPressed = (node.action === 'dash' && distance < 5 && !previousDash)
        || Boolean(nearbyBreakable && player.abilities.dash.cooldown === 0);
      const phasePressed = node.action === 'phase' && distance < 5 && !previousPhase;
      previousDash = node.action === 'dash' && distance < 5;
      previousPhase = node.action === 'phase' && distance < 5;
      return {
        x: steer.x,
        z: steer.z,
        dashPressed,
        phasePressed,
        gravityHeld: polarityPull || (node.action === 'gravity' && distance < 5),
      };
    },
  };
}
