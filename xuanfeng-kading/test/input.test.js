// 输入。手机上只有三个操作（方向、手刹、氮气），所以这一层的规矩很少但每一条都关键：
// 方向是模拟量、氮气是**按一次算一次**（不能按住连喷）、键盘和触屏同时接。

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEAD_ZONE, STEER_RANGE, createInput, mergeInput, resolveSteer } from '../src/game/input.js';

/** 假的事件源：只记住监听器，然后手动派发。不需要 DOM。 */
function fakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    emit(type, event = {}) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
    get count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

test('拖动折成方向：死区内不算，量程外打满，左右符号相反', () => {
  assert.equal(resolveSteer(DEAD_ZONE - 1), 0);
  assert.equal(resolveSteer(STEER_RANGE * 3), 1);
  assert.equal(resolveSteer(-STEER_RANGE * 3), -1);
  const half = resolveSteer(DEAD_ZONE + (STEER_RANGE - DEAD_ZONE) / 2);
  assert.ok(half > 0.4 && half < 0.6, `半程应该给半舵，实际 ${half.toFixed(2)}`);
});

test('键盘：左右打方向，Shift 拉手刹，空格喷一次', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'ArrowLeft' });
  assert.equal(input.snapshot().steer, -1);
  target.emit('keyup', { code: 'ArrowLeft' });
  target.emit('keydown', { code: 'KeyD' });
  assert.equal(input.snapshot().steer, 1);

  target.emit('keydown', { code: 'ShiftLeft' });
  assert.equal(input.snapshot().drift, true);
  target.emit('keyup', { code: 'ShiftLeft' });
  assert.equal(input.snapshot().drift, false);
  input.dispose();
});

test('氮气是按一次算一次：按住不放也只喷一发', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'Space', preventDefault() {} });
  assert.equal(input.snapshot().boost, true);
  assert.equal(input.snapshot().boost, false, '同一次按下不该喷第二发');
  // 浏览器的长按重复事件也不算新的一次。
  target.emit('keydown', { code: 'Space', repeat: true, preventDefault() {} });
  assert.equal(input.snapshot().boost, false);
  input.dispose();
});

test('触屏拖动：原点跟着手指走，所以一次按住能连续修方向', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 200 });
  target.emit('pointermove', { pointerId: 1, clientX: 200 + STEER_RANGE + 60 });
  assert.equal(input.snapshot().steer, 1);
  // 往回拖一点就该立刻回舵，而不是还停在满舵。
  target.emit('pointermove', { pointerId: 1, clientX: 200 + STEER_RANGE - 10 });
  assert.ok(input.snapshot().steer < 1);
  target.emit('pointerup', { pointerId: 1 });
  assert.equal(input.snapshot().steer, 0);
  input.dispose();
});

test('别的手指不干扰：第二个 pointer 被忽略', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 100 });
  target.emit('pointerdown', { pointerId: 2, clientX: 300 });
  target.emit('pointermove', { pointerId: 2, clientX: 400 });
  assert.equal(input.snapshot().steer, 0, '第二根手指不该抢方向');
  input.dispose();
});

test('屏幕按钮走 hold / press，和键盘取并集', () => {
  const target = fakeTarget();
  const pad = createInput(target, { keyboard: false, pointer: false });
  pad.hold('right', true);
  pad.press('boost');
  const touch = pad.snapshot();
  assert.equal(touch.steer, 1);
  assert.equal(touch.boost, true);
  const keys = { steer: 0, drift: true, boost: false };
  const merged = mergeInput(keys, touch);
  assert.equal(merged.steer, 1);
  assert.equal(merged.drift, true);
  assert.equal(merged.boost, true);
  pad.dispose();
});

test('暂停键走回调，dispose 之后监听器清干净', () => {
  const target = fakeTarget();
  let paused = 0;
  const input = createInput(target, { pointer: false, onPause: () => { paused += 1; } });
  target.emit('keydown', { code: 'Escape' });
  target.emit('keydown', { code: 'KeyP', repeat: true });
  assert.equal(paused, 1, '长按重复不该反复暂停');
  input.dispose();
  assert.equal(target.count, 0);
});
