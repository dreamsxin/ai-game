import test from 'node:test';
import assert from 'node:assert/strict';
import {
  elevationAt, buildHeightField, pointInPolygon, riverAt, lakeContains, waterLevelAt, KIND,
} from '../src/atlas/terrain.js';
import { PROVINCE, LAKES, RIVERS } from '../src/atlas/geo.js';
import { BBOX } from '../src/atlas/projection.js';

const lakeOf = (id) => LAKES.find((l) => l.id === id);
const riverOf = (id) => RIVERS.find((r) => r.id === id);

test('省界多边形能正确区分内外', () => {
  assert.ok(pointInPolygon(115.89, 28.68, PROVINCE), '南昌应在省内');
  assert.ok(pointInPolygon(114.94, 25.83, PROVINCE), '赣州应在省内');
  assert.ok(pointInPolygon(118.00, 29.31, PROVINCE), '婺源篁岭应在省内');
  assert.ok(!pointInPolygon(113.00, 28.20, PROVINCE), '长沙方向应在省外');
  assert.ok(!pointInPolygon(118.30, 29.70, PROVINCE), '皖南黄山方向应在省外');
  assert.ok(!pointInPolygon(116.50, 24.60, PROVINCE), '广东梅州方向应在省外');
});

test('同一个经纬度永远得到同一个高度（没有随机数）', () => {
  for (const [lng, lat] of [[115.89, 28.68], [117.76, 27.88], [116.28, 29.15]]) {
    assert.deepEqual(elevationAt(lng, lat), elevationAt(lng, lat));
  }
});

// 江西的骨架：四周是山、中间偏北是湖积平原。这条守的是整张地图没被改歪。
test('环着江西的那圈山明显高于鄱阳湖平原', () => {
  const plain = elevationAt(116.45, 28.95).h; // 余干—鄱阳一带
  for (const [name, lng, lat] of [
    ['武夷山黄岗山', 117.76, 27.88],
    ['罗霄山武功山', 114.17, 27.46],
    ['怀玉山三清山', 118.06, 28.91],
    ['南岭齐云山', 114.02, 25.85],
    ['九岭山', 114.66, 28.93],
  ]) {
    const peak = elevationAt(lng, lat).h;
    assert.ok(peak > 1000, `${name} 只有 ${peak.toFixed(0)}m`);
    assert.ok(peak > plain * 20, `${name} 与平原的落差不够`);
  }
  assert.ok(plain < 40, `鄱阳湖平原却有 ${plain.toFixed(0)}m`);
});

test('鄱阳湖被认成湖，而且是北窄南宽的形状', () => {
  const center = elevationAt(116.28, 29.15);
  assert.equal(center.kind, KIND.LAKE);
  assert.equal(center.level, lakeOf('poyang').level);
  assert.ok(center.h < center.level, '湖底应该低于水位');

  // 同一个纬度带上从西往东扫，数出湖面有多宽：南边那条应该明显比北边宽
  const widthAt = (lat) => {
    let n = 0;
    for (let lng = 115.7; lng <= 117.0; lng += 0.01) {
      if (elevationAt(lng, lat).kind === KIND.LAKE) n += 1;
    }
    return n;
  };
  const north = widthAt(29.68); // 湖口—星子那条水道
  const south = widthAt(28.95); // 余干—康山那片浅湖
  assert.ok(north > 0, '北边的水道断了，湖就流不到长江');
  assert.ok(south > north * 2, `南宽 ${south} 应明显大于北窄 ${north}`);
});

test('水库淹在山谷里，湖中留得下岛', () => {
  const xihai = lakeOf('xihai');
  let water = 0;
  let islands = 0;
  for (let i = 0; i < 40; i++) {
    for (let j = 0; j < 40; j++) {
      const lng = xihai.lng - xihai.rx + (2 * xihai.rx * i) / 39;
      const lat = xihai.lat - xihai.ry + (2 * xihai.ry * j) / 39;
      const { kind } = elevationAt(lng, lat);
      if (kind === KIND.LAKE) water += 1;
      else if (kind === KIND.LAND) islands += 1;
    }
  }
  assert.ok(water > 200, `庐山西海湖面采样点只有 ${water} 个`);
  assert.ok(islands > 40, `湖中岛采样点只有 ${islands} 个，「千岛」就看不出来了`);
});

// 这是这张地图和沿海省份最大的不同：江西没有海，水面不能共用一个高度。
// 五条河的水位必须一路往下走，最后落到鄱阳湖的水位上，否则水就在往山上流。
test('五河的水位沿流向只降不升，且都落到鄱阳湖水位附近', () => {
  const poyang = lakeOf('poyang').level;
  for (const river of RIVERS) {
    for (let i = 1; i < river.pts.length; i++) {
      const up = river.pts[i - 1][2];
      const down = river.pts[i][2];
      assert.ok(down <= up, `${river.name} 第 ${i} 段从 ${up}m 升到 ${down}m，水在往上流`);
    }
    if (river.mouth === 'poyang') {
      const mouth = river.pts[river.pts.length - 1][2];
      assert.ok(Math.abs(mouth - poyang) <= 4, `${river.name} 入湖处水位 ${mouth}m 与湖面 ${poyang}m 差太多`);
      const last = river.pts[river.pts.length - 1];
      assert.ok(lakeContains(last[0], last[1], lakeOf('poyang'), 1.06), `${river.name} 的入湖口没落在湖上`);
    }
  }
});

test('赣江被切成一条真的河道：河面低于两岸，且上游高于下游', () => {
  const upstream = elevationAt(114.94, 25.83); // 赣州章贡区，章贡二水合流处
  const downstream = elevationAt(115.99, 28.95); // 吴城附近入湖前
  assert.equal(upstream.kind, KIND.RIVER);
  assert.ok(upstream.level > downstream.level + 60, '赣江从赣州到入湖应有几十米落差');

  const onRiver = elevationAt(114.97, 27.30); // 吉安—峡江之间的江面
  assert.equal(onRiver.kind, KIND.RIVER);
  const bank = elevationAt(114.97, 27.45 + 0.25); // 往北 25 公里的丘陵
  assert.ok(bank.h > onRiver.level, '离开江面应该抬起来');
  assert.equal(waterLevelAt(114.97, 27.30), onRiver.level);
  assert.equal(waterLevelAt(114.60, 27.55), null, '山上不该有水位');
});

test('riverAt 能把水位沿段插值出来', () => {
  const gan = riverOf('gan');
  const first = gan.pts[0];
  const second = gan.pts[1];
  const mid = riverAt((first[0] + second[0]) / 2, (first[1] + second[1]) / 2, gan);
  assert.ok(mid.d < 0.02, '折线中点到河的距离应接近 0');
  assert.ok(mid.level < first[2] && mid.level > second[2], '中点水位应在两端之间');
});

test('省界之外被单独标出来，好让表现层把邻省压低调灰', () => {
  const outside = elevationAt(113.0, 28.2);
  assert.equal(outside.kind, KIND.OUTSIDE);
  assert.ok(outside.h > 0, '邻省也是有地形的，不该是个洞');
  // 武夷山主脊两侧不该因为过了省界就塌掉
  const inside = elevationAt(117.70, 27.80);
  const beyond = elevationAt(117.95, 27.75);
  assert.equal(beyond.kind, KIND.OUTSIDE);
  assert.ok(beyond.h > 300, `福建一侧只有 ${beyond.h.toFixed(0)}m，省界会出现一道假悬崖`);
  assert.ok(inside.h > beyond.h, '省内主脊仍应是更高的那侧');
});

test('采样成网格后四种地物齐全，高度范围合理', () => {
  const field = buildHeightField(120, 130, BBOX);
  assert.equal(field.heights.length, 120 * 130);
  const kinds = new Set(field.kinds);
  assert.ok(kinds.has(KIND.OUTSIDE));
  assert.ok(kinds.has(KIND.LAND));
  assert.ok(kinds.has(KIND.LAKE));
  assert.ok(kinds.has(KIND.RIVER));
  assert.ok(field.maxH > 1600 && field.maxH < 2600, `最高点 ${field.maxH.toFixed(0)}m 不合理`);
  assert.ok(field.minH < 10, '至少要挖出水面以下的湖底和河床');
});
