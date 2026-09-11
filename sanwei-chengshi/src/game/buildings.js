// 楼宇落位：街区先退让出人行道，再按用地对应的宅基地尺寸切格子，逐格决定盖不盖。
// 高度由「离城心多远」主导，随机只负责在区间里抖动——天际线才会从核心往外递减。
import {
  FLOOR_METERS, TERRAIN_WATER, ZONE_CORE, ZONE_SHOP, ZONE_WATER, zoneSpec,
} from './rules.js';
import { addressOf, buildingName } from './naming.js';

const SIDEWALK = 1;
// 楼间距：商业街区贴着街道连成一排，其余留一格缝，俯视图里才分得出单栋。
const gapFor = (zone) => (zone === ZONE_SHOP ? 0 : 1);

const lotFits = (terrain, cols, col, row, width, depth) => {
  for (let r = row; r < row + depth; r += 1) {
    for (let c = col; c < col + width; c += 1) {
      if (terrain[r * cols + c] === TERRAIN_WATER) return false;
    }
  }
  return true;
};

const floorsFor = (random, spec, distance) => {
  const [min, max] = spec.floors;
  if (max <= min) return min;
  // 距离衰减用平方，核心区的高层才不会被外围摊平。
  const pull = Math.max(0, 1 - distance) ** 2;
  const base = min + (max - min) * (0.18 + 0.82 * pull);
  const jitter = random.range(0.72, 1.18);
  return Math.max(min, Math.min(max, Math.round(base * jitter)));
};

/**
 * @param {object[]} blocks 已定性的街区
 * @returns {object[]} 楼宇列表，id 即数组下标，渲染层的 instanceId 直接对应它
 */
export function generateBuildings(random, blocks, streets, terrain, cols) {
  const buildings = [];
  for (const block of blocks) {
    if (block.zone === ZONE_WATER) continue;
    const spec = zoneSpec(block.zone);
    if (spec.coverage <= 0) continue;
    const inner = {
      col: block.col + SIDEWALK,
      row: block.row + SIDEWALK,
      cols: block.cols - SIDEWALK * 2,
      rows: block.rows - SIDEWALK * 2,
    };
    if (inner.cols < 2 || inner.rows < 2) continue;

    const lotCols = Math.min(spec.lot[0], inner.cols);
    const lotRows = Math.min(spec.lot[1], inner.rows);
    const gap = gapFor(block.zone);
    for (let row = inner.row; row + lotRows <= inner.row + inner.rows; row += lotRows) {
      for (let col = inner.col; col + lotCols <= inner.col + inner.cols; col += lotCols) {
        if (!random.chance(spec.coverage)) continue;
        if (!lotFits(terrain, cols, col, row, lotCols, lotRows)) continue;
        const width = Math.max(1, lotCols - gap);
        const depth = Math.max(1, lotRows - gap);
        const floors = floorsFor(random, spec, block.distance);
        const address = addressOf(streets, col, row);
        buildings.push({
          id: buildings.length,
          blockId: block.id,
          zone: block.zone,
          col,
          row,
          cols: width,
          rows: depth,
          floors,
          height: floors * FLOOR_METERS,
          name: buildingName(random, block.zone),
          category: spec.category,
          street: address.street,
          address: address.text,
          landmark: false,
        });
      }
    }
  }
  return markLandmark(buildings);
}

/** 城市要有一个「最高的那栋」：把核心区最高的一栋再抬一截，天际线就有了锚点。 */
function markLandmark(buildings) {
  let best = -1;
  for (const building of buildings) {
    if (building.zone !== ZONE_CORE) continue;
    if (best < 0 || building.floors > buildings[best].floors) best = building.id;
  }
  if (best < 0) return buildings;
  const landmark = buildings[best];
  landmark.floors = Math.round(landmark.floors * 1.3);
  landmark.height = landmark.floors * FLOOR_METERS;
  landmark.landmark = true;
  landmark.name = `${landmark.name.replace(/(大厦|中心|广场|国际中心|金融中心)$/, '')}环球金融中心`;
  return buildings;
}

/** 建筑总建筑面积（万平方米）：楼层数 × 占地，用来给城市规模一个体感数字。 */
export function floorArea(buildings, cellMeters) {
  const square = cellMeters * cellMeters;
  let total = 0;
  for (const building of buildings) {
    total += building.cols * building.rows * square * building.floors;
  }
  return total / 10000;
}
