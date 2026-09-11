import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, ZONE_WATER, scaleOf } from '../src/game/rules.js';
import { buildingAt, blockOf, findBuildings, generateCity } from '../src/game/city.js';

test('同 seed 同尺度长出同一座城', () => {
  const a = generateCity(4242, 'town');
  const b = generateCity(4242, 'town');
  assert.deepEqual(a.buildings, b.buildings);
  assert.deepEqual(a.streets, b.streets);
  assert.deepEqual([...a.roads], [...b.roads]);
  assert.deepEqual(a.stats.zones, b.stats.zones);
});

test('换尺度换城市规模，格网尺寸按预设走', () => {
  for (const scale of SCALES) {
    const city = generateCity(11, scale.id);
    assert.equal(city.cols, scale.cols);
    assert.equal(city.rows, scale.rows);
    assert.equal(city.scaleName, scale.name);
  }
  const town = generateCity(11, 'town');
  const metro = generateCity(11, 'metro');
  assert.ok(metro.buildings.length > town.buildings.length);
  assert.ok(metro.stats.areaSquareKm > town.stats.areaSquareKm);
});

test('未知尺度退回默认，不会崩', () => {
  const city = generateCity(1, '不存在的尺度');
  assert.equal(city.cols, scaleOf('city').cols);
});

test('逐格索引与楼宇一一对应，空地返回 null', () => {
  const city = generateCity(808, 'town');
  const sample = city.buildings[Math.floor(city.buildings.length / 2)];
  assert.equal(buildingAt(city, sample.col, sample.row), sample);
  assert.equal(
    buildingAt(city, sample.col + sample.cols - 1, sample.row + sample.rows - 1),
    sample,
  );
  assert.equal(buildingAt(city, -1, 0), null);
  assert.equal(buildingAt(city, 0, 0), null, '外环路上不该有楼');
});

test('每栋楼都挂在一个非水域街区上，且带地址', () => {
  const city = generateCity(99, 'town');
  assert.ok(city.buildings.length > 50);
  for (const building of city.buildings) {
    const block = blockOf(city, building);
    assert.ok(block, `楼 ${building.id} 找不到街区`);
    assert.notEqual(block.zone, ZONE_WATER);
    assert.equal(building.zone, block.zone);
    assert.ok(building.address.length > 1);
    assert.ok(building.name.length > 1);
  }
});

test('统计口径自洽：街区数、楼宇数、最高楼都对得上', () => {
  const city = generateCity(515, 'town');
  const { stats } = city;
  assert.equal(stats.buildings, city.buildings.length);
  assert.equal(stats.blocks, city.blocks.length);
  assert.equal(stats.streets, city.streets.length);
  assert.equal(stats.tallest.height, Math.max(...city.buildings.map((item) => item.height)));
  assert.ok(stats.roadKm > 0);
  assert.ok(stats.waterRatio >= 0 && stats.waterRatio < 1);
});

test('搜索命中楼名、门牌和用地性质，并按高度排序', () => {
  const city = generateCity(2048, 'town');
  const target = city.stats.tallest;
  const byName = findBuildings(city, target.name);
  assert.ok(byName.some((item) => item.id === target.id));
  for (let index = 1; index < byName.length; index += 1) {
    assert.ok(byName[index - 1].height >= byName[index].height);
  }
  assert.ok(findBuildings(city, target.address).some((item) => item.id === target.id));
  assert.ok(findBuildings(city, '居住区').every((item) => item.zone === 'housing'));
  assert.deepEqual(findBuildings(city, '   '), []);
  assert.equal(findBuildings(city, '住宅', 3).length, 3);
});

test('桥面记录在案：河上的路都被标成桥', () => {
  const city = generateCity(6161, 'city');
  for (const index of city.bridges) {
    assert.notEqual(city.roads[index], 0);
    assert.equal(city.terrain[index], 1);
  }
});
