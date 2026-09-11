// 高度场地形：生成、采样、以及车轮压出来的车辙。
// 车辙是这个游戏的核心记忆体——它只增不减，所以同一段泥路越走越难走。
import { MATERIALS, MAT_DIRT, MAT_GRASS, MAT_ROCK, MAT_SWAMP, MAT_WATER, materialIndexOf } from './rules.js';
import { fbm } from './random.js';
import { clamp, normalize } from './vec.js';

export const CELL = 4;
export const CELLS = 128;
export const SIZE = CELL * CELLS;
export const HALF = SIZE / 2;
const VERTS = CELLS + 1;

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 折线上距离 (x, z) 最近的点：返回距离、沿线弧长、以及该处的路面高度与材质。 */
export function nearestOnRoute(route, x, z) {
  let best = { distance: Infinity, along: 0, y: 0, material: MAT_DIRT, width: 6 };
  let travelled = 0;
  for (let index = 0; index + 1 < route.length; index += 1) {
    const a = route[index];
    const b = route[index + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-6 ? 0 : clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) {
      const segment = Math.sqrt(len2);
      best = {
        distance,
        along: travelled + segment * t,
        y: a.y + (b.y - a.y) * t,
        material: t < 0.5 ? a.material : b.material,
        width: a.width + (b.width - a.width) * t,
      };
    }
    travelled += Math.sqrt(len2);
  }
  return best;
}

export const routeLength = (route) => {
  let total = 0;
  for (let index = 0; index + 1 < route.length; index += 1) {
    total += Math.hypot(route[index + 1].x - route[index].x, route[index + 1].z - route[index].z);
  }
  return total;
};

/** 底噪高程。关卡只给幅度和尺度，具体山形由 seed 决定。 */
const baseHeight = (seed, x, z, plan) => {
  const scale = plan.scale ?? 90;
  const ridge = Math.sin((x / SIZE) * Math.PI * 1.4 + 0.6) * Math.cos((z / SIZE) * Math.PI * 1.1);
  const noise = fbm(seed, x / scale, z / scale, 4) - 0.5;
  const detail = fbm(seed + 77, x / 22, z / 22, 3) - 0.5;
  return noise * plan.amp * 2 + ridge * plan.relief + detail * 1.1;
};

/**
 * 造地形。先摊平底噪，再把路线压进去（路线自己的高程也从底噪采样后做过平滑，
 * 免得出现开不上去的台阶），最后按坡度和高度铺材质，把泥塘盖上去。
 */
export function createTerrain(seed, plan) {
  const height = new Float32Array(VERTS * VERTS);
  const material = new Uint8Array(CELLS * CELLS);
  const ruts = new Float32Array(CELLS * CELLS);
  const route = elevateRoute(seed, plan);

  for (let iz = 0; iz < VERTS; iz += 1) {
    const z = iz * CELL - HALF;
    for (let ix = 0; ix < VERTS; ix += 1) {
      const x = ix * CELL - HALF;
      const raw = baseHeight(seed, x, z, plan);
      const near = nearestOnRoute(route, x, z);
      // 路面中心完全服从路线高程，往外 2.5 倍宽度渐变回原始地形。
      const blend = 1 - smoothstep(near.width, near.width * 2.5, near.distance);
      height[iz * VERTS + ix] = raw + (near.y - raw) * blend;
    }
  }

  for (let cz = 0; cz < CELLS; cz += 1) {
    for (let cx = 0; cx < CELLS; cx += 1) {
      const x = (cx + 0.5) * CELL - HALF;
      const z = (cz + 0.5) * CELL - HALF;
      material[cz * CELLS + cx] = pickMaterial(seed, height, x, z, route, plan);
    }
  }

  return { seed, cells: CELLS, cell: CELL, size: SIZE, half: HALF, verts: VERTS, height, material, ruts, water: plan.water, route, version: 0 };
}

/** 路线高程：先贴地采样，再多轮平滑限制坡度，最后保证不淹在水里。
 *  标了 fixed 的点不参与平滑也不被抬高——渡口和引道的高度必须由关卡说了算。 */
function elevateRoute(seed, plan) {
  const route = plan.route.map((point) => ({
    ...point,
    width: point.width ?? 7,
    material: materialIndexOf(point.material ?? 'dirt'),
    y: point.y ?? baseHeight(seed, point.x, point.z, plan),
  }));
  for (let pass = 0; pass < 6; pass += 1) {
    for (let index = 1; index + 1 < route.length; index += 1) {
      if (route[index].fixed) continue;
      route[index].y = (route[index - 1].y + route[index].y * 2 + route[index + 1].y) / 4;
    }
  }
  for (const point of route) {
    // 涉水段允许低于水面，其它段抬到水面之上，否则整条路都在河里。
    if (point.fixed || point.material === MAT_WATER) continue;
    if (point.y < plan.water + 0.35) point.y = plan.water + 0.35;
  }
  return route;
}

/** 单点双线性读高度，直接读数组，供生成阶段内部使用。 */
function readHeight(height, x, z) {
  const gx = clamp((x + HALF) / CELL, 0, CELLS);
  const gz = clamp((z + HALF) / CELL, 0, CELLS);
  const ix = Math.min(CELLS - 1, Math.floor(gx));
  const iz = Math.min(CELLS - 1, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const h00 = height[iz * VERTS + ix];
  const h10 = height[iz * VERTS + ix + 1];
  const h01 = height[(iz + 1) * VERTS + ix];
  const h11 = height[(iz + 1) * VERTS + ix + 1];
  return (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
}

/** 材质排布：水面之下是水，路线走廊按路线材质，陡坡露岩，其余按噪声铺泥塘和草坡。 */
function pickMaterial(seed, height, x, z, route, plan) {
  const y = readHeight(height, x, z);
  if (y < plan.water) return MAT_WATER;
  const near = nearestOnRoute(route, x, z);
  if (near.distance < near.width) return near.material;

  const slope = Math.hypot(
    readHeight(height, x + CELL, z) - readHeight(height, x - CELL, z),
    readHeight(height, x, z + CELL) - readHeight(height, x, z - CELL),
  ) / (CELL * 2);
  if (slope > 0.55) return MAT_ROCK;

  // 洼地积泥：高度越接近水面、噪声越低的地方越烂。
  const wetness = fbm(seed + 311, x / 52, z / 52, 3);
  const lowland = 1 - smoothstep(plan.water, plan.water + 7, y);
  const soak = wetness * 0.6 + lowland * 0.6;
  if (soak > 0.82) return MAT_SWAMP;
  if (soak > 0.6) return materialIndexOf('mud');
  if (soak > 0.44) return MAT_DIRT;
  return MAT_GRASS;
}

/** 网格坐标（浮点）。越界的采样夹在边界上，车开出图也不会读到 undefined。 */
const gridOf = (terrain, x, z) => ({
  gx: clamp((x + terrain.half) / terrain.cell, 0, terrain.cells),
  gz: clamp((z + terrain.half) / terrain.cell, 0, terrain.cells),
});

export const cellIndexAt = (terrain, x, z) => {
  const { gx, gz } = gridOf(terrain, x, z);
  const cx = Math.min(terrain.cells - 1, Math.floor(gx));
  const cz = Math.min(terrain.cells - 1, Math.floor(gz));
  return cz * terrain.cells + cx;
};

export function heightAt(terrain, x, z) {
  return readHeight(terrain.height, x, z);
}

export function normalAt(terrain, x, z) {
  const step = terrain.cell * 0.75;
  const dx = heightAt(terrain, x + step, z) - heightAt(terrain, x - step, z);
  const dz = heightAt(terrain, x, z + step) - heightAt(terrain, x, z - step);
  return normalize({ x: -dx, y: step * 2, z: -dz });
}

export const materialAt = (terrain, x, z) => terrain.material[cellIndexAt(terrain, x, z)];
export const rutAt = (terrain, x, z) => terrain.ruts[cellIndexAt(terrain, x, z)];

/** 一次采样拿齐车轮需要的全部地面信息，物理循环里每轮只调一次。 */
export function groundAt(terrain, x, z) {
  const index = cellIndexAt(terrain, x, z);
  const materialIndex = terrain.material[index];
  return {
    y: heightAt(terrain, x, z),
    normal: normalAt(terrain, x, z),
    materialIndex,
    material: MATERIALS[materialIndex],
    rut: terrain.ruts[index],
    index,
  };
}

/** 这一格还能再陷多深：材质本身的松软度 + 已经压出来的车辙。 */
export function sinkCapacity(terrain, index) {
  const material = MATERIALS[terrain.material[index]];
  return material.sink + terrain.ruts[index];
}

/** 压车辙。只增不减，上限是材质的 ruts；打滑的轮子挖得比滚过的快得多。
 *  ruts 是 Float32Array，写回时会有舍入，所以要显式挡住「越写越浅」。 */
export function addRut(terrain, index, amount) {
  const cap = MATERIALS[terrain.material[index]].ruts;
  if (cap <= 0 || amount <= 0) return 0;
  const before = terrain.ruts[index];
  const after = Math.min(cap, before + amount);
  if (after <= before) return 0;
  terrain.ruts[index] = after;
  terrain.version += 1;
  return terrain.ruts[index] - before;
}

