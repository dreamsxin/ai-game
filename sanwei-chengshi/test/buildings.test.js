import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/game/random.js';
import { FLOOR_METERS, ZONE_CORE, ZONE_HOUSING, ZONE_WATER, zoneSpec } from '../src/game/rules.js';
import { floorArea, generateBuildings } from '../src/game/buildings.js';
import { nameStreets } from '../src/game/naming.js';

const COLS = 64;
const ROWS = 64;
const terrain = new Uint8Array(COLS * ROWS);
const streets = nameStreets(createRandom(1), [
  { level: 3, vertical: true, offset: 0, width: 3, span: ROWS, ring: true },
  { level: 2, vertical: false, offset: 20, width: 2, span: COLS, ring: false },
]);

const block = (zone, distance, extra = {}) => ({
  id: 0, col: 8, row: 8, cols: 16, rows: 16, depth: 3, zone, distance, ...extra,
});

test('同 seed 落出同一批楼', () => {
  const a = generateBuildings(createRandom(6), [block(ZONE_HOUSING, 0.5)], streets, terrain, COLS);
  const b = generateBuildings(createRandom(6), [block(ZONE_HOUSING, 0.5)], streets, terrain, COLS);
  assert.deepEqual(a, b);
  assert.ok(a.length > 0, '16×16 的住宅街区应该盖得出楼');
});

test('楼一定落在街区内并退让出人行道', () => {
  const buildings = generateBuildings(createRandom(15), [block(ZONE_HOUSING, 0.4)], streets, terrain, COLS);
  for (const building of buildings) {
    assert.ok(building.col >= 9, '西侧要留人行道');
    assert.ok(building.row >= 9, '北侧要留人行道');
    assert.ok(building.col + building.cols <= 23);
    assert.ok(building.row + building.rows <= 23);
  }
});

test('层数落在用地规定的区间内，高度按层高换算', () => {
  const buildings = generateBuildings(createRandom(31), [block(ZONE_CORE, 0.05)], streets, terrain, COLS);
  const [min, max] = zoneSpec(ZONE_CORE).floors;
  for (const building of buildings) {
    if (building.landmark) continue;
    assert.ok(building.floors >= min && building.floors <= max, `${building.floors} 层越界`);
    assert.equal(building.height, building.floors * FLOOR_METERS);
  }
});

test('越靠城心越高：同一种用地换个距离，平均层数明显不同', () => {
  const near = generateBuildings(createRandom(21), [block(ZONE_HOUSING, 0.05)], streets, terrain, COLS);
  const far = generateBuildings(createRandom(21), [block(ZONE_HOUSING, 0.95)], streets, terrain, COLS);
  const mean = (list) => list.reduce((sum, item) => sum + item.floors, 0) / list.length;
  assert.ok(mean(near) > mean(far) + 2, `${mean(near)} 应明显高于 ${mean(far)}`);
});

test('水域街区不落楼，水面上也不落楼', () => {
  assert.equal(
    generateBuildings(createRandom(3), [block(ZONE_WATER, 0.5)], streets, terrain, COLS).length,
    0,
  );
  const flooded = new Uint8Array(COLS * ROWS).fill(1);
  assert.equal(
    generateBuildings(createRandom(3), [block(ZONE_HOUSING, 0.5)], streets, flooded, COLS).length,
    0,
  );
});

test('核心区最高的一栋被标成地标', () => {
  const buildings = generateBuildings(
    createRandom(77),
    [block(ZONE_CORE, 0.05)],
    streets,
    new Uint8Array(COLS * ROWS),
    COLS,
  );
  const landmarks = buildings.filter((building) => building.landmark);
  assert.equal(landmarks.length, 1);
  assert.equal(Math.max(...buildings.map((item) => item.height)), landmarks[0].height);
  assert.ok(landmarks[0].name.endsWith('环球金融中心'));
});

test('总建面按占地 × 层数累加', () => {
  const single = [{ cols: 2, rows: 3, floors: 10 }];
  assert.equal(floorArea(single, 10), 2 * 3 * 100 * 10 / 10000);
});
