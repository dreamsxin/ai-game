import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, ROAD, TERRAIN_GRASS, TERRAIN_WATER, starsFor } from '../src/game/rules.js';
import { indexOf } from '../src/game/city.js';
import { generateCity } from '../src/game/terrain.js';

const recipe = LEVELS[0];

test('同一个 seed 长出同一张地图', () => {
  const a = generateCity(recipe, 99);
  const b = generateCity(recipe, 99);
  assert.deepEqual(Array.from(a.terrain), Array.from(b.terrain));
  assert.notDeepEqual(Array.from(a.terrain), Array.from(generateCity(recipe, 100).terrain));
});

test('地图尺寸按配方来，城门是左边界中间那一格路', () => {
  const city = generateCity(recipe, 7);
  assert.equal(city.cols, recipe.cols);
  assert.equal(city.terrain.length, recipe.cols * recipe.rows);
  assert.equal(city.entrance, indexOf(city, 0, Math.floor(recipe.rows / 2)));
  assert.equal(city.build[city.entrance], ROAD);
});

test('城门和它右手第一格必须是平地，开局不会被水堵死', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const city = generateCity(recipe, seed);
    const row = Math.floor(recipe.rows / 2);
    assert.equal(city.terrain[indexOf(city, 0, row)], TERRAIN_GRASS, `seed ${seed} 城门不是平地`);
    assert.equal(city.terrain[indexOf(city, 1, row)], TERRAIN_GRASS, `seed ${seed} 门口被堵`);
  }
});

test('水面和林地都长得出来，且不会淹掉整张图', () => {
  const city = generateCity(LEVELS[4], 12);
  const counts = Array.from(city.terrain).reduce((sum, terrain) => {
    sum[terrain] = (sum[terrain] ?? 0) + 1;
    return sum;
  }, {});
  assert.ok(counts[TERRAIN_WATER] > 0, '临港城应该有水');
  assert.ok(counts[TERRAIN_GRASS] > city.terrain.length * 0.5, '平地要占大头');
});

test('星级按 par 分档，达标本身不会被判失败', () => {
  assert.equal(starsFor(20, 20), 3);
  assert.equal(starsFor(28, 20), 2);
  assert.equal(starsFor(60, 20), 1);
});
