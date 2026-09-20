import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { REGIONS, CATEGORIES } from '../src/atlas/taxonomy.js';
import { filterSpots, summarize, nearbySpots, headline, routeDetail, EMPTY_FILTER } from '../src/atlas/query.js';

test('空筛选返回全部景点', () => {
  assert.equal(filterSpots(EMPTY_FILTER).length, SPOTS.length);
  assert.equal(filterSpots().length, SPOTS.length);
});

test('按分区筛选', () => {
  const list = filterSpots({ ...EMPTY_FILTER, regions: ['south'] });
  assert.ok(list.length >= 5);
  assert.ok(list.every((s) => s.region === 'south'));
});

test('按类别筛选，多选是并集', () => {
  const kiln = filterSpots({ ...EMPTY_FILTER, categories: ['kiln'] });
  const both = filterSpots({ ...EMPTY_FILTER, categories: ['kiln', 'red'] });
  assert.ok(kiln.length >= 3);
  assert.ok(both.length > kiln.length);
  assert.ok(both.every((s) => s.category === 'kiln' || s.category === 'red'));
});

test('季节筛选把不在季的景点挡掉', () => {
  const winter = filterSpots({ ...EMPTY_FILTER, season: 'winter' });
  assert.ok(winter.some((s) => s.id === 'poyang'), '冬天正是鄱阳湖看候鸟的季节');
  assert.ok(!winter.some((s) => s.id === 'wugongshan'), '武功山冬季常封山，不该出现在冬季清单里');
  const summer = filterSpots({ ...EMPTY_FILTER, season: 'summer' });
  assert.ok(!summer.some((s) => s.id === 'poyang'), '丰水期的鄱阳湖没有候鸟可看');
});

// 关键词搜的是全文（看点和 tips 都算），这样「晒秋」「云海」「窑」这种词才找得到东西
test('关键词能命中看点与 tips 里的词', () => {
  const kw = (keyword) => filterSpots({ ...EMPTY_FILTER, keyword }).map((s) => s.id);
  assert.ok(kw('晒秋').includes('huangling'));
  assert.ok(kw('云海').length >= 3);
  assert.ok(kw('候鸟').includes('poyang'));
  assert.ok(kw('围屋').includes('weiwu'));
  assert.ok(kw('柴窑').includes('taoyangli'));
  assert.equal(kw('阿尔卑斯').length, 0);
});

test('筛选条件可以叠加', () => {
  const list = filterSpots({ regions: ['northeast'], categories: ['village'], season: 'autumn', keyword: '晒秋' });
  assert.ok(list.length >= 1);
  assert.ok(list.every((s) => s.region === 'northeast' && s.category === 'village'));
});

test('summarize 的计数与输入一致', () => {
  const stats = summarize(SPOTS);
  assert.equal(stats.total, SPOTS.length);
  assert.equal(REGIONS.reduce((n, r) => n + stats.byRegion[r.id], 0), SPOTS.length);
  assert.equal(CATEGORIES.reduce((n, c) => n + stats.byCategory[c.id], 0), SPOTS.length);
  const only = summarize(filterSpots({ ...EMPTY_FILTER, regions: ['west'] }));
  assert.equal(only.byRegion.lake, 0);
});

test('nearbySpots 给出最近的几个，且不含自己', () => {
  const near = nearbySpots(spotById('tengwangge'), 3);
  assert.equal(near.length, 3);
  assert.ok(near.every((n) => n.spot.id !== 'tengwangge'));
  assert.ok(near[0].km <= near[1].km && near[1].km <= near[2].km);
  // 南昌城内的几处互相都在几公里内
  assert.ok(near[0].km < 20, `最近的一个却有 ${near[0].km}km`);
  const ids = near.map((n) => n.spot.id);
  assert.ok(ids.includes('bayi') || ids.includes('wanshougong'));
});

test('headline 说清当前范围和数量', () => {
  assert.match(headline(EMPTY_FILTER, SPOTS), /全省/);
  assert.match(headline(EMPTY_FILTER, SPOTS), new RegExp(`${SPOTS.length} 个景点`));
  const line = headline({ regions: ['northeast'], categories: ['kiln'], season: 'autumn', keyword: ' 窑 ' }, []);
  assert.match(line, /赣东北/);
  assert.match(line, /瓷都窑火/);
  assert.match(line, /秋/);
  assert.match(line, /「窑」/);
});

test('routeDetail 的站点顺序与 routes.js 一致', () => {
  const detail = routeDetail('hongse');
  assert.deepEqual(detail.stops.map((s) => s.id), ['bayi', 'jinggangshan', 'ganzhou-gucheng', 'yudu', 'ruijin']);
  assert.ok(detail.totalKm > 200);
});
