import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BBOX, CENTER, MAP_WIDTH, MAP_DEPTH, toScene, sceneToLngLat, lngToX, latToZ, metersToUnits, distanceKm,
} from '../src/atlas/projection.js';
import { SPOTS, spotById } from '../src/atlas/spots.js';

test('经纬度与场景坐标可以来回换算', () => {
  for (const s of SPOTS.slice(0, 8)) {
    const { x, z } = toScene(s.lng, s.lat);
    const back = sceneToLngLat(x, z);
    assert.ok(Math.abs(back.lng - s.lng) < 1e-9);
    assert.ok(Math.abs(back.lat - s.lat) < 1e-9);
  }
});

test('北在 -Z、东在 +X', () => {
  assert.ok(latToZ(28.9) < latToZ(27.5));
  assert.ok(lngToX(120.4) > lngToX(118.8));
  assert.equal(Math.abs(lngToX(CENTER.lng)), 0);
  assert.equal(Math.abs(latToZ(CENTER.lat)), 0);
});

test('地图长宽比接近丽水的真实长宽比', () => {
  const realW = (BBOX.maxLng - BBOX.minLng) * 111.19 * Math.cos((CENTER.lat * Math.PI) / 180);
  const realD = (BBOX.maxLat - BBOX.minLat) * 111.19;
  assert.ok(Math.abs(MAP_WIDTH / MAP_DEPTH - realW / realD) < 0.01);
});

// 《千里江山图》的山是竖起来的，垂直夸张要够；但也不能夸到山比地图还大。
test('垂直夸张够看得出山势，又不至于离谱', () => {
  const peak = metersToUnits(1929);
  assert.ok(peak > 60, `最高峰只有 ${peak.toFixed(0)} 个单位，山势会被摊平`);
  assert.ok(peak < MAP_DEPTH * 0.15, '山高不该盖过地图尺度');
  assert.ok(metersToUnits(0) === 0);
});

test('直线距离与常识吻合', () => {
  const lishui = spotById('nanminghu');
  const longquan = spotById('jianchi');
  const km = distanceKm(lishui, longquan);
  assert.ok(km > 60 && km < 110, `丽水到龙泉直线 ${km.toFixed(0)}km`);
  assert.ok(distanceKm(lishui, lishui) === 0);
  // 全市最远两处（庆元月山 ↔ 缙云岩下）应该在两百公里以内，丽水就这么大
  assert.ok(distanceKm(spotById('yueshan'), spotById('yanxia')) < 200);
});

test('所有景点都落在地图范围内', () => {
  for (const s of SPOTS) {
    const { x, z } = toScene(s.lng, s.lat);
    assert.ok(Math.abs(x) <= MAP_WIDTH / 2, `${s.name} 的 x 出图`);
    assert.ok(Math.abs(z) <= MAP_DEPTH / 2, `${s.name} 的 z 出图`);
  }
});
