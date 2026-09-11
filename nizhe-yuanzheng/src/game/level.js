// 关卡：路线、货场、加油点、以及散在地形上的树和石头（它们同时是绞盘锚点）。
import { CELL, HALF, SIZE, createTerrain, heightAt, materialAt, nearestOnRoute, routeLength } from './terrain.js';
import { MAT_GRASS, MAT_ROCK, MAT_DIRT, WINCH_RANGE, materialIndexOf } from './rules.js';
import { createRandom } from './random.js';

export const LEVELS = [
  {
    id: 'timber',
    name: '第一趟 · 木料上山',
    brief: '把两捆木料送到山腰的伐木营。中段有一片被前车压烂的泥路，慢点过。',
    truckId: 'scout',
    par: 150,
    cargo: { type: 'timber', count: 2 },
    plan: {
      amp: 9,
      relief: 6,
      scale: 96,
      water: -6,
      route: [
        { x: -192, z: -168, material: 'gravel', width: 10 },
        { x: -138, z: -122, material: 'gravel', width: 9 },
        { x: -86, z: -74, material: 'dirt', width: 8 },
        { x: -34, z: -42, material: 'mud', width: 7 },
        { x: 16, z: -8, material: 'dirt', width: 7 },
        { x: 54, z: -46, material: 'dirt', width: 8 },
        { x: 104, z: -20, material: 'mud', width: 7 },
        { x: 122, z: 40, material: 'dirt', width: 8 },
        { x: 164, z: 132, material: 'gravel', width: 10 },
      ],
    },
  },
  {
    id: 'swamp',
    name: '第二趟 · 沼泽钢管',
    brief: '四捆钢管穿过低地沼泽，车厢只装得下三捆——得跑两趟，而且第二趟走的是自己压出来的坑。',
    truckId: 'hauler',
    par: 360,
    cargo: { type: 'pipes', count: 4 },
    refuel: [{ x: 12, z: -112 }],
    plan: {
      amp: 7,
      relief: 5,
      scale: 82,
      water: -2.4,
      route: [
        { x: -196, z: 172, material: 'gravel', width: 11 },
        { x: -142, z: 130, material: 'dirt', width: 9 },
        { x: -96, z: 60, material: 'mud', width: 8 },
        { x: -58, z: -4, material: 'swamp', width: 8 },
        { x: -4, z: -58, material: 'swamp', width: 7 },
        { x: 12, z: -112, material: 'mud', width: 8 },
        { x: 74, z: -146, material: 'dirt', width: 9 },
        { x: 150, z: -178, material: 'gravel', width: 11 },
      ],
    },
  },
  {
    id: 'transformer',
    name: '第三趟 · 变压器过河',
    brief: '六件变压器组件，车厢一次只装四件。一道河，一段长上坡，重心高，转弯别急。',
    truckId: 'heavy',
    par: 420,
    cargo: { type: 'transformer', count: 6 },
    refuel: [{ x: -30, z: 30 }],
    plan: {
      amp: 11,
      relief: 7,
      scale: 74,
      water: -1.2,
      route: [
        { x: -186, z: -14, material: 'gravel', width: 12, y: 3.2, fixed: true },
        { x: -128, z: 4, material: 'dirt', width: 10 },
        { x: -74, z: 20, material: 'mud', width: 9 },
        { x: -30, z: 30, material: 'dirt', width: 10, y: 0.4, fixed: true },
        { x: 6, z: 34, material: 'water', width: 9, y: -2.1, fixed: true },
        { x: 44, z: 40, material: 'mud', width: 9, y: 0.4, fixed: true },
        { x: 96, z: 62, material: 'dirt', width: 9 },
        { x: 148, z: 108, material: 'gravel', width: 11 },
        { x: 182, z: 162, material: 'gravel', width: 12 },
      ],
    },
  },
];

export const LEVEL_COUNT = LEVELS.length;
export const levelAt = (index) => LEVELS[((index % LEVEL_COUNT) + LEVEL_COUNT) % LEVEL_COUNT];

/** 生成树和石头。避开路面走廊，但刻意在泥泞段两侧多留几棵——那是绞盘的救命稻草。 */
function createProps(terrain, random) {
  const props = [];
  const attempts = 900;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const x = random.range(-HALF + CELL, HALF - CELL);
    const z = random.range(-HALF + CELL, HALF - CELL);
    const near = nearestOnRoute(terrain.route, x, z);
    // 太靠路面会挡路，太远又够不着绞盘：只在路肩到 30 米这条带里种。
    if (near.distance < near.width + 2.4 || near.distance > 30) continue;
    const y = heightAt(terrain, x, z);
    if (y < terrain.water + 0.4) continue;
    const material = materialAt(terrain, x, z);
    const isRock = material === MAT_ROCK || random.chance(0.18);
    props.push(isRock
      ? { type: 'rock', x, y, z, radius: random.range(1.1, 2.1), height: random.range(1.3, 2.6), anchor: true }
      : { type: 'tree', x, y, z, radius: random.range(0.42, 0.72), height: random.range(6, 13), anchor: true });
    if (props.length >= 210) break;
  }
  // 远景装饰：路很远的地方也种点树，但不参与碰撞和绞盘。
  for (let attempt = 0; attempt < 500 && props.length < 420; attempt += 1) {
    const x = random.range(-HALF, HALF);
    const z = random.range(-HALF, HALF);
    const near = nearestOnRoute(terrain.route, x, z);
    if (near.distance < 34) continue;
    const y = heightAt(terrain, x, z);
    if (y < terrain.water + 0.6) continue;
    const material = materialAt(terrain, x, z);
    if (material !== MAT_GRASS && material !== MAT_DIRT) continue;
    props.push({ type: 'tree', x, y, z, radius: random.range(0.4, 0.7), height: random.range(6, 14), anchor: false, far: true });
  }
  return props;
}

/** 泥泞路段两侧必须有锚点，否则陷在那里就是死局。随机撒点不保证这件事，所以补种。 */
function plantRescueAnchors(terrain, props, random) {
  const soft = new Set([materialIndexOf('mud'), materialIndexOf('swamp'), materialIndexOf('water')]);
  const covered = (x, z) => props.some(
    (prop) => prop.anchor && Math.hypot(prop.x - x, prop.z - z) <= WINCH_RANGE - 2,
  );
  for (let index = 0; index + 1 < terrain.route.length; index += 1) {
    const a = terrain.route[index];
    const b = terrain.route[index + 1];
    if (!soft.has(a.material) && !soft.has(b.material)) continue;
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(span / 12));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (covered(x, z)) continue;
      // 种在路肩外一点点，够得着但挡不着路。左右交替，免得全长在一边。
      const side = step % 2 === 0 ? 1 : -1;
      const nx = (-(b.z - a.z) / span) * side;
      const nz = ((b.x - a.x) / span) * side;
      const offset = (a.width + b.width) * 0.5 + 3.5;
      const px = clampToMap(x + nx * offset);
      const pz = clampToMap(z + nz * offset);
      props.push({
        type: 'tree',
        x: px,
        z: pz,
        y: heightAt(terrain, px, pz),
        radius: random.range(0.5, 0.72),
        height: random.range(8, 13),
        anchor: true,
      });
    }
  }
  return props;
}

const clampToMap = (value) => Math.max(-HALF + CELL, Math.min(HALF - CELL, value));

const siteAt = (terrain, point, radius) => ({
  x: point.x,
  z: point.z,
  y: heightAt(terrain, point.x, point.z),
  radius,
});

/** 组装一关：地形 + 货场 + 交付点 + 加油点 + 道具，全部由 seed 决定。 */
export function buildLevel(index, seed) {
  const config = levelAt(index);
  const random = createRandom(seed);
  const terrain = createTerrain(seed, config.plan);
  const route = terrain.route;
  const start = route[0];
  const finish = route[route.length - 1];
  const heading = Math.atan2(route[1].x - start.x, -(route[1].z - start.z));
  const props = plantRescueAnchors(terrain, createProps(terrain, random), random);

  return {
    index,
    seed,
    id: config.id,
    name: config.name,
    brief: config.brief,
    truckId: config.truckId,
    par: config.par,
    cargo: config.cargo,
    terrain,
    route,
    length: routeLength(route),
    depot: siteAt(terrain, start, 12),
    site: siteAt(terrain, finish, 12),
    refuel: (config.refuel ?? []).map((point) => siteAt(terrain, point, 8)),
    props,
    propGrid: indexProps(props),
    start: { x: start.x, z: start.z, yaw: heading },
  };
}

/** 沿路线还剩多少米。开偏了会偏大，但作为「还有多远」的提示足够。 */
export function remainingDistance(level, x, z) {
  const near = nearestOnRoute(level.route, x, z);
  return Math.max(0, level.length - near.along);
}

// 粗网格索引。物理步长是 1/120 秒，四百多棵树全量遍历纯属浪费。
const PROP_CELL = 32;
const propKey = (x, z) => `${Math.floor((x + HALF) / PROP_CELL)}:${Math.floor((z + HALF) / PROP_CELL)}`;

export function indexProps(props) {
  const grid = new Map();
  for (let index = 0; index < props.length; index += 1) {
    const prop = props[index];
    if (prop.far) continue;
    const key = propKey(prop.x, prop.z);
    const list = grid.get(key);
    if (list) list.push(index);
    else grid.set(key, [index]);
  }
  return grid;
}

/** 取车身周围九格里的道具索引。远景树不参与，它们既不挡路也挂不上钩。 */
export function nearbyProps(level, x, z) {
  const found = [];
  const cx = Math.floor((x + HALF) / PROP_CELL);
  const cz = Math.floor((z + HALF) / PROP_CELL);
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const list = level.propGrid.get(`${cx + dx}:${cz + dz}`);
      if (list) found.push(...list);
    }
  }
  return found;
}

export { SIZE as MAP_SIZE };
