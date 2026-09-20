import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_INPUT, JUMP_SIDE, createInput, mergeInput } from '../src/game/input.js';

// 一个够用的假 target：能挂事件、能触发事件、能报自己的尺寸。
const makeTarget = (width = 400, height = 200) => {
  const handlers = new Map();
  return {
    addEventListener(type, handler) {
      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
    },
    removeEventListener(type, handler) {
      handlers.set(type, (handlers.get(type) ?? []).filter((item) => item !== handler));
    },
    emit(type, event = {}) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
    count(type) {
      return (handlers.get(type) ?? []).length;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  };
};

const key = (code, extra = {}) => ({ code, preventDefault() {}, repeat: false, ...extra });

test('键盘：方向键是按住状态，跳是一次性脉冲', () => {
  const target = makeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', key('ArrowRight'));
  target.emit('keydown', key('Space'));
  const first = input.snapshot();
  assert.equal(first.held.right, true);
  assert.equal(first.jump, true, '按下的那一帧要有脉冲');
  assert.equal(first.held.jump, true);
  const second = input.snapshot();
  assert.equal(second.jump, false, '脉冲只报一次');
  assert.equal(second.held.jump, true, '按住状态还在');
  target.emit('keyup', key('ArrowRight'));
  assert.equal(input.snapshot().held.right, false);
});

test('键盘：上下是瞄准与蹲下，不是跳', () => {
  const target = makeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', key('ArrowUp'));
  target.emit('keydown', key('ArrowDown'));
  const frame = input.snapshot();
  assert.equal(frame.held.up, true);
  assert.equal(frame.held.down, true);
  assert.equal(frame.jump, false, '上键不许偷偷当跳用');
});

test('按住不放的重复事件不会刷出连续的跳跃脉冲', () => {
  const target = makeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', key('KeyZ'));
  assert.equal(input.snapshot().jump, true);
  target.emit('keydown', key('KeyZ', { repeat: true }));
  assert.equal(input.snapshot().jump, false);
});

test('Esc 和 P 走暂停回调，不进输入帧', () => {
  const target = makeTarget();
  let paused = 0;
  const input = createInput(target, { pointer: false, onPause: () => { paused += 1; } });
  target.emit('keydown', key('Escape'));
  target.emit('keydown', key('KeyP'));
  assert.equal(paused, 2);
  assert.deepEqual(input.snapshot().held, EMPTY_INPUT.held);
});

test('左半屏是摇杆：横着拖走位，竖着拖瞄准', () => {
  const target = makeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 40, clientY: 100 });
  target.emit('pointermove', { pointerId: 1, clientX: 90, clientY: 60 });
  const frame = input.snapshot();
  assert.equal(frame.held.right, true);
  assert.equal(frame.held.up, true, '往上拖就是抬枪');
  assert.equal(frame.held.jump, false, '左半屏不负责跳');
  target.emit('pointerup', { pointerId: 1 });
  assert.equal(input.snapshot().held.right, false);
});

test('右半屏按住就是跳，点一下有脉冲', () => {
  const target = makeTarget();
  const input = createInput(target, { keyboard: false });
  const x = 400 * JUMP_SIDE + 40;
  target.emit('pointerdown', { pointerId: 2, clientX: x, clientY: 100 });
  const frame = input.snapshot();
  assert.equal(frame.jump, true);
  assert.equal(frame.held.jump, true);
  target.emit('pointerup', { pointerId: 2 });
  assert.equal(input.snapshot().held.jump, false);
});

test('屏幕按钮和手势各记一份账，松手不会互相清掉', () => {
  const target = makeTarget();
  const input = createInput(target, { keyboard: false });
  input.hold('right', true);
  target.emit('pointerdown', { pointerId: 3, clientX: 40, clientY: 100 });
  target.emit('pointermove', { pointerId: 3, clientX: 10, clientY: 100 });
  assert.equal(input.snapshot().held.left, true);
  target.emit('pointerup', { pointerId: 3 });
  assert.equal(input.snapshot().held.right, true, '按钮按着的方向不该被手势松手带走');
});

test('dispose 会摘掉所有监听', () => {
  const target = makeTarget();
  const input = createInput(target);
  assert.ok(target.count('keydown') > 0);
  input.dispose();
  assert.equal(target.count('keydown'), 0);
  assert.equal(target.count('pointerdown'), 0);
});

test('两路输入合并成一份：谁按了都算按了', () => {
  const merged = mergeInput(
    { jump: false, held: { left: true, right: false, up: false, down: false, jump: false } },
    { jump: true, held: { left: false, right: false, up: true, down: false, jump: true } },
  );
  assert.deepEqual(merged, {
    jump: true,
    held: { left: true, right: false, up: true, down: false, jump: true },
  });
});
