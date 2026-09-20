// 行迹的完整性。query.test.js 只验证 routeDetail 能展开，
// 这里管的是数据本身说得通：一个人的线上不能混进别人的诗，
// 一条线上不能同一站走两遍，八条线的缎带颜色不能撞。

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, routeById } from '../src/atlas/routes.js';
import { spotById } from '../src/atlas/spots.js';
import { PALETTE } from '../src/atlas/taxonomy.js';
import { distanceKm } from '../src/atlas/projection.js';
import { isPlaced } from '../src/atlas/clusters.js';


test('行迹的 id 唯一，条数够撑起一个筛选器', () => {
  assert.ok(ROUTES.length >= 6, `只有 ${ROUTES.length} 条行迹`);
  assert.equal(new Set(ROUTES.map((r) => r.id)).size, ROUTES.length);
  for (const r of ROUTES) assert.equal(routeById(r.id), r);
  assert.equal(routeById('meiyouzhetiaoxian'), undefined);
});

test('每条线的字段都填齐了', () => {
  for (const r of ROUTES) {
    for (const key of ['name', 'poet', 'theme', 'pace']) {
      assert.equal(typeof r[key], 'string', `${r.id} 缺 ${key}`);
      assert.ok(r[key].trim().length > 0, `${r.id} 的 ${key} 是空的`);
    }
    assert.ok(r.notes.length >= 2 && r.notes.length <= 3, `${r.id} 的 notes 有 ${r.notes.length} 条`);
    for (const n of r.notes) assert.ok(n.trim().length >= 12, `${r.id} 有一条 note 太短`);
    assert.ok(r.pace.trim().length >= 8, `${r.id} 的读法太短`);
  }
});

test('站点都是真诗，且一条线上不走回头站', () => {
  for (const r of ROUTES) {
    assert.ok(r.stops.length >= 3, `${r.id} 只有 ${r.stops.length} 站`);
    assert.equal(new Set(r.stops).size, r.stops.length, `${r.id} 有重复站点`);
    for (const id of r.stops) assert.ok(spotById(id), `${r.id} 指向了不存在的诗 ${id}`);
  }
});

// 行迹要画成一条缎带、还要算里程，所以站点必须是落得住的诗。
// 把《静夜思》这类无定所的排进行迹，线会直接飞到坐标原点去。
test('行迹的站点都定得住地点', () => {
  for (const r of ROUTES) {
    for (const id of r.stops) {
      assert.ok(isPlaced(spotById(id)), `${r.id} 的 ${id} 没有坐标，画不进缎带`);
    }
  }
});


test('署了名的行迹，站站都是这个人的诗', () => {
  for (const r of ROUTES.filter((x) => x.poet !== '多人')) {
    for (const id of r.stops) {
      assert.equal(spotById(id).author, r.poet, `${r.id} 里 ${id} 不是${r.poet}写的`);
    }
  }
});

test('写「多人」的行迹确实是多人凑的', () => {
  for (const r of ROUTES.filter((x) => x.poet === '多人')) {
    const authors = new Set(r.stops.map((id) => spotById(id).author));
    assert.ok(authors.size >= 2, `${r.id} 写着多人，其实只有 ${[...authors]}`);
  }
});

test('缎带颜色取自矿物色谱，八条线互不撞色', () => {
  const mineral = new Set(Object.values(PALETTE));
  const used = ROUTES.map((r) => r.color);
  for (const c of used) assert.ok(mineral.has(c), `${c.toString(16)} 不在矿物色谱里`);
  assert.equal(new Set(used).size, used.length, '有两条行迹用了同一个颜色');
});

test('每条线都真的走出了路，不是在一个点上打转', () => {
  for (const r of ROUTES) {
    const stops = r.stops.map((id) => spotById(id));
    let span = 0;
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        span = Math.max(span, distanceKm(stops[i], stops[j]));
      }
    }
    // 门槛压到 50 公里是照最紧的那条线定的：金陵怀古七站从乌衣巷走到扬州也只摊开七十公里，
    // 它本来就是"同一片地方隔五百年再看一遍"，不该被当成数据出错
    assert.ok(span > 50, `${r.id} 首尾只差 ${span.toFixed(0)} 公里`);
  }
});


test('大部分诗都能从某条行迹上走到', () => {
  const onRoute = new Set(ROUTES.flatMap((r) => r.stops));
  assert.ok(onRoute.size >= 40, `只有 ${onRoute.size} 首诗在行迹上`);
});
