// 城市装配线：seed + 尺度 → 地形 → 路网 → 街区定性 → 楼宇落位 → 索引与统计。
// 这一层是纯数据，不认识 three.js；渲染层只读它，不写它。
import { CELL_METERS, DEFAULT_SCALE, TERRAIN_WATER, scaleOf, zoneSpec } from './rules.js';
import { createRandom } from './random.js';
import { generateTerrain } from './terrain.js';
import { bridgeCells, generateRoads, roadLength } from './roads.js';
import { assignZones, zoneBreakdown } from './blocks.js';
import { generateBuildings, floorArea } from './buildings.js';
import { nameStreets } from './naming.js';

/**
 * @param {number} seed
 * @param {string} scaleId SCALES 里的 id
 * @returns {object} 完整城市数据
 */
export function generateCity(seed, scaleId = DEFAULT_SCALE) {
  const scale = scaleOf(scaleId);
  const { cols, rows } = scale;
  const random = createRandom(seed);

  const { terrain, river } = generateTerrain(random, cols, rows, scale.river);
  const { roads, blocks: rects, segments } = generateRoads(random, cols, rows, scale);
  const streets = nameStreets(random, segments);
  const blocks = assignZones(random, rects, terrain, cols, rows, scale.coreRadius);
  const buildings = generateBuildings(random, blocks, streets, terrain, cols);

  const city = {
    seed,
    scale: scale.id,
    scaleName: scale.name,
    cols,
    rows,
    cellMeters: CELL_METERS,
    terrain,
    roads,
    river,
    streets,
    blocks,
    buildings,
    bridges: bridgeCells(roads, terrain),
    // 逐格记录「这格属于哪栋楼」：点选和悬停都靠它，避免每次都遍历全部楼宇。
    lookup: buildLookup(buildings, cols, rows),
  };
  city.stats = cityStats(city);
  return city;
}

function buildLookup(buildings, cols, rows) {
  const lookup = new Int32Array(cols * rows).fill(-1);
  for (const building of buildings) {
    for (let row = building.row; row < building.row + building.rows; row += 1) {
      for (let col = building.col; col < building.col + building.cols; col += 1) {
        lookup[row * cols + col] = building.id;
      }
    }
  }
  return lookup;
}

export const inBounds = (city, col, row) =>
  col >= 0 && col < city.cols && row >= 0 && row < city.rows;

/** 点到某一格上的楼；点空地返回 null。 */
export function buildingAt(city, col, row) {
  if (!inBounds(city, col, row)) return null;
  const id = city.lookup[row * city.cols + col];
  return id < 0 ? null : city.buildings[id];
}

export function blockOf(city, building) {
  return building ? city.blocks[building.blockId] ?? null : null;
}

export function cityStats(city) {
  const buildings = city.buildings;
  let tallest = null;
  for (const building of buildings) {
    if (!tallest || building.height > tallest.height) tallest = building;
  }
  let water = 0;
  for (let index = 0; index < city.terrain.length; index += 1) {
    if (city.terrain[index] === TERRAIN_WATER) water += 1;
  }
  const areaSquareKm = (city.cols * city.rows * city.cellMeters ** 2) / 1_000_000;
  return {
    areaSquareKm,
    buildings: buildings.length,
    blocks: city.blocks.length,
    streets: city.streets.length,
    roadKm: roadLength(city.roads, city.cellMeters),
    floorArea: floorArea(buildings, city.cellMeters),
    waterRatio: water / city.terrain.length,
    tallest,
    zones: zoneBreakdown(city.blocks),
  };
}

/** 关键词检索：楼名、门牌、用地性质都能命中，是「城市搜索框」的全部实现。 */
export function findBuildings(city, query, limit = 12) {
  const keyword = String(query ?? '').trim();
  if (!keyword) return [];
  const hits = [];
  for (const building of city.buildings) {
    const zoneName = zoneSpec(building.zone).name;
    if (
      building.name.includes(keyword)
      || building.address.includes(keyword)
      || building.category.includes(keyword)
      || zoneName.includes(keyword)
    ) {
      hits.push(building);
      if (hits.length >= limit * 4) break;
    }
  }
  // 高的排前面：搜「大厦」时先给地标，比按 id 顺序有用得多。
  hits.sort((a, b) => b.height - a.height);
  return hits.slice(0, limit);
}
