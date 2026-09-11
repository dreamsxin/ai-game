import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../src/city/generate.js';
import { paramsForStyle } from '../src/city/params.js';
import { STYLES } from '../src/city/styles.js';

const build = (styleId, overrides = {}) => generateCity({
  ...paramsForStyle(styleId, 'test-seed'),
  citySize: 1200,
  ...overrides,
});

test('五种风格都能生成出建筑和路网', () => {
  for (const style of STYLES) {
    const city = build(style.id);
    assert.ok(city.buildings.length > 150, `${style.id} 建筑太少：${city.buildings.length}`);
    assert.ok(city.roadLines.length > 10, `${style.id} 路网太少`);
    assert.equal(city.style.id, style.id);
  }
});

test('同一种子生成完全相同的城市', () => {
  const a = build('chongqing');
  const b = build('chongqing');
  assert.equal(a.buildings.length, b.buildings.length);
  assert.deepEqual(a.stats, { ...b.stats, genMs: a.stats.genMs });
  assert.equal(a.buildings[10].x, b.buildings[10].x);
  assert.equal(a.buildings[10].height, b.buildings[10].height);
});

test('换种子会换出不同城市', () => {
  const a = build('chongqing');
  const b = build('chongqing', { seed: 'another' });
  assert.notEqual(a.buildings.length, b.buildings.length);
});

test('重庆必须有山地高差、层叠立交、轻轨穿楼和索道', () => {
  const city = build('chongqing');
  assert.ok(city.stats.relief > 60, `高差不足：${city.stats.relief}`);
  assert.ok(city.stats.interchangeLevels >= 3, `立交层数不足：${city.stats.interchangeLevels}`);
  assert.equal(city.stats.monorailPierced, 1);
  assert.ok(city.cableCars.length >= 1, '缺少过江索道');
  assert.ok(city.bridges.length >= 2, '缺少跨江大桥');
  assert.ok(city.viaducts.length > 0, '缺少跨沟高架');
  // 依山而建：应该有相当比例的楼带出明显基座高差
  const stepped = city.buildings.filter((b) => b.plinth > 3).length;
  assert.ok(stepped / city.buildings.length > 0.2, `带基座高差的楼太少：${stepped}`);
});

test('轻轨穿楼确实在某栋楼上开了洞', () => {
  const city = build('chongqing');
  const pierced = city.buildings.filter((b) => b.pierced);
  assert.equal(pierced.length, 1);
  const b = pierced[0];
  assert.ok(b.pierced.y > b.base, '洞口不该在地面以下');
  assert.ok(b.pierced.y + b.pierced.height < b.base + b.plinth + b.height, '洞口不该穿出楼顶');
});

test('风格之间的天际线和地形差异足够明显', () => {
  const cq = build('chongqing');
  const sh = build('shanghai');
  const xa = build('xian');
  const hz = build('hangzhou');

  assert.ok(sh.stats.tallest > xa.stats.tallest * 3, '陆家嘴该远高于西安');
  assert.ok(xa.stats.tallest < 80, '西安限高失效');
  assert.ok(hz.stats.tallest < 60, '水乡限高失效');
  assert.ok(cq.stats.relief > sh.stats.relief * 4, '山城高差该远大于三角洲');
  assert.equal(xa.wall !== null, true, '西安缺城墙');
  assert.ok(hz.canals.length >= 4, '杭州缺水巷');
  assert.equal(sh.wall, null);
  assert.equal(cq.canals.length, 0);
});

test('参数能实时改变结果：密度、高度、绿地率都要生效', () => {
  const low = build('shanghai', { density: 0.3 });
  const high = build('shanghai', { density: 1 });
  assert.ok(high.buildings.length > low.buildings.length * 1.3, '密度没生效');

  const short = build('shanghai', { avgHeight: 20, landmarkBoost: 0 });
  const tall = build('shanghai', { avgHeight: 180, landmarkBoost: 0 });
  assert.ok(tall.stats.tallest > short.stats.tallest * 3, '平均高度没生效');

  const bare = build('shanghai', { parksPercent: 0 });
  const green = build('shanghai', { parksPercent: 0.5, showProps: false });
  assert.ok(green.props.trees.length > bare.props.trees.length, '绿地率没生效');
});

test('城墙和水巷开关能被参数覆盖', () => {
  assert.equal(build('xian', { cityWall: false }).wall, null);
  assert.ok(build('shanghai', { canal: true }).canals.length > 0);
  assert.equal(build('chongqing', { interchange: 0 }).interchanges.length, 0);
  assert.equal(build('chongqing', { monorail: 0 }).monorails.length, 0);
});

test('建筑不会落到水里', () => {
  for (const style of STYLES) {
    const city = build(style.id);
    const drowned = city.buildings.filter((b) => b.base < 1);
    assert.equal(drowned.length, 0, `${style.id} 有 ${drowned.length} 栋楼泡在水里`);
  }
});
