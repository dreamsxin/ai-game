import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/game/random.js';
import { ROAD_LANE, ROAD_STREET, ROAD_TRUNK, ZONE_CORE, ZONE_HOUSING } from '../src/game/rules.js';
import { addressOf, buildingName, nameStreets } from '../src/game/naming.js';

const segments = [
  { level: ROAD_TRUNK, vertical: true, offset: 0, width: 3, span: 64, ring: true },
  { level: ROAD_STREET, vertical: false, offset: 24, width: 2, span: 64, ring: false },
  { level: ROAD_LANE, vertical: true, offset: 40, width: 1, span: 64, ring: false },
];

test('道路名带上等级后缀，主干道叫大道、支路叫街', () => {
  const streets = nameStreets(createRandom(4), segments);
  assert.ok(streets[0].name.endsWith('大道'));
  assert.ok(streets[1].name.endsWith('路'));
  assert.ok(streets[2].name.endsWith('街'));
  assert.deepEqual(streets.map((street) => street.id), [0, 1, 2]);
});

test('同 seed 街名一致，换 seed 会换名', () => {
  const a = nameStreets(createRandom(19), segments).map((street) => street.name);
  const b = nameStreets(createRandom(19), segments).map((street) => street.name);
  const c = nameStreets(createRandom(20), segments).map((street) => street.name);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('重名的路挂上「二段」区分，不会出现两条同名路', () => {
  const many = Array.from({ length: 40 }, (unused, index) => ({
    level: ROAD_STREET, vertical: true, offset: index, width: 1, span: 64, ring: false,
  }));
  const names = nameStreets(createRandom(8), many).map((street) => street.name);
  assert.equal(new Set(names).size, names.length, `出现重名：${names.join('、')}`);
});

test('门牌取最近的一条路，单双号分街两侧', () => {
  const streets = nameStreets(createRandom(2), segments);
  const near = addressOf(streets, 1, 30);
  assert.equal(near.street, streets[0].name, '离 offset=0 的竖路最近');
  assert.ok(near.text.endsWith('号'));
  const west = addressOf(streets, 39, 30);
  const east = addressOf(streets, 41, 30);
  assert.equal(west.street, streets[2].name);
  assert.notEqual(Number(west.text.match(/(\d+)号/)[1]) % 2, Number(east.text.match(/(\d+)号/)[1]) % 2);
});

test('没有任何道路时给一个兜底地址', () => {
  assert.deepEqual(addressOf([], 3, 3), { street: null, text: '未命名地块' });
});

test('楼名按用地取词，住宅和写字楼不共用后缀', () => {
  const random = createRandom(66);
  const core = Array.from({ length: 12 }, () => buildingName(random, ZONE_CORE));
  const housing = Array.from({ length: 12 }, () => buildingName(random, ZONE_HOUSING));
  assert.ok(core.every((name) => /(大厦|中心|广场)$/.test(name)), core.join('、'));
  assert.ok(housing.every((name) => /(小区|家园|花园|公寓|苑)$/.test(name)), housing.join('、'));
});
