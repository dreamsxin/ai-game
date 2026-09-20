import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BBOX, CENTER, MAP_WIDTH, MAP_DEPTH, lngToX, latToZ, xToLng, zToLat,
  toScene, sceneToLngLat, distanceKm, metersToUnits,
} from '../src/atlas/projection.js';
import { PROVINCE } from '../src/atlas/geo.js';

test('省界的每个点都落在 BBOX 里，且四周留了余量', () => {
  for (const [lng, lat] of PROVINCE) {
    assert.ok(lng > BBOX.minLng && lng < BBOX.maxLng, `经度 ${lng} 越界`);
    assert.ok(lat > BBOX.minLat && lat < BBOX.maxLat, `纬度 ${lat} 越界`);
  }
});

test('投影方向：北在 -Z、东在 +X', () => {
  assert.ok(lngToX(BBOX.maxLng) > lngToX(BBOX.minLng));
  assert.ok(latToZ(BBOX.maxLat) < latToZ(BBOX.minLat));
  assert.ok(Math.abs(lngToX(CENTER.lng)) < 1e-9);
  assert.ok(Math.abs(latToZ(CENTER.lat)) < 1e-9);
});

test('经纬度与场景坐标可以来回换算', () => {
  for (const [lng, lat] of [[115.89, 28.68], [114.94, 25.83], [118.06, 28.91]]) {
    const { x, z } = toScene(lng, lat);
    const back = sceneToLngLat(x, z);
    assert.ok(Math.abs(back.lng - lng) < 1e-9);
    assert.ok(Math.abs(back.lat - lat) < 1e-9);
    assert.ok(Math.abs(xToLng(x) - lng) < 1e-9);
    assert.ok(Math.abs(zToLat(z) - lat) < 1e-9);
  }
});

// 江西南北比东西长，地图不能被拉成横的，否则整个省的形状就错了
test('江西南北向比东西向长', () => {
  assert.ok(MAP_DEPTH > MAP_WIDTH, `深 ${MAP_DEPTH.toFixed(0)} 应大于宽 ${MAP_WIDTH.toFixed(0)}`);
});

test('两点距离与常识吻合', () => {
  const nanchang = { lng: 115.89, lat: 28.68 };
  const ganzhou = { lng: 114.94, lat: 25.83 };
  const jiujiang = { lng: 115.99, lat: 29.71 };
  const km = distanceKm(nanchang, ganzhou);
  assert.ok(km > 280 && km < 360, `南昌到赣州直线 ${km.toFixed(0)}km 不合理`);
  assert.ok(distanceKm(nanchang, jiujiang) < 140);
  assert.equal(Math.round(distanceKm(nanchang, nanchang)), 0);
});

test('高度换算带垂直夸张，1000 米比一度纬度小但看得出来', () => {
  const oneDegree = 340;
  const thousandMeters = metersToUnits(1000);
  assert.ok(thousandMeters > oneDegree * 0.05, '山太扁了，看不出地形');
  assert.ok(thousandMeters < oneDegree * 0.4, '山太高了，地图会变成刺猬');
});
