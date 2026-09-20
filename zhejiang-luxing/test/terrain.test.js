import test from 'node:test';
import assert from 'node:assert/strict';
import { elevationAt, buildHeightField, pointInPolygon, KIND } from '../src/atlas/terrain.js';
import { PROVINCE } from '../src/atlas/geo.js';
import { BBOX } from '../src/atlas/projection.js';

test('省界多边形能正确区分内外', () => {
  assert.ok(pointInPolygon(120.17, 30.27, PROVINCE), '杭州应在省内');
  assert.ok(pointInPolygon(119.65, 29.08, PROVINCE), '金华应在省内');
  assert.ok(!pointInPolygon(122.6, 30.4, PROVINCE), '东海海面应在省外');
  assert.ok(!pointInPolygon(117.0, 30.0, PROVINCE), '安徽方向应在省外');
});

test('同一个经纬度永远得到同一个高度（没有随机数）', () => {
  for (const [lng, lat] of [[120.17, 30.27], [119.17, 27.87], [122.2, 30.6]]) {
    const a = elevationAt(lng, lat);
    const b = elevationAt(lng, lat);
    assert.deepEqual(a, b);
  }
});

// 「七山一水两分田」：西南是山、东北是田。这条守的是整张地图的骨架没被改歪。
test('浙西南的山明显高于浙北平原', () => {
  const peak = elevationAt(119.17, 27.87).h; // 黄茅尖一带
  const plain = elevationAt(120.75, 30.75).h; // 嘉兴平原
  assert.ok(peak > 800, `西南山区只有 ${peak.toFixed(0)}m`);
  assert.ok(plain < 60, `浙北平原却有 ${plain.toFixed(0)}m`);
  assert.ok(peak > plain * 10);
});

test('海、湖、江分别被认出来', () => {
  assert.equal(elevationAt(122.95, 30.45).kind, KIND.SEA, '东海应是海');
  assert.equal(elevationAt(120.148, 30.245).kind, KIND.LAKE, '西湖应是湖');
  const qiandao = elevationAt(119.05, 29.60);
  assert.ok(qiandao.kind === KIND.LAKE || qiandao.h < 120, '千岛湖中心应是水面或湖中小岛');
});

test('海面在海平面以下，陆地在海平面以上', () => {
  assert.ok(elevationAt(122.95, 30.45).h < 0);
  assert.ok(elevationAt(120.148, 30.245).h < 0, '湖面也该低于海平面（水面靠这一点统一渲染）');
  assert.ok(elevationAt(120.17, 30.27).h > 0);
});

// 舟山群岛全部落在省界多边形之外，如果只按「多边形内才是陆地」判断，它们会沉进海里。
test('省界外的海岛仍然是陆地', () => {
  assert.ok(!pointInPolygon(122.39, 30.01, PROVINCE), '普陀山确实在省界多边形外');
  const putuo = elevationAt(122.39, 30.01);
  assert.equal(putuo.kind, KIND.LAND);
  assert.ok(putuo.h > 20, `普陀山高度只有 ${putuo.h.toFixed(0)}m`);
  assert.ok(elevationAt(122.13, 30.02).h > 20, '舟山本岛应是陆地');
});

test('千岛湖里真的有岛', () => {
  let islands = 0;
  let water = 0;
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 40; j++) {
      const lng = 118.87 + (0.36 * i) / 39;
      const lat = 29.44 + (0.32 * j) / 39;
      const { kind } = elevationAt(lng, lat);
      if (kind === KIND.LAKE) water += 1;
      else if (kind === KIND.LAND) islands += 1;
    }
  }
  assert.ok(water > 100, `湖面采样点只有 ${water} 个`);
  assert.ok(islands > 60, `湖中岛采样点只有 ${islands} 个，「千岛」就看不出来了`);
});

test('钱塘江沿线被切成水道', () => {
  const onRiver = elevationAt(119.95, 30.05); // 富阳江面
  assert.equal(onRiver.kind, KIND.RIVER);
  assert.ok(onRiver.h < 0);
  const offRiver = elevationAt(119.95, 30.25); // 往北 20 公里的山地
  assert.ok(offRiver.h > onRiver.h + 20, '离开江面应该明显抬起来');
});

test('采样成网格后同时有海、陆、水体，高度范围合理', () => {
  const field = buildHeightField(120, 100, BBOX);
  assert.equal(field.heights.length, 120 * 100);
  const kinds = new Set(field.kinds);
  assert.ok(kinds.has(KIND.SEA));
  assert.ok(kinds.has(KIND.LAND));
  assert.ok(kinds.has(KIND.LAKE) || kinds.has(KIND.RIVER));
  assert.ok(field.maxH > 900 && field.maxH < 3000, `最高点 ${field.maxH.toFixed(0)}m 不合理`);
  assert.ok(field.minH < -20);
});
