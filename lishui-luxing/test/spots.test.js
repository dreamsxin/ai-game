import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { REGIONS, CATEGORIES } from '../src/atlas/taxonomy.js';
import { BBOX } from '../src/atlas/projection.js';
import { BOUNDARY } from '../src/atlas/geo.js';
import { pointInPolygon } from '../src/atlas/terrain.js';

const REGION_IDS = REGIONS.map((r) => r.id);
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

test('景点 id 唯一，spotById 能取回每一个', () => {
  const ids = SPOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(spotById(id).id, id);
});

// 这条最要紧：坐标错了整张图就是错的，而且要落在丽水市界之内。
test('每个景点都落在丽水市界内', () => {
  for (const s of SPOTS) {
    assert.ok(s.lng > BBOX.minLng && s.lng < BBOX.maxLng, `${s.name} 经度越界`);
    assert.ok(s.lat > BBOX.minLat && s.lat < BBOX.maxLat, `${s.name} 纬度越界`);
    assert.ok(pointInPolygon(s.lng, s.lat, BOUNDARY), `${s.name} 落在市界之外`);
  }
});

test('九个县市区都有景点，类别词表也都用上了', () => {
  for (const s of SPOTS) {
    assert.ok(REGION_IDS.includes(s.region), `${s.name} 的分区非法`);
    assert.ok(CATEGORY_IDS.includes(s.category), `${s.name} 的类别非法`);
  }
  for (const id of REGION_IDS) assert.ok(SPOTS.some((s) => s.region === id), `${id} 没有景点`);
  for (const id of CATEGORY_IDS) assert.ok(SPOTS.some((s) => s.category === id), `类别 ${id} 没有景点`);
});

test('每处都有至少 3 条看点、3 条 tips，没有空字段', () => {
  for (const s of SPOTS) {
    assert.ok(s.highlights.length >= 3, `${s.name} 看点不足`);
    assert.ok(s.tips.length >= 3, `${s.name} tips 不足`);
    for (const line of [...s.highlights, ...s.tips]) {
      assert.ok(line.trim().length >= 10, `${s.name} 有过短的条目：${line}`);
    }
    for (const key of ['name', 'place', 'badge', 'stay', 'season', 'ticket', 'reach']) {
      assert.ok(String(s[key]).trim().length > 0, `${s.name} 缺 ${key}`);
    }
  }
});

test('适游月份合法且不重复', () => {
  for (const s of SPOTS) {
    assert.ok(s.months.length > 0, `${s.name} 没有适游月份`);
    assert.equal(new Set(s.months).size, s.months.length, `${s.name} 月份重复`);
    for (const m of s.months) assert.ok(Number.isInteger(m) && m >= 1 && m <= 12, `${s.name} 月份 ${m} 非法`);
  }
});

test('几组相对位置符合常识', () => {
  const at = (id) => spotById(id);
  assert.ok(at('shidiao').lng > at('longquanshan').lng, '青田应在龙泉以东');
  assert.ok(at('baishanzu').lat < at('xiandu').lat, '百山祖应在仙都以南');
  assert.ok(at('nanjianyan').lng < at('nanminghu').lng, '南尖岩应在丽水城以西');
  assert.ok(at('yangjiatang').lat > at('dajie').lat, '杨家堂应在大漈以北');
});

test('每个县至少两处，避免地图上出现空白县', () => {
  for (const r of REGIONS) {
    const n = SPOTS.filter((s) => s.region === r.id).length;
    assert.ok(n >= 2, `${r.name} 只有 ${n} 处`);
  }
});

// 丽水的看点密度在"山、村、器物"三类上，这三类都不该太单薄。
test('峰峦、古村、器物三类都有足够条目', () => {
  for (const id of ['peak', 'village', 'craft']) {
    assert.ok(SPOTS.filter((s) => s.category === id).length >= 3, `${id} 太少`);
  }
});
