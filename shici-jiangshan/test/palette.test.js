// 画风的测试。色带被搬进判定层就是为了能写这一组 ——
// 「西半边读成海」那次事故，node --test 全绿、vite build 也成功，
// 只有开页面才看得出来。现在它能在这里就被拦住。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAND_RAMP, SEA_RAMP, WATER_SILK, WET_BED,
  rampHex, lumOf, LAND_LUM_FLOOR,
} from '../src/atlas/palette.js';

const sample = (ramp, step) => {
  const lo = Math.min(ramp[0][0], ramp[ramp.length - 1][0]);
  const hi = Math.max(ramp[0][0], ramp[ramp.length - 1][0]);
  const out = [];
  for (let v = lo; v <= hi; v += step) out.push(v);
  return out;
};

test('色带的节点都是合法颜色，且高度单调', () => {
  for (const ramp of [LAND_RAMP, SEA_RAMP]) {
    for (const [h, color] of ramp) {
      assert.ok(Number.isFinite(h));
      assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff, `坏颜色 ${color}`);
    }
    for (let i = 1; i < ramp.length; i++) {
      assert.notEqual(ramp[i][0], ramp[i - 1][0]);
      assert.equal(Math.sign(ramp[i][0] - ramp[i - 1][0]), Math.sign(ramp[1][0] - ramp[0][0]));
    }
  }
});

test('取色在节点上取到节点色，区间外取端点色', () => {
  for (const [h, color] of LAND_RAMP) assert.equal(rampHex(LAND_RAMP, h), color);
  for (const [h, color] of SEA_RAMP) assert.equal(rampHex(SEA_RAMP, h), color);
  assert.equal(rampHex(LAND_RAMP, -50), LAND_RAMP[0][1]);
  assert.equal(rampHex(LAND_RAMP, 99999), LAND_RAMP[LAND_RAMP.length - 1][1]);
  assert.equal(rampHex(SEA_RAMP, 5), SEA_RAMP[0][1]);
  assert.equal(rampHex(SEA_RAMP, -9999), SEA_RAMP[SEA_RAMP.length - 1][1]);
});

test('区间内取色落在两端之间', () => {
  const mid = rampHex(LAND_RAMP, 130); // 60 与 200 之间
  const chan = (c, s) => (c >> s) & 0xff;
  for (const s of [16, 8, 0]) {
    const a = chan(LAND_RAMP[1][1], s);
    const b = chan(LAND_RAMP[2][1], s);
    const m = chan(mid, s);
    assert.ok(m >= Math.min(a, b) && m <= Math.max(a, b), `第 ${s} 位越界`);
  }
});

test('没有一档陆地色暗到会被读成水', () => {
  for (const h of sample(LAND_RAMP, 25)) {
    const lum = lumOf(rampHex(LAND_RAMP, h));
    assert.ok(lum >= LAND_LUM_FLOOR, `${h} 米处亮度只有 ${lum.toFixed(0)}，低于 ${LAND_LUM_FLOOR.toFixed(0)}`);
  }
  // 出事的那一档：石青一路加深到 0x2a4a7a，亮度七十出头，比水色暗了一半以上
  assert.ok(lumOf(0x2a4a7a) < LAND_LUM_FLOOR);
});

test('色带在石青之前越高越暗，之后越高越淡', () => {
  const darkest = LAND_RAMP.reduce((best, cur) => (lumOf(cur[1]) < lumOf(best[1]) ? cur : best));
  assert.equal(darkest[0], 2400, '最暗的一档应当正是石青那档');
  for (const ramp of [
    LAND_RAMP.filter(([h]) => h <= 2400),
    LAND_RAMP.filter(([h]) => h >= 2400).reverse(),
  ]) {
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(lumOf(ramp[i][1]) < lumOf(ramp[i - 1][1]), `${ramp[i][0]} 米这一档亮度走反了`);
    }
  }
});

test('海越深越暗，且深海比任何陆地都暗', () => {
  for (let i = 1; i < SEA_RAMP.length; i++) {
    assert.ok(lumOf(SEA_RAMP[i][1]) < lumOf(SEA_RAMP[i - 1][1]));
  }
  const landFloor = Math.min(...LAND_RAMP.map(([, c]) => lumOf(c)));
  for (const h of sample(SEA_RAMP, 20).filter((v) => v <= -120)) {
    assert.ok(lumOf(rampHex(SEA_RAMP, h)) < landFloor, `${h} 米的海不比陆地暗`);
  }
});

test('水色与湖底色都比陆地最暗处亮，水面才浮在地形之上', () => {
  const landFloor = Math.min(...LAND_RAMP.map(([, c]) => lumOf(c)));
  assert.ok(lumOf(WATER_SILK) > landFloor);
  assert.ok(lumOf(WET_BED) > landFloor);
});
