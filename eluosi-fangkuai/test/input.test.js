import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAG_STEP,
  FLICK_DISTANCE,
  SOFT_DROP_DRAG,
  TAP_MAX_MS,
  createInput,
  mergeInput,
} from '../src/game/input.js';

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

const drag = (target, points) => {
  const [first] = points;
  target.emit('pointerdown', { pointerId: 1, clientX: first.x, clientY: first.y, timeStamp: first.t });
  for (const point of points.slice(1)) {
    target.emit('pointermove', { pointerId: 1, clientX: point.x, clientY: point.y, timeStamp: point.t });
  }
  return points[points.length - 1];
};

test('轻点棋盘等于顺时针旋转', () => {
  const target = createTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, timeStamp: 0 });
  target.emit('pointerup', { pointerId: 1, clientX: 102, clientY: 101, timeStamp: 120 });
  assert.equal(input.snapshot().rotateCW, true);

  target.emit('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, timeStamp: 0 });
  target.emit('pointerup', { pointerId: 1, clientX: 100, clientY: 100, timeStamp: TAP_MAX_MS + 100 });
  assert.equal(input.snapshot().rotateCW, false, '长按不算旋转');
});

test('横向拖动每过一个步长走一格', () => {
  const target = createTarget();
  const input = createInput(target, { keyboard: false });
  drag(target, [
    { x: 100, y: 100, t: 0 },
    { x: 100 + DRAG_STEP, y: 100, t: 60 },
  ]);
  assert.equal(input.snapshot().right, true);

  drag(target, [
    { x: 100, y: 100, t: 0 },
    { x: 100 - DRAG_STEP * 2, y: 100, t: 60 },
  ]);
  const frame = input.snapshot();
  assert.equal(frame.left, true);
  assert.equal(frame.right, false, '反方向拖动不该同时触发右移');
});

test('向下拖住持续软降，松手后停止', () => {
  const target = createTarget();
  const input = createInput(target, { keyboard: false });
  const last = drag(target, [
    { x: 100, y: 100, t: 0 },
    { x: 100, y: 100 + SOFT_DROP_DRAG, t: 400 },
  ]);
  assert.equal(input.snapshot().held.softDrop, true);
  target.emit('pointerup', { pointerId: 1, clientX: last.x, clientY: last.y, timeStamp: 500 });
  assert.equal(input.snapshot().held.softDrop, false);
});

test('快速下甩是硬降，慢慢拖到底只算软降', () => {
  const fast = createTarget();
  const fastInput = createInput(fast, { keyboard: false });
  drag(fast, [
    { x: 100, y: 100, t: 0 },
    { x: 100, y: 100 + FLICK_DISTANCE, t: 120 },
  ]);
  const flick = fastInput.snapshot();
  assert.equal(flick.hardDrop, true);
  assert.equal(flick.held.softDrop, false);

  const slow = createTarget();
  const slowInput = createInput(slow, { keyboard: false });
  drag(slow, [
    { x: 100, y: 100, t: 0 },
    { x: 100, y: 100 + FLICK_DISTANCE, t: 900 },
  ]);
  const dragged = slowInput.snapshot();
  assert.equal(dragged.hardDrop, false);
  assert.equal(dragged.held.softDrop, true);
});

test('向上滑动把方块存进暂存区', () => {
  const target = createTarget();
  const input = createInput(target, { keyboard: false });
  drag(target, [
    { x: 100, y: 200, t: 0 },
    { x: 100, y: 200 - DRAG_STEP - 4, t: 90 },
  ]);
  assert.equal(input.snapshot().hold, true);
});

test('键盘覆盖全部动作，按住方向键会报告 held', () => {
  const target = createTarget();
  let pauses = 0;
  const input = createInput(target, { pointer: false, onPause: () => { pauses += 1; } });
  for (const code of ['ArrowUp', 'KeyZ', 'Space', 'KeyC']) {
    target.emit('keydown', { code, repeat: false, preventDefault() {} });
  }
  const pulses = input.snapshot();
  assert.deepEqual(
    [pulses.rotateCW, pulses.rotateCCW, pulses.hardDrop, pulses.hold],
    [true, true, true, true],
  );

  target.emit('keydown', { code: 'ArrowLeft', repeat: false });
  target.emit('keydown', { code: 'ArrowDown', repeat: false });
  const held = input.snapshot();
  assert.equal(held.left, true, '按下瞬间先走一格');
  assert.deepEqual(held.held, { left: true, right: false, softDrop: true });
  assert.equal(input.snapshot().left, false, '之后交给模拟层的连发计时');

  target.emit('keyup', { code: 'ArrowLeft' });
  target.emit('keyup', { code: 'ArrowDown' });
  assert.deepEqual(input.snapshot().held, { left: false, right: false, softDrop: false });

  target.emit('keydown', { code: 'Escape', repeat: false });
  target.emit('keydown', { code: 'KeyP', repeat: false });
  assert.equal(pauses, 2);
  target.emit('keydown', { code: 'KeyX', repeat: true });
  assert.equal(input.snapshot().rotateCW, false, '按键自动重复不刷出连转');
});

test('失焦清空按住状态，dispose 摘掉所有监听器', () => {
  const target = createTarget();
  const input = createInput(target);
  target.emit('keydown', { code: 'ArrowRight', repeat: false });
  assert.equal(input.snapshot().held.right, true);
  target.emit('blur', {});
  assert.equal(input.snapshot().held.right, false);

  assert.equal(target.handlers.size, 7);
  input.dispose();
  assert.equal(target.handlers.size, 0);
});

test('两路输入可以合并', () => {
  const keys = { left: true, right: false, rotateCW: false, rotateCCW: false, hardDrop: false, hold: false, held: { left: true, right: false, softDrop: false } };
  const touch = { left: false, right: false, rotateCW: true, rotateCCW: false, hardDrop: false, hold: false, held: { left: false, right: false, softDrop: true } };
  assert.deepEqual(mergeInput(keys, touch), {
    left: true,
    right: false,
    rotateCW: true,
    rotateCCW: false,
    hardDrop: false,
    hold: false,
    held: { left: true, right: false, softDrop: true },
  });
});
