import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, routeById } from '../src/atlas/routes.js';
import { spotById } from '../src/atlas/spots.js';
import { routeDetail, allRouteDetails } from '../src/atlas/query.js';
import { distanceKm } from '../src/atlas/projection.js';

test('行程 id 唯一，routeById 能取回每一条', () => {
  const ids = ROUTES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(routeById(id).id, id);
});

test('每条行程的站点都存在、不重复，且够走一条线', () => {
  for (const r of ROUTES) {
    assert.ok(r.stops.length >= 4 || r.days <= 2, `${r.name} 只有 ${r.stops.length} 站`);
    assert.equal(new Set(r.stops).size, r.stops.length, `${r.name} 有重复站点`);
    for (const id of r.stops) assert.ok(spotById(id), `${r.name} 引用了不存在的景点 ${id}`);
  }
});

test('每条行程都有主题、节奏、季节说明和注意事项', () => {
  for (const r of ROUTES) {
    for (const key of ['name', 'theme', 'pace', 'months']) {
      assert.ok(String(r[key]).trim().length >= 6, `${r.name} 缺 ${key}`);
    }
    assert.ok(r.notes.length >= 3, `${r.name} 的注意事项不足`);
    assert.ok(Number.isInteger(r.days) && r.days >= 2 && r.days <= 10, `${r.name} 的天数 ${r.days} 不合理`);
    assert.ok(Number.isInteger(r.color), `${r.name} 缺配色`);
  }
});

test('routeDetail 把站点、分段和总里程都展开了', () => {
  for (const detail of allRouteDetails()) {
    assert.equal(detail.stops.length, routeById(detail.id).stops.length);
    assert.equal(detail.legs.length, detail.stops.length - 1);
    const sum = detail.legs.reduce((s, leg) => s + leg.km, 0);
    assert.equal(detail.totalKm, sum);
    for (const leg of detail.legs) {
      assert.equal(leg.km, Math.round(distanceKm(leg.from, leg.to)));
    }
  }
  assert.equal(routeDetail('不存在的线'), null);
});

// 行程按地理顺序排是硬要求：一天来回横跨全省的线，写得再好也没法走。
// 300 公里出头是江西境内一段可接受的长途（南昌到井冈山就是这个量级，高铁 + 大巴半天）；
// 再远就说明站点顺序排歪了。
test('没有一段跳得太远，也没有一条线在省内绕出天文数字', () => {
  for (const detail of allRouteDetails()) {
    for (const leg of detail.legs) {
      assert.ok(leg.km < 320, `${detail.name}：${leg.from.name} → ${leg.to.name} 直线 ${leg.km}km，太跳了`);
    }
    // 江西对角线约 600 公里，一条线的总里程不该超过它的两倍半
    assert.ok(detail.totalKm < 1500, `${detail.name} 总里程 ${detail.totalKm}km 明显在绕路`);
    assert.ok(detail.totalKm / detail.days < 220, `${detail.name} 平均每天 ${(detail.totalKm / detail.days).toFixed(0)}km，太赶`);
  }
});

// 行程是给人用的入口，几条招牌线必须覆盖到：湖、山、瓷、红色
test('推荐行程覆盖江西的几类招牌', () => {
  const all = allRouteDetails();
  const categories = new Set(all.flatMap((d) => d.stops.map((s) => s.category)));
  for (const need of ['mountain', 'water', 'village', 'kiln', 'red', 'relic']) {
    assert.ok(categories.has(need), `没有任何行程经过 ${need} 类景点`);
  }
  const regions = new Set(all.flatMap((d) => d.stops.map((s) => s.region)));
  assert.equal(regions.size, 5, '有的分区没有任何行程经过');
});
