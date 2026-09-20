import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pointInPolygon, isLand, elevationAt, buildHeightField, nearestOnRiver, distToCoast, KIND,
} from '../src/atlas/terrain.js';
import { RIVERS } from '../src/atlas/geo.js';
import { BBOX } from '../src/atlas/projection.js';

const h = (lng, lat) => elevationAt(lng, lat).h;

test('同一经纬度永远同一结果', () => {
  for (const [lng, lat] of [[108.94, 34.26], [116.0, 29.72], [122.2, 30.0], [94.0, 32.0]]) {
    assert.deepEqual(elevationAt(lng, lat), elevationAt(lng, lat));
  }
});

// 诗人真正待着的地方是盆地和河谷。这几处要是被插值抬成高原，整张图就没有层次。
test('名城的高程落在常识范围里', () => {
  const cases = [
    ['长安', 108.94, 34.26, 200, 900],
    ['洛阳', 112.45, 34.62, 40, 400],
    ['成都', 104.07, 30.67, 300, 900],
    ['幽州大都', 116.4, 39.92, 0, 300],
    ['儋州', 109.56, 19.52, 0, 200],
  ];
  for (const [name, lng, lat, lo, hi] of cases) {
    const v = h(lng, lat);
    assert.ok(v > lo && v < hi, `${name} 算出 ${v.toFixed(0)}m，不在 ${lo}..${hi} 之间`);
  }
});

test('名山确实立得起来', () => {
  assert.ok(h(110.08, 34.48) > 1200, `华山只有 ${h(110.08, 34.48).toFixed(0)}m`);
  assert.ok(h(117.1, 36.25) > 1000, `泰山只有 ${h(117.1, 36.25).toFixed(0)}m`);
  assert.ok(h(103.33, 29.52) > 2000, `峨眉只有 ${h(103.33, 29.52).toFixed(0)}m`);
  assert.ok(h(107.8, 33.95) > 2500, `太白只有 ${h(107.8, 33.95).toFixed(0)}m`);
});

test('青藏东缘明显高过中原', () => {
  const tibet = h(94.0, 32.0);
  const zhongyuan = h(113.6, 34.75);
  assert.ok(tibet > 3500, `青藏东缘只有 ${tibet.toFixed(0)}m`);
  assert.ok(tibet > zhongyuan + 3000, `青藏与中原只差 ${(tibet - zhongyuan).toFixed(0)}m`);
});

test('海里的点标成海且在海平面以下', () => {
  for (const [name, lng, lat] of [['东海', 122.2, 30.0], ['南海', 114.0, 19.5]]) {
    const s = elevationAt(lng, lat);
    assert.equal(s.kind, KIND.SEA, `${name} 没被判成海`);
    assert.ok(s.h < 0, `${name} 的高程是 ${s.h.toFixed(0)}m`);
    assert.equal(s.surface, 0, `${name} 的水面不是海平面`);
    assert.ok(!isLand(lng, lat));
  }
});

// 海岸不能只是一道色界：离岸越远要越深，低角度看过去才有厚度。
test('离岸越远越深', () => {
  const near = elevationAt(121.95, 30.3);
  const far = elevationAt(122.2, 30.0);
  assert.equal(near.kind, KIND.SEA);
  assert.equal(far.kind, KIND.SEA);
  assert.ok(distToCoast(122.2, 30.0) > distToCoast(121.95, 30.3), '远点应该真的离岸更远');
  assert.ok(far.h < near.h, `远处 ${far.h.toFixed(0)}m 并没有比近岸 ${near.h.toFixed(0)}m 更深`);
});

test('海南与台湾是陆地，不是海上的空洞', () => {
  for (const [name, lng, lat] of [['海南岛', 109.8, 19.3], ['台湾中部', 121.0, 23.6]]) {
    assert.ok(isLand(lng, lat), `${name} 被判成海了`);
    const s = elevationAt(lng, lat);
    assert.ok(s.h > 0, `${name} 的高程是 ${s.h.toFixed(0)}m`);
    assert.notEqual(s.kind, KIND.SEA);
  }
});

// LAND 这一圈走完海岸后沿图框闭合，塞外与青藏才不会掉到"多边形之外"变成海。
test('塞外与图框外侧不会被误判成海', () => {
  for (const [name, lng, lat] of [['河西走廊', 100.0, 40.0], ['青藏', 95.0, 35.0]]) {
    assert.ok(isLand(lng, lat), `${name} 被判成海了`);
    assert.ok(h(lng, lat) > 0, `${name} 的高程是 ${h(lng, lat).toFixed(0)}m`);
  }
});

test('沿河插值的水面落在两端之间', () => {
  const chang = RIVERS.find((r) => r.id === 'changjiang');
  const head = nearestOnRiver(chang.pts[0][0], chang.pts[0][1], chang.pts);
  assert.equal(Math.round(head.surface), chang.pts[0][2]);
  const mid = nearestOnRiver(114.3, 30.56, chang.pts);
  assert.ok(mid.surface > 0 && mid.surface < 60, `武昌一带插值水面 ${mid.surface.toFixed(1)}m`);
});

test('河面不高过两岸：高原上不会垒出一条比地面还高的堤', () => {
  // 采样点取到 0.45 度外，那里已经出了河谷；比的是"河床比周围一带高出多少"。
  // 门槛留 200 米是因为地形本身有坡：黄河出青海那一段两岸陡降，
  // 河床本来就比五十公里外的均高再高一百六。出事那次是高出七百八十米 —— 一条堤。
  const off = 0.45;
  for (const river of RIVERS) {
    for (const [lng, lat] of river.pts) {
      const bed = elevationAt(lng, lat).h;
      const around = [[lng + off, lat], [lng - off, lat], [lng, lat + off], [lng, lat - off]]
        .map(([a, b]) => elevationAt(a, b))
        .filter((s) => s.kind === KIND.LAND)
        .map((s) => s.h);
      if (!around.length) continue;
      const mean = around.reduce((s, v) => s + v, 0) / around.length;
      assert.ok(
        bed - mean < 200,
        `${river.id} 在 ${lng},${lat} 的河床比周围高出 ${(bed - mean).toFixed(0)}m`,
      );
    }
  }
});


test('采样成网格后四类地物都在，高低都有', () => {

  const field = buildHeightField(60, 50, BBOX);
  assert.equal(field.heights.length, 60 * 50);
  assert.equal(field.kinds.length, 60 * 50);
  assert.equal(field.cols, 60);
  assert.equal(field.rows, 50);
  assert.ok(field.maxH > 3000, `最高只有 ${field.maxH.toFixed(0)}m`);
  assert.ok(field.minH < 0, `最低只有 ${field.minH.toFixed(0)}m，海没挖出来`);
  const kinds = new Set(field.kinds);
  assert.ok(kinds.has(KIND.LAND), '网格里没有陆地');
  assert.ok(kinds.has(KIND.SEA), '网格里没有海');
});

test('多边形内外判定正确', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.ok(pointInPolygon(5, 5, square));
  assert.ok(pointInPolygon(0.1, 9.9, square));
  assert.ok(!pointInPolygon(-1, 5, square));
  assert.ok(!pointInPolygon(11, 5, square));
  assert.ok(!pointInPolygon(5, -0.5, square));
  assert.ok(!pointInPolygon(5, 10.5, square));
});
