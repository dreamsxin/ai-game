// 街区定性：给每个切出来的矩形定用地性质。
// 规则很朴素但足够像真城市——越靠核心越高越商务，河边和外围让给绿地和产业。
import {
  TERRAIN_WATER,
  ZONE_CORE,
  ZONE_HOUSING,
  ZONE_INDUSTRY,
  ZONE_OFFICE,
  ZONE_PARK,
  ZONE_SHOP,
  ZONE_WATER,
  zoneSpec,
} from './rules.js';
import { waterCount } from './terrain.js';

/** 归一化的「离城心多远」：0 是城心，1 是地图角落。 */
export function coreDistance(cols, rows, col, row) {
  const dx = (col - (cols - 1) / 2) / (cols / 2);
  const dy = (row - (rows - 1) / 2) / (rows / 2);
  // 除以 √2 之后地图四角刚好是 1，用地判定的阈值才有统一量纲。
  return Math.min(1, Math.hypot(dx, dy) / Math.SQRT2);
}

const zoneFor = (random, distance, coreRadius, waterRatio, area) => {
  // 一半以上是水就直接算水域街区，剩下的沿河地块优先留成绿地。
  if (waterRatio >= 0.5) return ZONE_WATER;
  if (waterRatio > 0.12) return random.chance(0.62) ? ZONE_PARK : ZONE_HOUSING;
  if (distance < coreRadius) return random.chance(0.82) ? ZONE_CORE : ZONE_OFFICE;
  if (distance < coreRadius * 2) {
    if (random.chance(0.34)) return ZONE_OFFICE;
    return random.chance(0.5) ? ZONE_SHOP : ZONE_HOUSING;
  }
  if (distance > 0.72) {
    // 外围的大块地留给产业园，小块地还是住宅，否则城市边上会变成一圈厂房。
    if (area >= 120 && random.chance(0.52)) return ZONE_INDUSTRY;
    return random.chance(0.12) ? ZONE_PARK : ZONE_HOUSING;
  }
  if (random.chance(0.09)) return ZONE_PARK;
  return random.chance(0.2) ? ZONE_SHOP : ZONE_HOUSING;
};

/**
 * 把 generateRoads 给出的矩形补上用地性质、地块中心和水面比例。
 * @returns {object[]} 带 zone 的街区列表，顺序与入参一致
 */
export function assignZones(random, blocks, terrain, cols, rows, coreRadius) {
  return blocks.map((block) => {
    const area = block.cols * block.rows;
    const water = area > 0 ? waterCount(terrain, cols, block) / area : 0;
    const centerCol = block.col + (block.cols - 1) / 2;
    const centerRow = block.row + (block.rows - 1) / 2;
    const distance = coreDistance(cols, rows, centerCol, centerRow);
    const zone = zoneFor(random, distance, coreRadius, water, area);
    return { ...block, area, water, centerCol, centerRow, distance, zone };
  });
}

/** 街区里可用的陆地格数：容积率和统计面板都按它算，水面不算用地。 */
export function landArea(block, terrain, cols) {
  let land = 0;
  for (let row = block.row; row < block.row + block.rows; row += 1) {
    for (let col = block.col; col < block.col + block.cols; col += 1) {
      if (terrain[row * cols + col] !== TERRAIN_WATER) land += 1;
    }
  }
  return land;
}

/** 按用地性质汇总街区数量与面积，给统计面板用。 */
export function zoneBreakdown(blocks) {
  const table = new Map();
  for (const block of blocks) {
    const spec = zoneSpec(block.zone);
    const entry = table.get(block.zone) ?? { zone: block.zone, name: spec.name, blocks: 0, area: 0 };
    entry.blocks += 1;
    entry.area += block.area;
    table.set(block.zone, entry);
  }
  return [...table.values()].sort((a, b) => b.area - a.area);
}
