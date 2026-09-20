// 山峦：山高就是国力。这条一旦松动，整张卷就只是好看而已。

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSegments } from '../src/atlas/timeline.js';
import { LAYERS, controlsFor, ridgeLine, heightAtX, hash01, seedOf } from '../src/atlas/terrain.js';

const segments = buildSegments();

test('同一个朝代永远画出同一座山', () => {
  for (const seg of segments.slice(0, 5)) {
    assert.deepEqual(controlsFor(seg, 'near'), controlsFor(seg, 'near'));
  }
  assert.equal(hash01(42), hash01(42));
  assert.notEqual(hash01(42), hash01(43));
  assert.equal(seedOf('tang'), seedOf('tang'));
  assert.notEqual(seedOf('tang'), seedOf('ming'));
});

test('主峰高度精确等于 power，噪声只往下削', () => {
  for (const seg of segments) {
    const controls = controlsFor(seg, 'near');
    const peaks = controls.filter((c) => c.role === 'peak');
    assert.equal(peaks.length, 1, `${seg.id} 应当只有一座主峰`);
    assert.equal(peaks[0].h, seg.power, `${seg.id} 主峰被改动了`);
    for (const c of controls) {
      assert.ok(c.h <= seg.power + 1e-12, `${seg.id} 有控制点高过主峰：${c.h}`);
      assert.ok(c.h >= 0);
    }
  }
});

test('控制点里有主峰、次峰和谷口三级，不是一条缓坡', () => {
  for (const seg of segments) {
    const controls = controlsFor(seg, 'near');
    const roles = new Set(controls.map((c) => c.role));
    assert.ok(roles.has('peak') && roles.has('sub') && roles.has('saddle'), `${seg.id} 缺一级控制点`);
    const hs = controls.map((c) => c.h);
    assert.ok(Math.max(...hs) - Math.min(...hs) > seg.power * 0.4, `${seg.id} 起伏太小`);
  }
});

test('乱世的谷口压到江面附近', () => {
  const floorOf = (seg) => {
    const saddles = controlsFor(seg, 'near').filter((c) => c.role === 'saddle');
    return Math.min(...saddles.map((c) => c.h));
  };
  for (const seg of segments) {
    const floor = floorOf(seg);
    if (seg.kind === 'divided') assert.ok(floor < seg.power * 0.2, `${seg.id} 谷口不够低：${floor}`);
    else assert.ok(floor < seg.power * 0.5, `${seg.id} 谷口没挖开`);
  }
});

test('轮廓线沿 x 递增，高度落在 0..主峰之间', () => {
  for (const seg of segments) {
    const controls = controlsFor(seg, 'near');
    const line = ridgeLine(controls);
    assert.ok(line.length > controls.length, `${seg.id} 没有加密`);
    for (let i = 1; i < line.length; i += 1) {
      assert.ok(line[i].x >= line[i - 1].x, `${seg.id} 轮廓线 x 回退`);
    }
    for (const p of line) assert.ok(p.h >= 0);
  }
});

test('heightAtX 在控制点处还原高度，越界返回端点', () => {
  const seg = segments.find((s) => s.id === 'tang');
  const line = ridgeLine(controlsFor(seg, 'near'));
  for (const p of [line[0], line[Math.floor(line.length / 2)], line[line.length - 1]]) {
    assert.ok(Math.abs(heightAtX(line, p.x) - p.h) < 1e-6);
  }
  assert.equal(heightAtX(line, -1e6), line[0].h);
  assert.equal(heightAtX(line, 1e6), line[line.length - 1].h);
  assert.equal(heightAtX([], 10), 0);
});

test('三层远近：越远越矮越淡，视差越小', () => {
  assert.equal(LAYERS[LAYERS.length - 1].key, 'near');
  for (let i = 1; i < LAYERS.length; i += 1) {
    assert.ok(LAYERS[i].scale > LAYERS[i - 1].scale, '近处的山应当更高');
    assert.ok(LAYERS[i].depth < LAYERS[i - 1].depth, '近处的山应当更实');
    assert.ok(LAYERS[i].parallax > LAYERS[i - 1].parallax, '远山应当走得更慢');
  }
  const near = LAYERS[LAYERS.length - 1];
  assert.equal(near.scale, 1);
  assert.equal(near.lift, 0);
});
