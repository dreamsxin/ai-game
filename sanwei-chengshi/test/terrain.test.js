import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/game/random.js';
import { TERRAIN_LAND, TERRAIN_WATER } from '../src/game/rules.js';
import { generateTerrain } from '../src/game/terrain.js';

const COLS = 64;
const ROWS = 64;

test('水系强度为 0 时是一座旱城', () => {
  const { terrain, river } = generateTerrain(createRandom(1), COLS, ROWS, 0);
  assert.equal(river, null);
  assert.ok(terrain.every((cell) => cell === TERRAIN_LAND));
});

test('同 seed 长出同一条河', () => {
  const a = generateTerrain(createRandom(77), COLS, ROWS, 1);
  const b = generateTerrain(createRandom(77), COLS, ROWS, 1);
  assert.deepEqual([...a.terrain], [...b.terrain]);
  assert.deepEqual(a.river, b.river);
});

test('河贯通两侧边界，不会变成断头湖', () => {
  const { terrain, river } = generateTerrain(createRandom(9), COLS, ROWS, 1);
  assert.ok(river, '强度 1 必然出河');
  const along = river.vertical ? ROWS : COLS;
  assert.equal(river.centers.length, along);
  for (let step = 0; step < along; step += 1) {
    const has = river.vertical
      ? Array.from({ length: COLS }, (unused, col) => terrain[step * COLS + col])
      : Array.from({ length: ROWS }, (unused, row) => terrain[row * COLS + step]);
    assert.ok(has.includes(TERRAIN_WATER), `第 ${step} 条断面上应有水`);
  }
});

test('河道留出岸线，不会贴到地图边缘', () => {
  const { terrain, river } = generateTerrain(createRandom(23), COLS, ROWS, 1);
  const across = river.vertical ? COLS : ROWS;
  for (const center of river.centers) {
    assert.ok(center > 2 && center < across - 3, `河心 ${center} 太贴边`);
  }
  assert.ok([...terrain].some((cell) => cell === TERRAIN_LAND), '不能整张图都是水');
});
