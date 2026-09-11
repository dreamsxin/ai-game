import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIPE_THRESHOLD, TAP_MAX_MS, createInput, mergeInput } from '../src/game/input.js';

// 用一个假 target 收集监听器，测试就不需要 DOM。
const createTarget = () => {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    removeEventListener(type) {
      handlers.delete(type);
    },
    emit(type, event) {
      handlers.get(type)?.(event);
    },
  };
};

const swipe = (target, dx, dy) => {
  target.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, timeStamp: 0 });
  target.emit('pointermove', { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy, timeStamp: 40 });
  target.emit('pointerup', { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy, timeStamp: 80 });
};

test('each swipe direction maps to its action', () => {
  const cases = [
    [SWIPE_THRESHOLD + 5, 0, 'right'],
    [-(SWIPE_THRESHOLD + 5), 0, 'left'],
    [0, -(SWIPE_THRESHOLD + 5), 'jump'],
    [0, SWIPE_THRESHOLD + 5, 'slide'],
  ];
  for (const [dx, dy, action] of cases) {
    const target = createTarget();
    const input = createInput(target, { keyboard: false });
    swipe(target, dx, dy);
    assert.equal(input.snapshot()[action], true, `位移 (${dx}, ${dy}) 应触发 ${action}`);
    input.dispose();
  }
});

test('斜向滑动只认位移更大的那个轴', () => {
  const target = createTarget();
  const input = createInput(target, { keyboard: false });
  swipe(target, SWIPE_THRESHOLD + 20, -(SWIPE_THRESHOLD + 5));
  const frame = input.snapshot();
  assert.equal(frame.right, true);
  assert.equal(frame.jump, false, '水平位移更大时不该同时起跳');
});

test('a short tap counts as a jump but a long press does not', () => {
  const target = createTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });
  target.emit('pointerup', { pointerId: 1, clientX: 12, clientY: 11, timeStamp: 100 });
  assert.equal(input.snapshot().jump, true);

  target.emit('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: 0 });
  target.emit('pointerup', { pointerId: 1, clientX: 10, clientY: 10, timeStamp: TAP_MAX_MS + 200 });
  assert.equal(input.snapshot().jump, false, '长按不应被当成跳跃');
});

test('keyboard covers the same four actions plus pause', () => {
  const target = createTarget();
  let pauses = 0;
  const input = createInput(target, { pointer: false, onPause: () => { pauses += 1; } });
  for (const code of ['ArrowLeft', 'KeyD', 'Space', 'ArrowDown']) {
    target.emit('keydown', { code, repeat: false, preventDefault() {} });
  }
  assert.deepEqual(input.snapshot(), { left: true, right: true, jump: true, slide: true });

  target.emit('keydown', { code: 'Escape', repeat: false });
  target.emit('keydown', { code: 'KeyP', repeat: false });
  assert.equal(pauses, 2);

  target.emit('keydown', { code: 'ArrowUp', repeat: true });
  assert.equal(input.snapshot().jump, false, '按键自动重复不应刷出连跳');
});

test('snapshot 取走后即清空，两路输入可以合并', () => {
  const target = createTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'ArrowLeft', repeat: false });
  assert.equal(input.snapshot().left, true);
  assert.deepEqual(input.snapshot(), { left: false, right: false, jump: false, slide: false });

  assert.deepEqual(
    mergeInput(
      { left: true, right: false, jump: false, slide: false },
      { left: false, right: false, jump: true, slide: false },
    ),
    { left: true, right: false, jump: true, slide: false },
  );
});

test('disposing removes every listener it added', () => {
  const target = createTarget();
  const input = createInput(target);
  assert.equal(target.handlers.size, 5);
  input.dispose();
  assert.equal(target.handlers.size, 0);
});

