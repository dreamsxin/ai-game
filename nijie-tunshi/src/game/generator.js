import { createRng } from './random.js';
import { LEVEL, LEVEL_SEED } from './level.js';
import { massToCross, STELLAR_FUEL_TARGET, STELLAR_IGNITION_MASS } from './rules.js';
import { validateLevel } from './validator.js';

// 种子关卡生成器。核心思路不是"随机撒点再靠验证器筛"，而是让结构本身
// 排除掉最难修的失败模式：
//
// 1. 先铺一条从出生点到出口的开放走廊，全程不放窄门 —— 主干永远连通。
// 2. 墙体只放在离走廊足够远的位置，绝不横断主干。
// 3. 窄门只架在"走廊上相距很远、但空间上很近"的两点之间，因此它永远
//    只是捷径。关掉任何窄门都不会切断通路，成长陷阱在结构上不可能出现。
// 4. 对象沿走廊按质量升序分布，成长链天然成立。
//
// 验证器仍然要跑，但它的角色是护栏而非筛子。

export const DEFAULT_RECIPE = {
  seed: LEVEL_SEED,
  bounds: { minX: -26, maxX: 26, minZ: -18, maxZ: 22 },
  start: { x: -19, z: 13 },
  exit: { x: 20, z: -13, radius: 2.4 },
  waypoints: 7,
  objectCount: 20,
  wallCount: 4,
  gateCount: 2,
  // 质量与燃料留足余量：点火要 130 与 100，余量吸收玩家的漏吃
  massBudget: STELLAR_IGNITION_MASS * 1.8,
  fuelBudget: STELLAR_FUEL_TARGET * 1.5,
  fuelSources: 6,
  corridorClearance: 6,
  palette: [0x58ffbf, 0xff9df2, 0x7df3ff, 0xffb257, 0xff6e9f, 0xb8ff5c, 0xffdf6d, 0xff62c7],
};

const TYPE_BY_TIER = ['orb', 'orb', 'cylinder', 'cube', 'prism', 'crystal'];

const distanceToSegment = (point, from, to) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) return Math.hypot(point.x - from.x, point.z - from.z);
  let t = ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (from.x + dx * t), point.z - (from.z + dz * t));
};

const corridorDistance = (point, corridor) => {
  let best = Infinity;
  for (let index = 0; index < corridor.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, corridor[index], corridor[index + 1]));
  }
  return best;
};

const clampToBounds = (bounds, margin, point) => ({
  x: Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin, point.x)),
  z: Math.max(bounds.minZ + margin, Math.min(bounds.maxZ - margin, point.z)),
});

// 三种布局模板，各自只负责生成中间折点：起点与出口由配方固定，因此
// "对象沿走廊按质量升序分布"、"墙体离走廊足够远"、"窄门只设下限"这三条
// 不变量在三种模板下都照样成立。
export const LAYOUTS = {
  // 走廊型：起点直奔出口，中段侧向摆动制造回廊感。
  corridor(rng, recipe, amount) {
    const { start, exit } = recipe;
    const sway = Math.sin(amount * Math.PI) * rng.float(-9, 9);
    return {
      x: start.x + (exit.x - start.x) * amount + sway,
      z: start.z + (exit.z - start.z) * amount - sway * 0.5,
    };
  },
  // 折返型：横向来回摆到两侧极限，纵向单调推进。绕行距离远大于直线距离，
  // 捷径窄门在这种图上才真的是捷径。
  switchback(rng, recipe, amount, index) {
    const { bounds, start, exit } = recipe;
    const center = (bounds.minX + bounds.maxX) / 2;
    const reach = (bounds.maxX - bounds.minX) * 0.34 * Math.sin(amount * Math.PI) + 3;
    const side = index % 2 === 0 ? -1 : 1;
    return {
      x: center + side * reach + rng.float(-2, 2),
      z: start.z + (exit.z - start.z) * amount + rng.float(-2.5, 2.5),
    };
  },
  // 螺旋型：绕地图中心由外向内盘 1.5 圈，最后一段接到出口。
  spiral(rng, recipe, amount) {
    const { bounds } = recipe;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const turns = 1.5;
    const angle = rng.float(-0.3, 0.3) + amount * Math.PI * 2 * turns;
    const outer = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.42;
    const radius = outer - (outer - 5) * amount;
    return {
      x: centerX + Math.cos(angle) * radius,
      z: centerZ + Math.sin(angle) * radius * 0.78,
    };
  },
};

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

// 墙体离走廊的余量按模板给。折返型的走廊来回扫过整张图，用走廊型那套 6
// 单位余量就几乎没地方放墙了（实测 8 个种子平均只放下 0.6 道墙），"再吃一个
// 就能翻过去"这条反馈在那种图上等于不存在。余量下限受寻路半径约束：
// MAX_NAVIGATION_RADIUS 是 2.35，取 3.5 仍留 1.15 的富余。
export const LAYOUT_CLEARANCE = { corridor: 6, spiral: 5, switchback: 3.5 };

export const LAYOUT_LABELS = { corridor: '走廊', switchback: '折返', spiral: '螺旋' };

// 走廊：从出生点到出口的折线，中间点由 seed 与模板决定，但始终留出边界余量。
function buildCorridor(rng, recipe) {
  const { bounds, start, exit, waypoints } = recipe;
  const shape = LAYOUTS[recipe.layout] ?? LAYOUTS.corridor;
  const margin = 4;
  const corridor = [{ x: start.x, z: start.z }];
  for (let index = 1; index < waypoints - 1; index += 1) {
    const amount = index / (waypoints - 1);
    corridor.push(clampToBounds(bounds, margin, shape(rng, recipe, amount, index)));
  }
  corridor.push({ x: exit.x, z: exit.z });
  return corridor;
}

// 沿走廊按弧长均匀取点，用于放置对象、锚点与核心。
function sampleCorridor(corridor, amount) {
  const lengths = [];
  let total = 0;
  for (let index = 0; index < corridor.length - 1; index += 1) {
    const length = Math.hypot(
      corridor[index + 1].x - corridor[index].x,
      corridor[index + 1].z - corridor[index].z,
    );
    lengths.push(length);
    total += length;
  }
  let target = Math.max(0, Math.min(1, amount)) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] < 1e-9 ? 0 : target / lengths[index];
      return {
        x: corridor[index].x + (corridor[index + 1].x - corridor[index].x) * t,
        z: corridor[index].z + (corridor[index + 1].z - corridor[index].z) * t,
      };
    }
    target -= lengths[index];
  }
  return { ...corridor[corridor.length - 1] };
}

// 墙体只放在离走廊足够远的位置，绝不横断主干。高度取自成长阈值阶梯，
// 因此"再吃一个就能翻过去"这件事在生成图里同样成立。
function buildWalls(rng, recipe, corridor) {
  const heights = [1.9, 2.7, 3.5];
  const walls = [];
  for (let attempt = 0; attempt < recipe.wallCount * 40 && walls.length < recipe.wallCount; attempt += 1) {
    const x = rng.float(recipe.bounds.minX + 6, recipe.bounds.maxX - 6);
    const z = rng.float(recipe.bounds.minZ + 6, recipe.bounds.maxZ - 6);
    const width = rng.float(3, 7);
    const depth = rng.float(3, 7);
    const unclimbable = rng.chance(0.25);
    const height = unclimbable ? 6 : rng.pick(heights);
    // 半对角线加余量：保证整块墙体都在走廊之外
    const clearance = Math.hypot(width, depth) / 2 + recipe.corridorClearance;
    if (corridorDistance({ x, z }, corridor) < clearance) continue;
    if (walls.some((wall) => Math.hypot(wall.x - x, wall.z - z) < 8)) continue;
    walls.push({
      id: `wall-${walls.length + 1}`,
      x: Number(x.toFixed(2)),
      z: Number(z.toFixed(2)),
      width: Number(width.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      height,
      ...(unclimbable ? { unclimbable: true } : {}),
    });
  }
  return walls;
}

// 窄门只架在"走廊上相距很远、空间上很近"的两点之间，作为捷径。
//
// 生成关卡上的窄门只有 minMass，没有 maxMass —— 这是实测逼出来的结论。
// 带 maxMass 的窄门会随玩家长大而关闭，而这些窄门的落点几乎必然压在主干
// 走廊上（实测 40 个种子的 73 道窄门，73 道都压在走廊上），一关就把那段
// 走廊上的对象永久封死：40 个种子全部出现 2–8 个对象在点火质量下不可达。
// 验证器没抓到，因为它只检查锚点、核心与出口这些必经目标。
//
// 只留 minMass 后，可达范围随质量单调增长，封死在结构上不可能发生。
// 双侧约束（maxMass）留给手工关那种"窄门开在实墙上"的布局。
// 走廊上离某点最近处的弧长比例，用来判断"玩家走到这附近时大概多重"。
function corridorFraction(point, corridor) {
  const lengths = [];
  let total = 0;
  for (let index = 0; index < corridor.length - 1; index += 1) {
    const length = Math.hypot(
      corridor[index + 1].x - corridor[index].x,
      corridor[index + 1].z - corridor[index].z,
    );
    lengths.push(length);
    total += length;
  }
  let best = Infinity;
  let bestAt = 0;
  let travelled = 0;
  for (let index = 0; index < corridor.length - 1; index += 1) {
    const from = corridor[index];
    const to = corridor[index + 1];
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    let t = lengthSquared < 1e-9 ? 0 : ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    const distance = Math.hypot(point.x - (from.x + dx * t), point.z - (from.z + dz * t));
    if (distance < best) {
      best = distance;
      bestAt = travelled + lengths[index] * t;
    }
    travelled += lengths[index];
  }
  return total < 1e-9 ? 0 : bestAt / total;
}

// 窄门开在两道墙之间的门洞上，而不是孤零零立在空地里。
//
// 上一版把窄门放在"走廊上绕得远、空间上很近"的两点连线中点。实测下来那
// 根本不构成选择：走廊型 12 张图的 116 条候选弦，中点离走廊最远只有 1.0
// 单位 —— 弦全都压在走廊上。压在走廊上的窄门一关就切断主干（那是上一轮
// 修掉的封死缺陷），不压在走廊上的又只是一只可以绕开的盒子。
//
// 现在改为在墙对之间找门洞：两道墙之间 3 到 11 单位的缺口，缺口中心离
// 走廊至少 4 单位。窄门填满这个缺口，于是"墙—门—墙"连成一道真障碍，
// 关着的时候必须绕过整组墙，开着的时候是一条捷径。缺口离走廊足够远，
// 因此关门永远不会切断主干。
//
// 窄门仍然只设 minMass：长大后开、永不再关，可达范围随质量单调增长。
function buildGates(rng, recipe, corridor, keepClear, objects, walls) {
  const gates = [];
  const doorways = [];
  for (let left = 0; left < walls.length; left += 1) {
    for (let right = left + 1; right < walls.length; right += 1) {
      const a = walls[left];
      const b = walls[right];
      const alongX = Math.abs(a.x - b.x) >= Math.abs(a.z - b.z);
      // 缺口是两道墙相对面之间的净距
      const gap = alongX
        ? Math.abs(a.x - b.x) - (a.width + b.width) / 2
        : Math.abs(a.z - b.z) - (a.depth + b.depth) / 2;
      // 太窄会被导航膨胀直接封死，太宽就不成门洞
      if (gap < 3 || gap > 11) continue;
      const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (corridorDistance(midpoint, corridor) < 4) continue;
      doorways.push({ a, b, alongX, gap, midpoint });
    }
  }
  // 缺口越窄越像门，优先用
  const ordered = rng.shuffle(doorways).sort((left, right) => left.gap - right.gap);
  for (const doorway of ordered) {
    if (gates.length >= recipe.gateCount) break;
    const { a, b, alongX, gap, midpoint } = doorway;
    // 门稍微咬进两侧墙体，避免留出可以擦过去的缝
    const width = alongX ? gap + 0.8 : Math.min(a.width, b.width);
    const depth = alongX ? Math.min(a.depth, b.depth) : gap + 0.8;
    if (gates.some((gate) => Math.hypot(gate.x - midpoint.x, gate.z - midpoint.z) < 7)) continue;
    const footprint = Math.hypot(width, depth) / 2 + 3;
    // 压在锚点、核心、出口或某个对象上，那个目标早期就够不到
    if (keepClear.some((point) => Math.hypot(point.x - midpoint.x, point.z - midpoint.z) < footprint)) continue;
    if (objects.some((object) => Math.hypot(object.x - midpoint.x, object.z - midpoint.z) < footprint)) continue;
    // 门槛必须付得起：只算走廊上排在门洞之前的那些对象。把门槛设成"必须
    // 吃到门后面的东西才够"就是成长陷阱 —— 实测 40 个种子里有 3 个因此
    // 完全生成不出关卡（贪心在质量 5 上下就走不动了）。
    const reach = corridorFraction(midpoint, corridor);
    const affordable = objects
      .filter((object, order) => object.id !== 'core' && (order + 0.5) / objects.length <= reach)
      .reduce((sum, object) => sum + object.mass, 0);
    if (affordable < 8) continue;
    gates.push({
      id: `gate-${gates.length + 1}`,
      // 屏障延伸的轴向。不能靠 width 与 depth 谁大来反推：缺口 3–11、墙深
      // 3–7，两者区间重叠，反推会猜错，穿门方向也就跟着错。
      axis: alongX ? 'x' : 'z',
      x: Number(midpoint.x.toFixed(2)),
      z: Number(midpoint.z.toFixed(2)),
      width: Number(width.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      height: 3.2,
      minMass: Math.max(6, Math.round(affordable * rng.float(0.4, 0.75))),
    });
  }
  return gates;
}

// 对象沿走廊按质量升序分布：走得越远，能吃的越大，成长链天然成立。
function buildObjects(rng, recipe, corridor) {
  const count = Math.max(8, recipe.objectCount);
  // 曲线陡缓与总预算都随 seed 浮动，否则每张图的成长阶梯完全一样，
  // "程序生成"就只剩换墙位和换配色
  const curve = rng.float(1.5, 2.4);
  const massBudget = recipe.massBudget * rng.float(0.9, 1.25);
  const fuelBudget = recipe.fuelBudget * rng.float(0.92, 1.2);
  const weights = [];
  for (let index = 0; index < count; index += 1) {
    weights.push((index + 1) ** curve);
  }
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const objects = [];
  for (let index = 0; index < count; index += 1) {
    const amount = (index + 0.5) / count;
    const spot = sampleCorridor(corridor, amount);
    const mass = Math.max(1, Number(((weights[index] / weightTotal) * massBudget).toFixed(2)));
    const tier = Math.min(TYPE_BY_TIER.length - 1, Math.floor(amount * TYPE_BY_TIER.length));
    objects.push({
      id: `obj-${index + 1}`,
      type: TYPE_BY_TIER[tier],
      x: Number((spot.x + rng.float(-1.6, 1.6)).toFixed(2)),
      z: Number((spot.z + rng.float(-1.6, 1.6)).toFixed(2)),
      size: Number((0.6 + Math.sqrt(mass) * 0.22).toFixed(2)),
      mass,
      color: rng.pick(recipe.palette),
    });
  }
  // 燃料摊在靠后的对象上，但要跨足够多的来源，漏掉一个不至于点不了火
  const sourceCount = Math.max(5, recipe.fuelSources + rng.int(-1, 2));
  const fuelSlots = rng.shuffle(objects.slice(Math.floor(count * 0.35)).map((object) => object.id))
    .slice(0, sourceCount);
  const perSource = fuelBudget / fuelSlots.length;
  for (const id of fuelSlots) {
    const object = objects.find((candidate) => candidate.id === id);
    object.fuel = Number(perSource.toFixed(1));
  }
  return objects;
}

// 锚点与核心排在走廊末段：三枚锚点各绑定一种能力，核心在锚点之后。
function buildEndgame(rng, recipe, corridor, objects) {
  const anchors = [
    { id: 'north', ability: 'dash', at: 0.74, color: 0xffb257 },
    { id: 'south', ability: 'gravity', at: 0.82, color: 0x58ffbf },
    { id: 'phase', ability: 'phase', at: 0.9, color: 0xff62c7 },
  ].map((anchor) => {
    const spot = sampleCorridor(corridor, anchor.at);
    return {
      id: anchor.id,
      ability: anchor.ability,
      x: Number((spot.x + rng.float(-2, 2)).toFixed(2)),
      z: Number((spot.z + rng.float(-2, 2)).toFixed(2)),
      radius: anchor.id === 'phase' ? 1.05 : 1.15,
      color: anchor.color,
    };
  });

  // 核心复用走廊末段最重的那个对象位置，改名为 core 并标记 protected
  const heaviest = objects.reduce((best, object) => (object.mass > best.mass ? object : best), objects[0]);
  heaviest.id = 'core';
  heaviest.type = 'core';
  heaviest.protected = true;
  heaviest.color = 0xffffff;
  return { anchors };
}

function buildLevel(baseRecipe) {
  const rng = createRng(baseRecipe.seed);
  // 模板由 seed 决定，因此换图会换骨架而不只是换墙位与配色
  const layout = baseRecipe.layout ?? rng.pick(LAYOUT_NAMES);
  const recipe = { ...baseRecipe, layout, corridorClearance: LAYOUT_CLEARANCE[layout] ?? baseRecipe.corridorClearance };
  const corridor = buildCorridor(rng, recipe);
  const walls = buildWalls(rng, recipe, corridor);
  const objects = buildObjects(rng, recipe, corridor);
  const { anchors } = buildEndgame(rng, recipe, corridor, objects);
  // 窄门最后放：必须知道锚点、核心与出口在哪，才能给它们让位
  const core = objects.find((object) => object.id === 'core');
  const keepClear = [...anchors, core, recipe.exit].filter(Boolean);
  const gates = buildGates(rng, recipe, corridor, keepClear, objects, walls);
  return {
    seed: recipe.seed,
    layout,
    bounds: { ...recipe.bounds },
    start: { ...recipe.start },
    exit: { ...recipe.exit },
    obstacles: walls,
    gates,
    // 结构（可破坏糖板、糖雾门）留待后续模板扩展，当前生成图不放
    structures: [],
    anchors,
    objects,
    corridor,
  };
}

// 生成并验证。验证器是护栏而不是筛子：结构已排除成长陷阱，
// 因此重试主要用于兜住墙体摆放偶然堵死某个目标这类边角情况。
export function generateLevel(overrides = {}, maxAttempts = 12) {
  const base = { ...DEFAULT_RECIPE, ...overrides };
  const failures = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const recipe = { ...base, seed: base.seed + attempt };
    const level = buildLevel(recipe);
    const report = validateLevel(level);
    if (report.ok) return { level, recipe, report, attempts: attempt + 1, failures };
    failures.push({ seed: recipe.seed, issues: report.issues });
  }
  return { level: null, recipe: base, report: null, attempts: maxAttempts, failures };
}

// 给关卡算一份速览指标，供批量体检与节奏调参使用。
export function levelMetrics(level) {
  const totalMass = level.objects.reduce((sum, object) => sum + object.mass, 0);
  const fuelSources = level.objects.filter((object) => object.fuel);
  const totalFuel = fuelSources.reduce((sum, object) => sum + object.fuel, 0);
  const richest = fuelSources.reduce((best, object) => Math.max(best, object.fuel), 0);
  const crossable = level.obstacles.filter((obstacle) => !obstacle.unclimbable);
  return {
    layout: level.layout,
    objectCount: level.objects.length,
    totalMass: Number(totalMass.toFixed(1)),
    massHeadroom: Number((totalMass - STELLAR_IGNITION_MASS).toFixed(1)),
    totalFuel: Number(totalFuel.toFixed(1)),
    fuelSources: fuelSources.length,
    // 漏掉最大燃料来源后是否仍能凑满
    fuelSpareAfterMiss: Number((totalFuel - richest - STELLAR_FUEL_TARGET).toFixed(1)),
    wallCount: level.obstacles.length,
    gateCount: level.gates.length,
    crossThresholds: crossable.map((obstacle) => Number(massToCross(obstacle.height).toFixed(1))).sort((a, b) => a - b),
  };
}

// 换图槽位。UI 只需要在两个槽位之间切换：手工关与当前生成关。
// 这里做成纯函数，是因为渲染层拿不到自动化覆盖，换图的判定逻辑
// 至少要能被单独验证。
export const SHUFFLE_STRIDE = 977;

export const HANDMADE_SLOT = { level: LEVEL, seed: LEVEL.seed, generated: false, label: '手工关' };

// 生成失败时保留当前槽位并挂上 error：宁可玩家继续玩当前这张图，
// 也不能把关卡置空让场景炸掉。
export function nextMapSlot(slot = HANDMADE_SLOT, stride = SHUFFLE_STRIDE) {
  const seed = (slot?.seed ?? LEVEL_SEED) + stride;
  const { level, attempts } = generateLevel({ seed });
  if (!level) return { ...slot, error: `种子 ${seed} 附近没生成出可用关卡` };
  return { level, seed: level.seed, generated: true, attempts, label: `${LAYOUT_LABELS[level.layout] ?? level.layout}型 · 种子 ${level.seed}` };
}



