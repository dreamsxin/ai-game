import test from 'node:test';
import assert from 'node:assert/strict';
import { PADDLE_WIDTH } from '../src/game/rules.js';
import { TAP_MAX_DRIFT, createInput, mergeInput } from '../src/game/input.js';

// 假 target：只实现监听器注册和 getBoundingClientRect，够 createInput 用。
const fakeTarget = ({ width = 450, height = 800 } = {}) => {
  const listeners = new Map();
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== fn));
    },
    emit(type, event) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    total() {
      return [...listeners.values()].reduce((sum, arr) => sum + arr.length, 0);
    },
  };
};

// 450x800 的场地是 9x16 格，每格 50 像素。
test('按下就把挡板挪到手指那一列', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 300, clientY: 700 });
  assert.equal(input.snapshot().paddleX, 6);
  input.dispose();
});

test('拖动持续跟手，并夹在场地内', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 225, clientY: 700 });
  target.emit('pointermove', { pointerId: 1, clientX: 440, clientY: 700 });
  assert.equal(input.snapshot().paddleX, 9 - PADDLE_WIDTH / 2, '右边留半个挡板');
  target.emit('pointermove', { pointerId: 1, clientX: -60, clientY: 700 });
  assert.equal(input.snapshot().paddleX, PADDLE_WIDTH / 2);
  input.dispose();
});

test('几乎没动的手势算点一下，拖过的不算', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 225, clientY: 700 });
  target.emit('pointerup', { pointerId: 1, clientX: 225 + TAP_MAX_DRIFT - 2, clientY: 700 });
  assert.equal(input.snapshot().tap, true);

  target.emit('pointerdown', { pointerId: 1, clientX: 225, clientY: 700 });
  target.emit('pointermove', { pointerId: 1, clientX: 225 + TAP_MAX_DRIFT + 8, clientY: 700 });
  target.emit('pointerup', { pointerId: 1, clientX: 225 + TAP_MAX_DRIFT + 8, clientY: 700 });
  assert.equal(input.snapshot().tap, false, '拖挡板不该顺手换色');
  input.dispose();
});

test('快照取走后点一下被清空，挡板位置保留', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 200, clientY: 700 });
  target.emit('pointerup', { pointerId: 1, clientX: 200, clientY: 700 });
  assert.equal(input.snapshot().tap, true);
  const again = input.snapshot();
  assert.equal(again.tap, false, '同一次点击不应被消费两次');
  assert.equal(again.paddleX, 4, '挡板位置是持续状态');
  input.dispose();
});

test('左右键给方向，松手归零', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'ArrowLeft' });
  assert.equal(input.snapshot().move, -1);
  target.emit('keydown', { code: 'ArrowRight' });
  assert.equal(input.snapshot().move, 0, '两边同时按住互相抵消');
  target.emit('keyup', { code: 'ArrowLeft' });
  assert.equal(input.snapshot().move, 1);
  target.emit('keyup', { code: 'ArrowRight' });
  assert.equal(input.snapshot().move, 0);
  input.dispose();
});

test('空格和上键都是点一下，长按不重复', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'Space' });
  assert.equal(input.snapshot().tap, true);
  target.emit('keydown', { code: 'Space', repeat: true });
  assert.equal(input.snapshot().tap, false);
  target.emit('keydown', { code: 'ArrowUp' });
  assert.equal(input.snapshot().tap, true);
  input.dispose();
});

test('Esc 与 P 触发暂停回调', () => {
  const target = fakeTarget();
  let paused = 0;
  const input = createInput(target, { pointer: false, onPause: () => { paused += 1; } });
  target.emit('keydown', { code: 'Escape' });
  target.emit('keydown', { code: 'KeyP' });
  target.emit('keydown', { code: 'KeyP', repeat: true });
  assert.equal(paused, 2, '长按重复事件不应重复暂停');
  input.dispose();
});

test('dispose 会摘掉所有监听器', () => {
  const target = fakeTarget();
  const input = createInput(target);
  assert.ok(target.total() > 0);
  input.dispose();
  assert.equal(target.total(), 0);
});

test('手动触发的点一下和拖动也进快照', () => {
  const input = createInput(fakeTarget(), { keyboard: false, pointer: false });
  input.pressTap();
  input.dragTo(99);
  const frame = input.snapshot();
  assert.equal(frame.tap, true);
  assert.equal(frame.paddleX, 9 - PADDLE_WIDTH / 2);
  input.dispose();
});

test('合并输入时触屏优先，按键方向兜底', () => {
  const merged = mergeInput({ paddleX: 3, move: 0, tap: false }, { paddleX: 7, move: -1, tap: true });
  assert.equal(merged.paddleX, 3);
  assert.equal(merged.move, -1);
  assert.equal(merged.tap, true);
  const none = mergeInput({ paddleX: null, move: 0, tap: false }, { paddleX: null, move: 0, tap: false });
  assert.equal(none.paddleX, null);
});
