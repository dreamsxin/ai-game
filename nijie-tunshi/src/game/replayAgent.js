import { LEVEL } from './level.js';
import { MAX_NAVIGATION_RADIUS } from './rules.js';
import { createNavGrid, crossSignature, findPath, gateSignature, segmentBlocked, simplifyPath } from './navigation.js';

// ROUTE 只描述"先后要处理哪些目标"这一层策略，具体怎么绕过墙体交给寻路。
const ROUTE = [
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

// 目标可能移动（糖果怪会逃），因此路径按固定步数重算，而不是只算一次。
const REPLAN_INTERVAL = 30;
const WAYPOINT_ARRIVAL = 1.4;

const navigationRadius = (player) => Math.min(player.radius, MAX_NAVIGATION_RADIUS);
// 半径量化到 0.25，避免每帧重建网格
const quantizeRadius = (player) => Math.round(navigationRadius(player) * 4) / 4;

export function createReplayAgent() {
  let index = 0;
  let previousDash = false;
  let previousPhase = false;
  let active = false;
  let grid = null;
  let gridKey = '';
  let path = null;
  let pathSlot = 0;
  let pathKey = '';
  let sinceReplan = 0;
  // 诊断计数：确认寻路真的被用到，而不是永远走直线。
  const stats = { plans: 0, followedSteps: 0, straightSteps: 0, failedPlans: 0 };

  const clearPath = () => { path = null; pathSlot = 0; pathKey = ''; };

  const ensureGrid = (player) => {
    const radius = quantizeRadius(player);
    // 网格同时取决于半径、可跨越墙体和窄门开合，三者任一变化都要重建
    const key = `${radius}|${crossSignature(player.mass)}|${gateSignature(player.mass)}`;
    if (!grid || key !== gridKey) {
      grid = createNavGrid(radius, player.mass);
      gridKey = key;
      clearPath();
    }
    return grid;
  };

  return {
    start() {
      index = 0;
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
      const node = ROUTE[index];
      if (!node) { active = false; return {}; }
      let target;
      if (node.kind === 'object') {
        target = state.objects.find((object) => object.id === node.id && object.active);
        if (!target) { index += 1; clearPath(); return this.snapshot(state); }
      } else if (node.kind === 'anchor') {
        target = state.anchors.find((anchor) => anchor.id === node.id && anchor.active);
        if (!target) { index += 1; clearPath(); return this.snapshot(state); }
      } else if (node.kind === 'exit') {
        target = LEVEL.exit;
      } else {
        target = node;
      }

      const player = state.player;
      const distance = Math.hypot(target.x - player.x, target.z - player.z);
      const arrival = node.kind === 'exit' ? LEVEL.exit.radius : node.kind === 'anchor' ? 1.4 : 1.9;
      if (distance <= arrival && node.kind === 'point') {
        index += 1;
        clearPath();
        return this.snapshot(state);
      }

      const navGrid = ensureGrid(player);
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
