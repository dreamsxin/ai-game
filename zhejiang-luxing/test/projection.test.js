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
  assert.ok(latToZ(31.0) < latToZ(28.0), '纬度越高 z 越小');
  assert.ok(lngToX(122.0) > lngToX(119.0), '经度越大 x 越大');
  assert.equal(Math.abs(lngToX(CENTER.lng)), 0);
  assert.equal(Math.abs(latToZ(CENTER.lat)), 0);
});

// 经度方向不做 cos 收窄的话，浙江会被横向拉宽成一块饼，省界就不像了。
test('地图长宽比接近浙江的真实长宽比', () => {
  const realWidthKm = (BBOX.maxLng - BBOX.minLng) * 111.19 * Math.cos((CENTER.lat * Math.PI) / 180);
  const realDepthKm = (BBOX.maxLat - BBOX.minLat) * 111.19;
  const mapRatio = MAP_WIDTH / MAP_DEPTH;
  const realRatio = realWidthKm / realDepthKm;
  assert.ok(Math.abs(mapRatio - realRatio) < 0.01, `比例偏了：${mapRatio} vs ${realRatio}`);
});

test('高度做了垂直夸张但没有夸张到离谱', () => {
  const peak = metersToUnits(1929);
  assert.ok(peak > 20 && peak < 120, `最高峰在场景里是 ${peak.toFixed(1)} 个单位`);
  assert.ok(peak < MAP_DEPTH * 0.1, '山高不应该盖过地图本身的尺度');
});

test('直线距离和常识吻合', () => {
  const hz = spotById('xihu');
  const nb = spotById('tianyige');
  const km = distanceKm(hz, nb);
  assert.ok(km > 110 && km < 170, `杭州到宁波直线 ${km.toFixed(0)}km`);
  assert.ok(distanceKm(hz, hz) === 0);
  const nanji = spotById('nanji');
  assert.ok(distanceKm(hz, nanji) > 300, '杭州到南麂应该超过 300 公里');
});

test('所有景点都落在地图范围内', () => {
  for (const s of SPOTS) {
    const { x, z } = toScene(s.lng, s.lat);
    assert.ok(Math.abs(x) <= MAP_WIDTH / 2, `${s.name} 的 x 出图`);
    assert.ok(Math.abs(z) <= MAP_DEPTH / 2, `${s.name} 的 z 出图`);
  }
});
