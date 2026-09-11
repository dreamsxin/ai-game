import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR_FOREST_COST, ROAD, TERRAIN_FOREST, TERRAIN_GRASS, TERRAIN_WATER } from '../src/game/rules.js';
import {
  canDemolish,
  canPlace,
  createCity,
  demolish,
  indexOf,
  isServiced,
  place,
  roadReach,
} from '../src/game/city.js';

// 左上角是城门，测试里统一从这里起路。
const gated = (cols = 5, rows = 5) => {
  const city = createCity(cols, rows);
  city.entrance = indexOf(city, 0, 0);
  city.build[city.entrance] = ROAD;
  return city;
};

test('水面上盖不了东西，也不会被当成可建地', () => {
  const city = gated();
  city.terrain[indexOf(city, 2, 2)] = TERRAIN_WATER;
  const check = canPlace(city, 2, 2, 'house');
  assert.equal(check.ok, false);
  assert.match(check.reason, /水面/);
});

test('林地要多付清场费，建完就变成平地', () => {
  const city = gated();
  city.terrain[indexOf(city, 1, 1)] = TERRAIN_FOREST;
  const check = canPlace(city, 1, 1, 'house');
  assert.equal(check.ok, true);
  assert.equal(check.cost, 40 + CLEAR_FOREST_COST);
  const next = place(city, 1, 1, 'house');
  assert.equal(next.terrain[indexOf(city, 1, 1)], TERRAIN_GRASS);
  assert.equal(city.terrain[indexOf(city, 1, 1)], TERRAIN_FOREST, '原状态不能被改写');
});

test('已有建筑的格子要先拆，不能直接盖新的', () => {
  const city = place(gated(), 1, 1, 'house');
  assert.match(canPlace(city, 1, 1, 'shop').reason, /先拆掉住宅/);
  assert.match(canPlace(city, 1, 1, 'house').reason, /已经是住宅/);
});

test('城门那格路不能拆，其他建筑可以', () => {
  const city = place(gated(), 1, 0, ROAD);
  assert.equal(canDemolish(city, 0, 0).ok, false);
  assert.equal(canDemolish(city, 1, 0).ok, true);
  assert.equal(canDemolish(city, 3, 3).ok, false, '空地没有可拆的东西');
  assert.equal(demolish(city, 1, 0).build[indexOf(city, 1, 0)], '');
});

test('路网只认连回城门的那一片，孤立的路不通车', () => {
  let city = gated();
  city = place(city, 1, 0, ROAD);
  city = place(city, 2, 0, ROAD);
  city = place(city, 4, 4, ROAD);
  const reach = roadReach(city);
  assert.equal(reach[indexOf(city, 2, 0)], 1);
  assert.equal(reach[indexOf(city, 4, 4)], 0);
  assert.equal(isServiced(city, reach, 4, 4), false);
});

test('建筑贴着通车的路才算接入市政，斜角不算', () => {
  let city = gated();
  city = place(city, 1, 0, ROAD);
  city = place(city, 1, 1, 'house');
  city = place(city, 2, 1, 'shop');
  const reach = roadReach(city);
  assert.equal(isServiced(city, reach, 1, 1), true, '正下方贴着路');
  assert.equal(isServiced(city, reach, 2, 1), false, '只在斜角接壤不算通路');
});

test('公园不需要接路，孤零零摆着也算在运转', () => {
  const city = place(createCity(5, 5), 3, 3, 'park');
  assert.equal(isServiced(city, roadReach(city), 3, 3), true);
});

test('城门被路占着时路网才有起点', () => {
  const city = createCity(4, 4);
  assert.equal(roadReach(city)[0], 0, '城门还没铺路，路网是空的');
});
