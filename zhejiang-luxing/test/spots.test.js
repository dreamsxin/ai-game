import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { REGIONS, CATEGORIES } from '../src/atlas/taxonomy.js';
import { BBOX } from '../src/atlas/projection.js';

const REGION_IDS = REGIONS.map((r) => r.id);
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

test('景点 id 唯一，且 spotById 能取回每一个', () => {
  const ids = SPOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(spotById(id).id, id);
});

test('每个景点都落在浙江的经纬度范围内', () => {
  for (const s of SPOTS) {
    assert.ok(s.lng > BBOX.minLng && s.lng < BBOX.maxLng, `${s.name} 经度越界`);
    assert.ok(s.lat > BBOX.minLat && s.lat < BBOX.maxLat, `${s.name} 纬度越界`);
  }
});

test('分区和类别都在词表里，且每一项都至少有一个景点', () => {
  for (const s of SPOTS) {
    assert.ok(REGION_IDS.includes(s.region), `${s.name} 的分区非法`);
    assert.ok(CATEGORY_IDS.includes(s.category), `${s.name} 的类别非法`);
  }
  for (const id of REGION_IDS) assert.ok(SPOTS.some((s) => s.region === id), `分区 ${id} 没有景点`);
  for (const id of CATEGORY_IDS) assert.ok(SPOTS.some((s) => s.category === id), `类别 ${id} 没有景点`);
});

// 这条是这份数据存在的理由：地图上点开一个景点，必须能回答「看什么」和「怎么玩」。
// 任何一条只有名字没有内容的记录都不该进来。
test('每个景点都有至少 2 条看点和 2 条 tips，且没有空文本', () => {
  for (const s of SPOTS) {
    assert.ok(s.highlights.length >= 2, `${s.name} 看点不足`);
    assert.ok(s.tips.length >= 2, `${s.name} tips 不足`);
    for (const line of [...s.highlights, ...s.tips]) {
      assert.ok(line.trim().length >= 8, `${s.name} 有过短的条目：${line}`);
    }
    for (const key of ['name', 'city', 'badge', 'stay', 'season', 'ticket', 'reach']) {
      assert.ok(String(s[key]).trim().length > 0, `${s.name} 缺 ${key}`);
    }
  }
});

test('适游月份合法且非空', () => {
  for (const s of SPOTS) {
    assert.ok(s.months.length > 0, `${s.name} 没有适游月份`);
    for (const m of s.months) assert.ok(Number.isInteger(m) && m >= 1 && m <= 12, `${s.name} 月份 ${m} 非法`);
    assert.equal(new Set(s.months).size, s.months.length, `${s.name} 月份有重复`);
  }
});

test('海岛类景点都在海上或近海（经度靠东或纬度靠南）', () => {
  const isles = SPOTS.filter((s) => s.category === 'isle');
  assert.ok(isles.length >= 4);
  for (const s of isles) {
    assert.ok(s.lng > 121.0, `${s.name} 作为海岛景点经度偏西`);
  }
});

// 相对位置守在这里：地图靠经纬度摆点，摆错了整张图就是错的。
test('几组相对位置符合常识', () => {
  const at = (id) => spotById(id);
  assert.ok(at('putuoshan').lng > at('xihu').lng, '普陀山应在西湖以东');
  assert.ok(at('nanji').lat < at('nanxun').lat, '南麂应在南浔以南');
  assert.ok(at('qiandaohu').lng < at('xihu').lng, '千岛湖应在西湖以西');
  assert.ok(at('yandang').lat < at('tiantai').lat, '雁荡山应在天台山以南');
  assert.ok(at('gengong').lng < at('shuanglong').lng, '开化应在金华以西');
});

test('五个分区的景点数量都不至于太少', () => {
  for (const r of REGIONS) {
    const n = SPOTS.filter((s) => s.region === r.id).length;
    assert.ok(n >= 4, `${r.name} 只有 ${n} 个景点，地图上会空一块`);
  }
});
