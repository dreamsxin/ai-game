import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../src/atlas/routes.js';
import { routeDetail, allRouteDetails, filterSpots, summarize, nearbySpots, headline, EMPTY_FILTER } from '../src/atlas/query.js';
import { SPOTS, SPOT_IDS, spotById } from '../src/atlas/spots.js';
import { REGIONS, CATEGORIES, SEASONS } from '../src/atlas/taxonomy.js';

test('行程站点都存在且不重复', () => {
  for (const r of ROUTES) {
    assert.equal(new Set(r.stops).size, r.stops.length, `${r.name} 有重复站点`);
    for (const id of r.stops) assert.ok(SPOT_IDS.includes(id), `${r.name} 引用了不存在的 ${id}`);
    assert.ok(r.stops.length >= 3, `${r.name} 站点太少`);
  }
});

test('行程都有主题、节奏与至少三条提醒', () => {
  for (const r of ROUTES) {
    for (const key of ['name', 'theme', 'pace', 'months']) {
      assert.ok(String(r[key]).trim().length >= 6, `${r.id} 缺 ${key}`);
    }
    assert.ok(r.notes.length >= 3, `${r.name} 提醒不足`);
    assert.ok(r.days >= 2 && r.days <= 7, `${r.name} 天数 ${r.days} 不合理`);
  }
});

// 丽水县与县之间都是山路，实际车程常是直线的两倍，
// 所以每天的直线位移必须压得比沿海线路更低，否则这条线在现实里走不下来。
test('相邻站点不跳跃，且每天的位移压得住山路', () => {
  for (const r of ROUTES) {
    const detail = routeDetail(r.id);
    for (const leg of detail.legs) {
      assert.ok(leg.km <= 80, `${r.name}：${leg.from.name} → ${leg.to.name} 直线 ${leg.km}km，山路上太跳`);
    }
    assert.ok(detail.totalKm / r.days <= 45, `${r.name} 平均每天要挪 ${(detail.totalKm / r.days).toFixed(0)}km 直线`);
  }
});

test('行程展开后能拿到景点对象和分段', () => {
  const detail = routeDetail('jianci');
  assert.equal(detail.stops.length, detail.legs.length + 1);
  assert.equal(detail.stops[0].name, '龙泉青瓷小镇·上垟');
  assert.ok(detail.totalKm > 0);
  assert.equal(routeDetail('无此线路'), null);
});

test('所有行程加起来覆盖九个县市区里的大多数', () => {
  const covered = new Set();
  for (const detail of allRouteDetails()) for (const stop of detail.stops) covered.add(stop.region);
  assert.ok(covered.size >= 7, `只覆盖了 ${covered.size} 个县`);
  assert.equal(new Set(ROUTES.map((r) => r.color)).size, ROUTES.length, '行程配色应互不相同');
});

test('筛选：空条件返回全部，单条件都不会返回空', () => {
  assert.equal(filterSpots(EMPTY_FILTER).length, SPOTS.length);
  for (const r of REGIONS) assert.ok(filterSpots({ ...EMPTY_FILTER, regions: [r.id] }).length > 0, r.name);
  for (const c of CATEGORIES) assert.ok(filterSpots({ ...EMPTY_FILTER, categories: [c.id] }).length > 0, c.name);
  for (const s of SEASONS) assert.ok(filterSpots({ ...EMPTY_FILTER, season: s.id }).length > 0, s.name);
});

test('关键词能搜到看点与 tips 里的词', () => {
  for (const kw of ['云海', '廊桥', '青瓷', '梯田', '畲']) {
    assert.ok(filterSpots({ ...EMPTY_FILTER, keyword: kw }).length > 0, `搜不到「${kw}」`);
  }
  assert.equal(filterSpots({ ...EMPTY_FILTER, keyword: '撒哈拉' }).length, 0);
});

test('统计能对上总数，附近景点按距离升序', () => {
  const sum = summarize(SPOTS);
  assert.equal(Object.values(sum.byRegion).reduce((a, b) => a + b, 0), SPOTS.length);
  assert.equal(Object.values(sum.byCategory).reduce((a, b) => a + b, 0), SPOTS.length);
  const near = nearbySpots(spotById('laojie'), 3);
  assert.ok(!near.some((n) => n.spot.id === 'laojie'));
  for (let i = 1; i < near.length; i++) assert.ok(near[i].km >= near[i - 1].km);
  assert.ok(near.some((n) => n.spot.region === 'songyang'), '松阳老城附近应该还是松阳的村子');
});

test('题跋摘要把筛选条件说清楚', () => {
  const filter = { regions: ['qingyuan'], categories: ['village'], season: 'autumn', keyword: '廊桥' };
  const line = headline(filter, filterSpots(filter));
  assert.ok(line.includes('庆元'));
  assert.ok(line.includes('古村人家'));
  assert.ok(line.includes('秋'));
  assert.ok(line.includes('廊桥'));
  assert.ok(headline(EMPTY_FILTER, SPOTS).includes('全市九县'));
});
