import test from 'node:test';
import assert from 'node:assert/strict';
import { elevationAt, buildHeightField, pointInPolygon, nearestOnRiver, KIND } from '../src/atlas/terrain.js';
import { BOUNDARY, LAKES, RIVERS } from '../src/atlas/geo.js';
import { BBOX } from '../src/atlas/projection.js';

test('市界多边形能区分内外', () => {
  assert.ok(pointInPolygon(119.92, 28.45, BOUNDARY), '丽水城区应在市内');
  assert.ok(pointInPolygon(119.19, 27.75, BOUNDARY), '百山祖应在市内');
  assert.ok(!pointInPolygon(120.80, 28.50, BOUNDARY), '台州方向应在市外');
  assert.ok(!pointInPolygon(118.20, 28.60, BOUNDARY), '衢州方向应在市外');
});

test('同一经纬度永远同一高度', () => {
  for (const [lng, lat] of [[119.19, 27.89], [119.52, 28.13], [120.29, 28.14]]) {
    assert.deepEqual(elevationAt(lng, lat), elevationAt(lng, lat));
  }
});

// 「九山半水半分田」：全市地形整体偏高，河谷是少数。
test('全市抽样的平均海拔明显高于沿海平原量级', () => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 30; i++) {
    for (let j = 0; j < 30; j++) {
      const lng = 118.8 + (1.5 * i) / 29;
      const lat = 27.45 + (1.4 * j) / 29;
      if (!pointInPolygon(lng, lat, BOUNDARY)) continue;
      sum += elevationAt(lng, lat).h;
      n += 1;
    }
  }
  const mean = sum / n;
  assert.ok(n > 300, `市内采样点只有 ${n} 个`);
  assert.ok(mean > 350, `平均海拔只有 ${mean.toFixed(0)}m，山地特征没了`);
});

test('黄茅尖一带是全市最高的那一档', () => {
  const peak = elevationAt(119.19, 27.89).h;
  const valley = elevationAt(120.40, 28.12).h; // 温溪出境方向
  assert.ok(peak > 1500, `黄茅尖只有 ${peak.toFixed(0)}m`);
  assert.ok(valley < 260, `瓯江出境处却有 ${valley.toFixed(0)}m`);
});

// 这条守的是这张图和沿海地图最大的结构差别：丽水的水面各在不同海拔上，
// 不能用一张统一水面糊过去。
test('三处水面各自记住自己的海拔，互不相同', () => {
  const qianxia = elevationAt(119.92, 28.12);
  const yunhe = elevationAt(119.56, 28.22);
  const nanming = elevationAt(119.91, 28.44);
  for (const w of [qianxia, yunhe, nanming]) assert.equal(w.kind, KIND.LAKE);
  assert.equal(qianxia.surface, 160);
  assert.equal(yunhe.surface, 184);
  assert.equal(nanming.surface, 50);
  assert.ok(qianxia.h < qianxia.surface, '湖底应低于水面');
  assert.equal(new Set([qianxia.surface, yunhe.surface, nanming.surface]).size, 3);
});

test('瓯江被切成水道，且一路向下游降低', () => {
  const upstream = elevationAt(119.14, 28.07); // 龙泉
  const downstream = elevationAt(120.28, 28.14); // 青田
  assert.equal(upstream.kind, KIND.RIVER);
  assert.equal(downstream.kind, KIND.RIVER);
  assert.ok(upstream.surface > downstream.surface + 100, '上游水面应远高于下游');
  const off = elevationAt(119.14, 28.14); // 离开江面往北
  assert.ok(off.h > upstream.h + 60, '离开江面应明显抬起来');
});

test('沿河插值给出的水面高度落在两端之间', () => {
  const daxi = RIVERS.find((r) => r.id === 'daxi');
  const { surface } = nearestOnRiver(119.5, 28.21, daxi.pts);
  assert.ok(surface > 8 && surface < 200, `插值水面 ${surface}`);
  const head = nearestOnRiver(daxi.pts[0][0], daxi.pts[0][1], daxi.pts);
  assert.equal(Math.round(head.surface), daxi.pts[0][2]);
});

test('水库里留出了岛，岸线不是光滑椭圆', () => {
  const lake = LAKES.find((l) => l.id === 'qianxia');
  let water = 0;
  let island = 0;
  for (let i = 0; i < 36; i++) {
    for (let j = 0; j < 36; j++) {
      const lng = lake.lng - lake.rx + (2 * lake.rx * i) / 35;
      const lat = lake.lat - lake.ry + (2 * lake.ry * j) / 35;
      const { kind } = elevationAt(lng, lat);
      if (kind === KIND.LAKE) water += 1;
      else island += 1;
    }
  }
  assert.ok(water > 200, `库面采样点只有 ${water} 个`);
  assert.ok(island > 60, `库中岛／岸采样点只有 ${island} 个，淹没峡谷的碎岸线就没了`);
});

// 画卷不该在市界上被裁断：界外照样给地形，只是表现层洗淡一档。
test('市界之外仍然有地形，只是标记为界外', () => {
  const outside = elevationAt(120.75, 28.55);
  assert.equal(outside.inside, false);
  assert.ok(outside.h > 0, '界外也该有山，不能是一片空洞');
  assert.equal(elevationAt(119.92, 28.45).inside, true);
});

test('采样成网格后高度范围合理', () => {
  const field = buildHeightField(110, 100, BBOX);
  assert.equal(field.heights.length, 110 * 100);
  assert.ok(field.maxH > 1400 && field.maxH < 2600, `最高 ${field.maxH.toFixed(0)}m`);
  assert.ok(field.minH >= -80, `最低 ${field.minH.toFixed(0)}m，丽水没有海不该挖这么深`);
  assert.ok(new Set(field.kinds).size >= 2);
});
