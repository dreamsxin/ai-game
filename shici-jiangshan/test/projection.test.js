import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BBOX, CENTER, MAP_WIDTH, MAP_DEPTH,
  lngToX, latToZ, xToLng, zToLat,
  metersToUnits, wetToUnits, toScene, sceneToLngLat, distanceKm,
} from '../src/atlas/projection.js';

test('经纬度与场景坐标来回换算不丢精度', () => {
  for (const lng of [92.0, 100.5, 108.94, 116.4, 122.5]) {
    assert.ok(Math.abs(xToLng(lngToX(lng)) - lng) < 1e-9, `经度 ${lng} 往返失真`);
  }
  for (const lat of [18.0, 25.3, 34.26, 39.92, 42.0]) {
    assert.ok(Math.abs(zToLat(latToZ(lat)) - lat) < 1e-9, `纬度 ${lat} 往返失真`);
  }
  const { x, z } = toScene(112.45, 34.62);
  const back = sceneToLngLat(x, z);
  assert.ok(Math.abs(back.lng - 112.45) < 1e-9);
  assert.ok(Math.abs(back.lat - 34.62) < 1e-9);
});

test('图框中心落在场景原点', () => {
  const mid = toScene(CENTER.lng, CENTER.lat);
  assert.ok(Math.abs(mid.x) < 1e-9, `中心 x 偏了 ${mid.x}`);
  assert.ok(Math.abs(mid.z) < 1e-9, `中心 z 偏了 ${mid.z}`);
  assert.equal(CENTER.lng, (BBOX.minLng + BBOX.maxLng) / 2);
  assert.equal(CENTER.lat, (BBOX.minLat + BBOX.maxLat) / 2);
  // 四角对称地落在图幅的一半上
  assert.ok(Math.abs(lngToX(BBOX.maxLng) - MAP_WIDTH / 2) < 1e-6);
  assert.ok(Math.abs(latToZ(BBOX.minLat) - MAP_DEPTH / 2) < 1e-6);
});

// 北在 -Z 是这张图的朝向约定：幽州要在图的上方，儋州要在图的下方。
test('北在 -Z、东在 +X', () => {
  assert.ok(latToZ(39.92) < latToZ(34.26), '幽州应比长安更靠 -Z');
  assert.ok(latToZ(34.26) < latToZ(19.52), '长安应比儋州更靠 -Z');
  assert.ok(lngToX(122.5) > lngToX(92.0), '东边应在 +X');
});

test('直线距离与常识吻合', () => {
  const changan = { lng: 108.94, lat: 34.26 };
  const luoyang = { lng: 112.45, lat: 34.62 };
  const km = distanceKm(changan, luoyang);
  assert.ok(km > 260 && km < 380, `长安到洛阳算出来 ${km.toFixed(0)}km`);
  assert.equal(distanceKm(changan, changan), 0);
  const yangzhou = { lng: 119.44, lat: 32.39 };
  const zhenjiang = { lng: 119.44, lat: 32.19 };
  assert.ok(distanceKm(yangzhou, zhenjiang) < 40, '扬州与镇江只隔一条江');
  // 这张图对角线跨了大半个中国，几千公里量级
  assert.ok(distanceKm({ lng: 92, lat: 42 }, { lng: 122.5, lat: 18 }) > 2000);
});

test('高程换算单调，海底另走一条更陡的曲线', () => {
  assert.equal(metersToUnits(0), 0);
  let prev = -Infinity;
  for (const m of [0, 100, 500, 1500, 3000, 5000]) {
    const u = metersToUnits(m);
    assert.ok(u > prev, `${m}m 没有比上一档更高`);
    prev = u;
  }
  assert.ok(metersToUnits(2155) > 60, '华山这一档要看得出是一堵石壁');

  assert.ok(wetToUnits(-10) < 0, '负高程必须换成负的场景高度');
  assert.ok(wetToUnits(-300) < wetToUnits(-80), '越深应该越负');
  assert.ok(wetToUnits(-80) < wetToUnits(-12), '近岸浅水也得比更深处高');
  // 海岸线附近立刻沉下去：十几米的浅水已经有可见的落差
  assert.ok(wetToUnits(-12) < -1, `十二米浅水只沉了 ${wetToUnits(-12).toFixed(2)} 个单位`);
});
