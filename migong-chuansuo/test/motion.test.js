import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVEAL_PAUSE,
  clamp01,
  easeOutCubic,
  mix,
  slidePositions,
  walkDuration,
  walkPoint,
  winRevealDelay,
} from '../src/scene/motion.js';

test('缓动在两端取到 0 和 1，中间单调递增', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.3) < easeOutCubic(0.6));
  assert.equal(clamp01(-2), 0);
  assert.equal(clamp01(9), 1);
});

test('推移开始时每块砖停在来处，结束时落到新位置', () => {
  const start = slidePositions(4, 1, 0);
  assert.deepEqual(start.positions, [-1, 0, 1, 2]);
  const end = slidePositions(4, 1, 1);
  assert.deepEqual(end.positions, [0, 1, 2, 3]);
});

test('绕回的砖会额外给一个影子，从对边滑出去', () => {
  const half = slidePositions(4, 1, 0.5);
  assert.equal(half.ghost.index, 0, '正向推移时绕回的是新的第 0 块');
  assert.equal(half.ghost.position, 3.5, '影子应该从第 3 格往界外滑');
  assert.equal(half.positions[0], -0.5, '本体应该从界外往第 0 格滑');
});

test('反向推移的绕回发生在另一端', () => {
  const half = slidePositions(4, -1, 0.5);
  assert.equal(half.ghost.index, 3);
  assert.equal(half.ghost.position, -0.5);
  assert.equal(half.positions[3], 3.5);
});

test('影子在动画结束时正好落到界外一格，不会留在画面里', () => {
  const end = slidePositions(5, 1, 1);
  assert.equal(end.ghost.position, 5);
  const back = slidePositions(5, -1, 1);
  assert.equal(back.ghost.position, -1);
});

test('走位插值按段推进，每段中点抬到最高', () => {
  const path = [
    { layer: 0, col: 0, row: 0 },
    { layer: 0, col: 1, row: 0 },
    { layer: 0, col: 1, row: 1 },
  ];
  const first = walkPoint(path, 0.25);
  assert.deepEqual(first.from, path[0]);
  assert.deepEqual(first.to, path[1]);
  assert.ok(Math.abs(first.t - 0.5) < 1e-9);
  assert.ok(Math.abs(first.hop - 1) < 1e-9);
  const last = walkPoint(path, 1);
  assert.deepEqual(last.to, path[2]);
  assert.equal(last.t, 1);
});

test('单格路径不插值，也不会抛错', () => {
  const single = walkPoint([{ layer: 0, col: 2, row: 2 }], 0.5);
  assert.deepEqual(single.from, single.to);
  assert.equal(single.hop, 0);
  assert.equal(walkPoint([], 0.5), null);
});

test('走位时长按格数算，单格路径也留一份时长', () => {
  assert.equal(walkDuration([1, 2, 3, 4], 0.1).toFixed(2), '0.30');
  assert.equal(walkDuration([1], 0.1), 0.1);
});

test('线性插值就是线性插值', () => {
  assert.equal(mix(2, 6, 0.25), 3);
});

test('结算面板的延迟盖住整段走位，否则玩家只会看到「一点就通关」', () => {
  const path = [
    { layer: 0, col: 0, row: 0 },
    { layer: 0, col: 1, row: 0 },
    { layer: 0, col: 2, row: 0 },
  ];
  const effects = [{ type: 'walk', path }, { type: 'won', stars: 3 }];
  const delay = winRevealDelay(effects, 0.13);
  assert.ok(delay > walkDuration(path, 0.13), '延迟必须比走位时长更久');
  assert.ok(Math.abs(delay - (0.26 + REVEAL_PAUSE)) < 1e-9);
});

test('没有走位特效时也留一拍，不做零延迟弹窗', () => {
  assert.equal(winRevealDelay([{ type: 'won' }], 0.13), REVEAL_PAUSE);
  assert.equal(winRevealDelay([], 0.13), REVEAL_PAUSE);
});
