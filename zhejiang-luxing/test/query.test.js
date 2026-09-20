import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSpots, summarize, nearbySpots, headline, EMPTY_FILTER } from '../src/atlas/query.js';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { REGIONS, CATEGORIES, SEASONS } from '../src/atlas/taxonomy.js';

test('空筛选返回全部景点', () => {
  assert.equal(filterSpots(EMPTY_FILTER).length, SPOTS.length);
  assert.equal(filterSpots().length, SPOTS.length);
});

test('按分区和类别筛选', () => {
  const north = filterSpots({ ...EMPTY_FILTER, regions: ['north'] });
  assert.ok(north.length > 0);
  assert.ok(north.every((s) => s.region === 'north'));

  const isles = filterSpots({ ...EMPTY_FILTER, categories: ['isle'] });
  assert.ok(isles.every((s) => s.category === 'isle'));

  const both = filterSpots({ ...EMPTY_FILTER, regions: ['isles'], categories: ['isle'] });
  assert.ok(both.length > 0);
  assert.ok(both.every((s) => s.region === 'isles' && s.category === 'isle'));
});

// 每个筛选维度的每一个选项都必须至少能选出一个景点，否则 UI 上会出现点了就空白的按钮。
test('任何单一筛选条件都不会筛出空结果', () => {
  for (const r of REGIONS) assert.ok(filterSpots({ ...EMPTY_FILTER, regions: [r.id] }).length > 0, r.name);
  for (const c of CATEGORIES) assert.ok(filterSpots({ ...EMPTY_FILTER, categories: [c.id] }).length > 0, c.name);
  for (const s of SEASONS) assert.ok(filterSpots({ ...EMPTY_FILTER, season: s.id }).length > 0, s.name);
});

test('季节筛选只留下该季节适游的景点', () => {
  const winter = filterSpots({ ...EMPTY_FILTER, season: 'winter' });
  const months = SEASONS.find((s) => s.id === 'winter').months;
  assert.ok(winter.every((s) => s.months.some((m) => months.includes(m))));
  assert.ok(winter.length < SPOTS.length, '冬天不该和全年一样多');
  assert.ok(winter.some((s) => s.id === 'anchang'), '腊月的安昌应该在冬季名单里');
});

test('关键词能搜到看点和 tips 里的词', () => {
  assert.ok(filterSpots({ ...EMPTY_FILTER, keyword: '日出' }).length > 0);
  assert.ok(filterSpots({ ...EMPTY_FILTER, keyword: '云海' }).length > 0);
  assert.ok(filterSpots({ ...EMPTY_FILTER, keyword: '海鲜' }).length > 0);
  const byCity = filterSpots({ ...EMPTY_FILTER, keyword: '舟山' });
  assert.ok(byCity.every((s) => JSON.stringify(s).includes('舟山')));
  assert.equal(filterSpots({ ...EMPTY_FILTER, keyword: '撒哈拉' }).length, 0);
});

test('统计数量能对上总数', () => {
  const sum = summarize(SPOTS);
  assert.equal(sum.total, SPOTS.length);
  assert.equal(Object.values(sum.byRegion).reduce((a, b) => a + b, 0), SPOTS.length);
  assert.equal(Object.values(sum.byCategory).reduce((a, b) => a + b, 0), SPOTS.length);
});

test('附近景点按距离升序，且不含自己', () => {
  const near = nearbySpots(spotById('xihu'), 4);
  assert.equal(near.length, 4);
  assert.ok(!near.some((n) => n.spot.id === 'xihu'));
  for (let i = 1; i < near.length; i++) assert.ok(near[i].km >= near[i - 1].km);
  // 西湖边上的灵隐一定比海那头的东极岛近
  assert.ok(nearbySpots(spotById('xihu'), 3).some((n) => n.spot.id === 'lingyin'));
});

test('HUD 摘要把筛选条件说清楚', () => {
  const filter = { regions: ['south'], categories: ['mountain'], season: 'autumn', keyword: '云海' };
  const spots = filterSpots(filter);
  const line = headline(filter, spots);
  assert.ok(line.includes('浙南秘境'));
  assert.ok(line.includes('名山奇峰'));
  assert.ok(line.includes('秋'));
  assert.ok(line.includes('云海'));
  assert.ok(line.includes(`${spots.length} 个景点`));
  assert.ok(headline(EMPTY_FILTER, SPOTS).includes('全省'));
});
