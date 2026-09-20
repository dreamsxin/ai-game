import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, spotById } from '../src/atlas/spots.js';
import { REGIONS, CATEGORIES } from '../src/atlas/taxonomy.js';
import { BBOX } from '../src/atlas/projection.js';
import { PROVINCE } from '../src/atlas/geo.js';
import { pointInPolygon, elevationAt, KIND } from '../src/atlas/terrain.js';

const REGION_IDS = REGIONS.map((r) => r.id);
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

test('景点 id 唯一，且 spotById 能取回每一个', () => {
  const ids = SPOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(spotById(id).id, id);
});

test('每个景点都落在江西的经纬度范围内', () => {
  for (const s of SPOTS) {
    assert.ok(s.lng > BBOX.minLng && s.lng < BBOX.maxLng, `${s.name} 经度越界`);
    assert.ok(s.lat > BBOX.minLat && s.lat < BBOX.maxLat, `${s.name} 纬度越界`);
  }
});

// 邻省在地图上被整块压低了。景点要是落到省界外，标记就会插在灰色的邻省上，一眼就是错的。
test('每个景点都站在省界之内', () => {
  for (const s of SPOTS) {
    assert.ok(pointInPolygon(s.lng, s.lat, PROVINCE), `${s.name}（${s.lng}, ${s.lat}）掉到省外了`);
    assert.notEqual(elevationAt(s.lng, s.lat).kind, KIND.OUTSIDE, `${s.name} 落在被压低的邻省上`);
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
test('每个景点都有至少 3 条看点和 3 条 tips，且没有空文本', () => {
  for (const s of SPOTS) {
    assert.ok(s.highlights.length >= 3, `${s.name} 看点不足`);
    assert.ok(s.tips.length >= 3, `${s.name} tips 不足`);
    for (const line of [...s.highlights, ...s.tips]) {
      assert.ok(line.trim().length >= 12, `${s.name} 有过短的条目：${line}`);
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

// 票价会变，所以数据里只许写形态。写死金额的条目迟早会骗人。
test('门票字段不写死具体金额', () => {
  for (const s of SPOTS) {
    assert.ok(!/\d+\s*元/.test(s.ticket) || /几十元|百元/.test(s.ticket), `${s.name} 的门票写了具体金额：${s.ticket}`);
  }
});

// 相对位置守在这里：地图靠经纬度摆点，摆错了整张图就是错的。
test('几组相对位置符合常识', () => {
  const at = (id) => spotById(id);
  assert.ok(at('huangling').lng > at('tengwangge').lng, '婺源篁岭应在滕王阁以东');
  assert.ok(at('lushan').lat > at('jinggangshan').lat, '庐山应在井冈山以北');
  assert.ok(at('ganzhou-gucheng').lat < at('tengwangge').lat, '赣州应在南昌以南');
  assert.ok(at('wugongshan').lng < at('sanqingshan').lng, '武功山应在三清山以西');
  assert.ok(at('weiwu').lat < at('ruijin').lat, '龙南围屋应在瑞金以南');
  assert.ok(at('shizhongshan').lat > at('poyang').lat, '湖口石钟山应在吴城以北');
});

test('五个分区的景点数量都不至于太少', () => {
  for (const r of REGIONS) {
    const n = SPOTS.filter((s) => s.region === r.id).length;
    assert.ok(n >= 5, `${r.name} 只有 ${n} 个景点，地图上会空一块`);
  }
});

// 瓷都、红色、客家这三类是江西的招牌，缺了就不是江西的地图了
test('江西的招牌类别都有足够的条目', () => {
  const count = (id) => SPOTS.filter((s) => s.category === id).length;
  assert.ok(count('kiln') >= 3, '瓷都窑火条目太少');
  assert.ok(count('red') >= 4, '红色印记条目太少');
  assert.ok(count('village') >= 6, '古村条目太少');
  assert.ok(count('mountain') >= 6, '名山条目太少');
});
