import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES } from '../src/atlas/routes.js';
import { routeDetail, allRouteDetails } from '../src/atlas/query.js';
import { SPOT_IDS } from '../src/atlas/spots.js';
import { REGIONS } from '../src/atlas/taxonomy.js';

test('每条行程的站点都是真实存在的景点，且不重复', () => {
  for (const r of ROUTES) {
    assert.ok(r.stops.length >= 3 || r.days <= 2, `${r.name} 站点太少`);
    assert.equal(new Set(r.stops).size, r.stops.length, `${r.name} 有重复站点`);
    for (const id of r.stops) assert.ok(SPOT_IDS.includes(id), `${r.name} 引用了不存在的景点 ${id}`);
  }
});

test('行程都有主题、节奏说明和至少两条提醒', () => {
  for (const r of ROUTES) {
    for (const key of ['name', 'theme', 'pace', 'months']) {
      assert.ok(String(r[key]).trim().length >= 6, `${r.id} 缺 ${key}`);
    }
    assert.ok(r.notes.length >= 2, `${r.name} 提醒不足`);
    assert.ok(r.days >= 2 && r.days <= 10, `${r.name} 天数 ${r.days} 不合理`);
  }
});

// 行程是「顺路」的承诺：相邻两站不该出现一天跨半个省的跳跃，
// 也不该整条线加起来比绕浙江一圈还长。
test('相邻站点之间的直线距离不夸张，总里程可控', () => {
  for (const r of ROUTES) {
    const detail = routeDetail(r.id);
    for (const leg of detail.legs) {
      assert.ok(leg.km <= 170, `${r.name}：${leg.from.name} → ${leg.to.name} 直线 ${leg.km}km，太跳了`);
    }
    assert.ok(detail.totalKm <= 600, `${r.name} 总里程 ${detail.totalKm}km 偏长`);
    // 平均每天挪动的距离，应该和「每天一个主景点」的节奏相称
    assert.ok(detail.totalKm / r.days <= 110, `${r.name} 平均每天要挪 ${(detail.totalKm / r.days).toFixed(0)}km`);
  }
});

test('行程展开后能拿到景点对象和分段', () => {
  const detail = routeDetail('jiangnan');
  assert.equal(detail.stops.length, detail.legs.length + 1);
  assert.equal(detail.stops[0].name, '西湖');
  assert.ok(detail.totalKm > 0);
  assert.equal(routeDetail('不存在的线路'), null);
});

test('所有行程加起来覆盖了全部五个分区', () => {
  const covered = new Set();
  for (const detail of allRouteDetails()) {
    for (const stop of detail.stops) covered.add(stop.region);
  }
  for (const r of REGIONS) assert.ok(covered.has(r.id), `没有任何行程去过${r.name}`);
});

test('行程配色互不相同，地图上分得清', () => {
  const colors = ROUTES.map((r) => r.color);
  assert.equal(new Set(colors).size, colors.length);
});
