// 地形生成：湖泊和林地都用随机行走长成块，避免撒盐一样的噪点地图。
// 同一个 seed 必须长出同一张地图，所有随机都走 createRandom。
import { createRandom } from './random.js';
import { ROAD, TERRAIN_FOREST, TERRAIN_GRASS, TERRAIN_WATER } from './rules.js';
import { createCity, indexOf } from './city.js';

const BLOB_SEEDS = 3;

// 从若干个种子点随机行走涂色，直到涂满目标格数。
const growBlobs = (terrain, cols, rows, random, kind, ratio) => {
  const quota = Math.round(cols * rows * ratio);
  if (quota <= 0) return;
  let painted = 0;
  const seeds = Math.max(1, Math.min(BLOB_SEEDS, Math.ceil(quota / 6)));
  for (let seed = 0; seed < seeds && painted < quota; seed += 1) {
    let col = random.int(1, cols - 2);
    let row = random.int(1, rows - 2);
    const share = Math.ceil(quota / seeds);
    for (let step = 0; step < share * 6 && painted < quota; step += 1) {
      const index = row * cols + col;
      if (terrain[index] === TERRAIN_GRASS) {
        terrain[index] = kind;
        painted += 1;
      }
      // 行走时允许留在原地附近来回，块状才长得开。
      col = Math.max(0, Math.min(cols - 1, col + random.int(-1, 1)));
      row = Math.max(0, Math.min(rows - 1, row + random.int(-1, 1)));
    }
  }
};

/** 按关卡配方生成一座只有城门路的空城。 */
export function generateCity(recipe, seed) {
  const { cols, rows } = recipe;
  const random = createRandom(seed);
  const terrain = new Int8Array(cols * rows).fill(TERRAIN_GRASS);
  growBlobs(terrain, cols, rows, random, TERRAIN_WATER, recipe.water);
  growBlobs(terrain, cols, rows, random, TERRAIN_FOREST, recipe.forest);

  const city = createCity(cols, rows, terrain);
  // 城门固定在左边界中间：开局位置稳定，玩家不用先找路口。
  const gateRow = Math.floor(rows / 2);
  const gate = indexOf(city, 0, gateRow);
  city.entrance = gate;
  // 城门和它右手第一格必须是平地，否则开局就被水堵死。
  city.terrain[gate] = TERRAIN_GRASS;
  city.terrain[indexOf(city, 1, gateRow)] = TERRAIN_GRASS;
  city.build[gate] = ROAD;
  return city;
}
