// 水系：一条从北岸走到南岸（或东西向）的河，用随机行走的中心线加半宽画出来。
// 河必须贯通两侧边界，否则城市里会出现一潭断头湖，看着就不像真地图。
import { TERRAIN_LAND, TERRAIN_WATER } from './rules.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * @returns {{ terrain: Uint8Array, river: null | { vertical: boolean, centers: number[] } }}
 */
export function generateTerrain(random, cols, rows, strength) {
  const terrain = new Uint8Array(cols * rows).fill(TERRAIN_LAND);
  if (!(strength > 0) || !random.chance(strength)) return { terrain, river: null };

  // 竖河沿 row 推进，横河沿 col 推进：两种朝向共用一套行走逻辑，只是索引换个方向。
  const vertical = random.chance(0.5);
  const along = vertical ? rows : cols;
  const across = vertical ? cols : rows;
  // 河宽 3~6 格，太窄在俯视图里会被桥盖掉。
  const halfWidth = random.range(1.5, 3);
  const margin = Math.ceil(halfWidth) + 2;
  let center = random.range(across * 0.28, across * 0.72);
  let drift = random.range(-0.6, 0.6);
  const centers = [];

  for (let step = 0; step < along; step += 1) {
    // 漂移量自己也在随机游走，河道才会出现大弯而不是锯齿。
    drift = clamp(drift + random.range(-0.22, 0.22), -0.85, 0.85);
    center = clamp(center + drift, margin, across - margin - 1);
    centers.push(center);
    const half = halfWidth + Math.sin(step * 0.22) * 0.5;
    const from = Math.max(0, Math.round(center - half));
    const to = Math.min(across - 1, Math.round(center + half));
    for (let lane = from; lane <= to; lane += 1) {
      const index = vertical ? step * cols + lane : lane * cols + step;
      terrain[index] = TERRAIN_WATER;
    }
  }
  return { terrain, river: { vertical, centers } };
}

export const isWater = (city, col, row) => (
  col >= 0 && col < city.cols && row >= 0 && row < city.rows
    ? city.terrain[row * city.cols + col] === TERRAIN_WATER
    : false
);

/** 矩形范围内的水面格数：街区定性和建筑落位都靠它避开河道。 */
export function waterCount(terrain, cols, rect) {
  let count = 0;
  for (let row = rect.row; row < rect.row + rect.rows; row += 1) {
    for (let col = rect.col; col < rect.col + rect.cols; col += 1) {
      if (terrain[row * cols + col] === TERRAIN_WATER) count += 1;
    }
  }
  return count;
}
