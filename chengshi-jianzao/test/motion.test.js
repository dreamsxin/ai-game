import test from 'node:test';
import assert from 'node:assert/strict';
import { MONTH_SECONDS } from '../src/game/rules.js';
import { SPAWN_SECONDS, advanceClock, mix, spawnScale, zoomStep } from '../src/scene/motion.js';

test('暂停时时间不走，也不会攒下存量', () => {
  const still = advanceClock(1.5, 0.5, 0);
  assert.deepEqual(still, { accumulator: 0, months: 0 });
});

test('攒够一个月的秒数才结算一次', () => {
  const half = advanceClock(0, MONTH_SECONDS / 2, 1);
  assert.equal(half.months, 0);
  const full = advanceClock(half.accumulator, MONTH_SECONDS / 2 + 0.01, 1);
  assert.equal(full.months, 1);
  assert.ok(full.accumulator < MONTH_SECONDS);
});

test('倍速只是把真实时间乘上去', () => {
  assert.equal(advanceClock(0, MONTH_SECONDS, 2).months, 2);
});

test('切回标签页时最多补 4 个月，不会一次跳过半局', () => {
  assert.equal(advanceClock(0, MONTH_SECONDS * 30, 1).months, 4);
});

test('新建筑从矮长到高，超时后停在原尺寸', () => {
  assert.equal(spawnScale(0), 0.2);
  assert.equal(spawnScale(-1), 0.2, '时钟回拨也不该出现负缩放');
  assert.ok(spawnScale(SPAWN_SECONDS / 2) > 0.2);
  assert.equal(spawnScale(SPAWN_SECONDS), 1);
  assert.equal(spawnScale(9), 1);
});

test('缩放有上下限，挡住无限拉近拉远', () => {
  assert.equal(zoomStep(1, 0.15), 1.15);
  assert.equal(zoomStep(1.55, 0.15), 1.6);
  assert.equal(zoomStep(0.75, -0.5), 0.7);
});

test('线性插值是渐进的，不会一步到位', () => {
  assert.equal(mix(0, 10, 0.5), 5);
  assert.equal(mix(2, 2, 0.3), 2);
});
