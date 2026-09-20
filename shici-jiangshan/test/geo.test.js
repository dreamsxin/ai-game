import test from 'node:test';
import assert from 'node:assert/strict';
import { LAND, ISLANDS, RELIEF, RIVERS, LAKES, TOWNS, PEAKS } from '../src/atlas/geo.js';
import { BBOX } from '../src/atlas/projection.js';

const inBox = (lng, lat, slop = 0) =>
  lng >= BBOX.minLng - slop && lng <= BBOX.maxLng + slop &&
  lat >= BBOX.minLat - slop && lat <= BBOX.maxLat + slop;

// 海岸线上唯一探出图框的是成山头（122.65°E，图框东界 122.5°E）：这个点在地理上是对的，
// 只是图框略窄，多出来的一小段会被裁掉，不影响"框外即海"的判定。
// 留 0.2° 的余量，同时数着越界的点不许超过一个，新的野点照样会被抓出来。
const COAST_SLOP = 0.2;

test('陆地外圈是一条够密、且完全落在图框里的环', () => {
  assert.ok(LAND.length > 60, `陆地外圈只有 ${LAND.length} 个点，海岸会成折线`);
  const overshoot = [];
  for (const [i, p] of LAND.entries()) {
    assert.ok(Array.isArray(p) && p.length === 2, `LAND[${i}] 不是 [lng, lat]`);
    const [lng, lat] = p;
    assert.equal(typeof lng, 'number');
    assert.equal(typeof lat, 'number');
    assert.ok(Number.isFinite(lng) && Number.isFinite(lat), `LAND[${i}] 有非数字`);
    assert.ok(inBox(lng, lat, COAST_SLOP), `LAND[${i}] (${lng}, ${lat}) 出了图框太多`);
    if (!inBox(lng, lat)) overshoot.push(`LAND[${i}] (${lng}, ${lat})`);
  }
  assert.ok(overshoot.length <= 1, `有 ${overshoot.length} 个点探出图框：${overshoot.join('、')}`);
});

test('每个岛都是闭合的一圈，且在图框内', () => {
  assert.ok(ISLANDS.length >= 2, '海南与台湾至少要有');
  for (const isle of ISLANDS) {
    assert.ok(isle.ring.length >= 8, `${isle.name} 只有 ${isle.ring.length} 个点，画不成岛`);
    for (const [lng, lat] of isle.ring) {
      assert.ok(inBox(lng, lat), `${isle.name} 有点 (${lng}, ${lat}) 出了图框`);
    }
  }
});

test('高程控制点字段齐备、数值在合理量级', () => {
  assert.ok(RELIEF.length > 100, `控制点只有 ${RELIEF.length} 个，全国尺度撑不起来`);
  for (const p of RELIEF) {
    assert.ok(typeof p.name === 'string' && p.name.trim().length > 0, '控制点缺名字');
    assert.equal(typeof p.lng, 'number');
    assert.equal(typeof p.lat, 'number');
    assert.equal(typeof p.h, 'number');
    assert.ok(inBox(p.lng, p.lat), `${p.name} (${p.lng}, ${p.lat}) 出了图框`);
    assert.ok(p.h > -400 && p.h < 5000, `${p.name} 的高程 ${p.h}m 离谱`);
  }
});

// 只给山峰，关中、成都、江汉这些盆地会被插值填成高原。
// 这条守的就是 geo.js 开头写的「成对给点」约定。
test('控制点里山与谷成对出现', () => {
  const high = RELIEF.filter((p) => p.h > 3000);
  const low = RELIEF.filter((p) => p.h < 100);
  assert.ok(high.length >= 5, `高于 3000m 的控制点只有 ${high.length} 个`);
  assert.ok(low.length >= 5, `低于 100m 的控制点只有 ${low.length} 个，盆地平原会被填平`);
  const sea = RELIEF.filter((p) => p.h < 0);
  assert.ok(sea.length >= 3, '海面也要给控制点，否则近海会翘起来');
});

// 水往低处流。运河有分水岭（南旺一段最高），水位不单调，要放它过。
test('每条自然河流的水面海拔沿流向只降不升', () => {
  const natural = RIVERS.filter((r) => !r.canal);
  assert.ok(natural.length >= 6);
  for (const river of natural) {
    for (let i = 1; i < river.pts.length; i++) {
      const up = river.pts[i - 1][2];
      const down = river.pts[i][2];
      assert.ok(down <= up, `${river.name} 第 ${i} 段水面从 ${up}m 涨到 ${down}m，水倒着流了`);
    }
  }
});

test('运河确实有一段分水岭，不是一条平水', () => {
  const canal = RIVERS.find((r) => r.canal);
  assert.ok(canal, '运河应标 canal');
  const rises = canal.pts.slice(1).filter((p, i) => p[2] > canal.pts[i][2]);
  assert.ok(rises.length > 0, '运河没有任何抬升，分水岭就不存在了');
});

test('每条河的节点都在图框内、点数够画成一条线', () => {
  for (const river of RIVERS) {
    assert.ok(river.pts.length >= 4, `${river.name} 只有 ${river.pts.length} 个节点`);
    assert.ok(river.width > 0, `${river.name} 没有宽度`);
    for (const p of river.pts) {
      assert.equal(p.length, 3, `${river.name} 的节点不是 [lng, lat, surface]`);
      assert.ok(inBox(p[0], p[1]), `${river.name} 有节点 (${p[0]}, ${p[1]}) 出了图框`);
      assert.ok(p[2] >= 0, `${river.name} 有节点水面 ${p[2]}m 低于海平面`);
    }
  }
});

test('长江与黄河的入海口水面就是海平面', () => {
  for (const id of ['changjiang', 'huanghe']) {
    const river = RIVERS.find((r) => r.id === id);
    const mouth = river.pts[river.pts.length - 1];
    assert.equal(mouth[2], 0, `${river.name} 入海口水面是 ${mouth[2]}m，不是 0`);
    assert.ok(river.pts[0][2] > 3000, `${river.name} 的源头只有 ${river.pts[0][2]}m，落差不够`);
  }
});

// 湘江注洞庭、赣江注鄱阳。终点飘在湖外的话，缎带会在湖边断一截。
test('湘江入洞庭、赣江入鄱阳，终点落在湖里', () => {
  const pairs = [['xiangjiang', 'dongting'], ['ganjiang', 'poyang']];
  for (const [riverId, lakeId] of pairs) {
    const river = RIVERS.find((r) => r.id === riverId);
    const lake = LAKES.find((l) => l.id === lakeId);
    const end = river.pts[river.pts.length - 1];
    const dx = (end[0] - lake.lng) / lake.rx;
    const dy = (end[1] - lake.lat) / lake.ry;
    const r = dx * dx + dy * dy;
    assert.ok(r <= 1, `${river.name} 终点到 ${lake.name} 的椭圆半径是 ${r.toFixed(2)}，落在湖外`);
  }
});

test('每个湖都有自己的水面与深度，湖心在图框内', () => {
  assert.ok(LAKES.length >= 5);
  for (const lake of LAKES) {
    assert.ok(inBox(lake.lng, lake.lat), `${lake.name} 湖心出了图框`);
    assert.ok(lake.surface > 0, `${lake.name} 的水面海拔是 ${lake.surface}m`);
    assert.ok(lake.depth > 0, `${lake.name} 没有深度`);
    assert.ok(lake.rx > 0 && lake.ry > 0, `${lake.name} 的椭圆半径非法`);
  }
  // 青海湖 3194m 与太湖 3m 不能共用一张水面
  assert.ok(new Set(LAKES.map((l) => l.surface)).size >= 5, '各湖水面几乎都该不一样');
});

test('古地名与名山都落在图框内，名山都够高', () => {
  assert.ok(TOWNS.length >= 20, `地名只有 ${TOWNS.length} 个，图上会太空`);
  for (const t of TOWNS) {
    assert.ok(typeof t.name === 'string' && t.name.trim().length > 0);
    assert.ok(inBox(t.lng, t.lat), `${t.name} (${t.lng}, ${t.lat}) 出了图框`);
  }
  assert.ok(TOWNS.some((t) => t.major), '总要有几座主城标大字');

  assert.ok(PEAKS.length >= 12, `名山只有 ${PEAKS.length} 座`);
  for (const p of PEAKS) {
    assert.ok(inBox(p.lng, p.lat), `${p.name} (${p.lng}, ${p.lat}) 出了图框`);
    assert.ok(p.h > 800, `${p.name} 只有 ${p.h}m，算不上诗里那座山`);
  }
});
