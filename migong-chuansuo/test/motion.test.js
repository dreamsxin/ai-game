import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVEAL_PAUSE,
  clamp01,
  easeOutCubic,
  mix,
  slideCell,
  slidePositions,
  walkDuration,
  walkPoint,
  winRevealDelay,
} from '../src/scene/motion.js';
import { AXIS_COL, AXIS_ROW } from '../src/game/rules.js';

const BOARD = { cols: 4, rows: 3, layers: 2 };
const shiftAnim = (over = {}) => ({ kind: 'shift', layer: 0, axis: AXIS_ROW, index: 1, dir: 1, ...over });

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

test('slideCell 让被推那条线上的格子跟着滑，其余原地不动', () => {
  const onLine = { layer: 0, col: 2, row: 1 };
  // 推完停下来（progress=1）应该正好落在自己那一格上。
  assert.deepEqual(slideCell(onLine, shiftAnim(), BOARD, 1), { col: 2, row: 1 });
  // 动画刚开始时还在「来处」，也就是往回退一格。
  assert.deepEqual(slideCell(onLine, shiftAnim(), BOARD, 0), { col: 1, row: 1 });
  // 不在这一行上：返回 null，调用方直接用静态坐标。
  assert.equal(slideCell({ layer: 0, col: 2, row: 0 }, shiftAnim(), BOARD, 0.5), null);
  // 不在这一层上也不动——推移只作用在激活层。
  assert.equal(slideCell({ layer: 1, col: 2, row: 1 }, shiftAnim(), BOARD, 0.5), null);
});

test('slideCell 推列时改的是 row，且中途真的在两格之间', () => {
  const cell = { layer: 0, col: 2, row: 1 };
  const anim = shiftAnim({ axis: AXIS_COL, index: 2, dir: 1 });
  assert.deepEqual(slideCell(cell, anim, BOARD, 1), { col: 2, row: 1 });
  const mid = slideCell(cell, anim, BOARD, 0.5);
  assert.equal(mid.col, 2, '推列不该改动列号');
  assert.ok(mid.row > 0 && mid.row < 1, `中途应该卡在 0~1 之间，实际 ${mid.row}`);
});

test('走位动画和没有动画时 slideCell 都不掺和', () => {
  const cell = { layer: 0, col: 2, row: 1 };
  assert.equal(slideCell(cell, null, BOARD, 0.5), null);
  assert.equal(slideCell(cell, { kind: 'walk', path: [] }, BOARD, 0.5), null);
});
