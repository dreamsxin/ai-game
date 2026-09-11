import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_INPUT, JUMP_SIDE, RUN_DRAG, STEER_DEADZONE, createInput, mergeInput } from '../src/game/input.js';

// 假 target：只实现监听器注册和 getBoundingClientRect，够 createInput 用。
const fakeTarget = ({ width = 400 } = {}) => {
  const listeners = new Map();
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height: 200 }),
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

test('方向键是按住状态，跳跃既是脉冲也是按住', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'ArrowRight' });
  target.emit('keydown', { code: 'Space', preventDefault() {} });
  const first = input.snapshot();
  assert.equal(first.held.right, true);
  assert.equal(first.jump, true);
  assert.equal(first.held.jump, true);

  const second = input.snapshot();
  assert.equal(second.jump, false, '脉冲只报告一帧');
  assert.equal(second.held.jump, true, '按住状态一直有效');

  target.emit('keyup', { code: 'Space' });
  target.emit('keyup', { code: 'ArrowRight' });
  const third = input.snapshot();
  assert.equal(third.held.jump, false);
  assert.equal(third.held.right, false);
});

test('长按跳跃键的自动重复不会补发脉冲', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'KeyZ' });
  assert.equal(input.snapshot().jump, true);
  target.emit('keydown', { code: 'KeyZ', repeat: true });
  assert.equal(input.snapshot().jump, false);
});

test('Esc 与 P 触发暂停回调，失焦清掉按住状态', () => {
  const target = fakeTarget();
  let pauses = 0;
  const input = createInput(target, { pointer: false, onPause: () => { pauses += 1; } });
  target.emit('keydown', { code: 'Escape' });
  target.emit('keydown', { code: 'KeyP' });
  assert.equal(pauses, 2);
  target.emit('keydown', { code: 'ArrowLeft' });
  target.emit('blur', {});
  assert.equal(input.snapshot().held.left, false);
});

test('右半屏按下就是跳，抬手才结束', () => {
  const target = fakeTarget({ width: 400 });
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 400 * JUMP_SIDE + 20, clientY: 100 });
  const frame = input.snapshot();
  assert.equal(frame.jump, true);
  assert.equal(frame.held.jump, true);
  target.emit('pointerup', { pointerId: 1, clientX: 300, clientY: 100 });
  assert.equal(input.snapshot().held.jump, false);
});

test('左半屏当摇杆：过了死区才走，拖得远才跑', () => {
  const target = fakeTarget({ width: 400 });
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 2, clientX: 60, clientY: 100 });
  assert.equal(input.snapshot().held.right, false, '刚按下不动');

  target.emit('pointermove', { pointerId: 2, clientX: 60 + STEER_DEADZONE + 1, clientY: 100 });
  let frame = input.snapshot();
  assert.equal(frame.held.right, true);
  assert.equal(frame.held.run, false);

  target.emit('pointermove', { pointerId: 2, clientX: 60 + RUN_DRAG + 1, clientY: 100 });
  frame = input.snapshot();
  assert.equal(frame.held.right, true);
  assert.equal(frame.held.run, true);

  target.emit('pointermove', { pointerId: 2, clientX: 60 - RUN_DRAG - 1, clientY: 100 });
  frame = input.snapshot();
  assert.equal(frame.held.left, true);
  assert.equal(frame.held.right, false);

  target.emit('pointercancel', { pointerId: 2, clientX: 0, clientY: 100 });
  assert.equal(input.snapshot().held.left, false);
});

test('摇杆和跳跃可以同时按住，互不影响', () => {
  const target = fakeTarget({ width: 400 });
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 3, clientX: 40, clientY: 100 });
  target.emit('pointermove', { pointerId: 3, clientX: 40 + RUN_DRAG + 5, clientY: 100 });
  target.emit('pointerdown', { pointerId: 4, clientX: 380, clientY: 100 });
  const frame = input.snapshot();
  assert.equal(frame.held.right, true);
  assert.equal(frame.held.run, true);
  assert.equal(frame.held.jump, true);

  target.emit('pointerup', { pointerId: 4, clientX: 380, clientY: 100 });
  const after = input.snapshot();
  assert.equal(after.held.jump, false);
  assert.equal(after.held.right, true, '抬起跳跃手指不该停下跑动');
});

test('屏幕按钮走 hold 接口，按下跳跃同时补一个脉冲', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false, pointer: false });
  input.hold('jump', true);
  const frame = input.snapshot();
  assert.equal(frame.jump, true);
  assert.equal(frame.held.jump, true);
  input.hold('jump', false);
  assert.equal(input.snapshot().held.jump, false);
});

test('dispose 摘掉所有监听器', () => {
  const target = fakeTarget();
  const input = createInput(target);
  assert.ok(target.total() > 0);
  input.dispose();
  assert.equal(target.total(), 0);
});

test('两份输入合并成一份，空输入是全 false', () => {
  const merged = mergeInput(
    { jump: false, held: { left: true, right: false, run: false, jump: false } },
    { jump: true, held: { left: false, right: false, run: true, jump: true } },
  );
  assert.deepEqual(merged, { jump: true, held: { left: true, right: false, run: true, jump: true } });
  assert.deepEqual(mergeInput(EMPTY_INPUT, EMPTY_INPUT), EMPTY_INPUT);
});
