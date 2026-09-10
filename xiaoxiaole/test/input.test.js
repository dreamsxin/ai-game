import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIPE_DISTANCE, createInput, mergeInput } from '../src/game/input.js';

// 假 target：只实现监听器注册和 getBoundingClientRect，够 createInput 用。
const fakeTarget = ({ width = 400, height = 400 } = {}) => {
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

// 400x400 的 8x8 棋盘每格 50 像素，格心在 25 + 50n。
const center = (cell) => ({ clientX: cell.x * 50 + 25, clientY: cell.y * 50 + 25 });

const pointer = (target, from, to) => {
  target.emit('pointerdown', { pointerId: 1, ...center(from) });
  if (to) target.emit('pointermove', { pointerId: 1, ...to });
  target.emit('pointerup', { pointerId: 1, ...(to ?? center(from)) });
};

test('轻点报告点到的格子', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  pointer(target, { x: 3, y: 4 });
  const frame = input.snapshot();
  assert.deepEqual(frame.tap, { x: 3, y: 4 });
  assert.equal(frame.swipe, null);
  input.dispose();
});

test('棋盘外的点击不产生输入', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, clientX: -20, clientY: 10 });
  target.emit('pointerup', { pointerId: 1, clientX: -20, clientY: 10 });
  assert.equal(input.snapshot().tap, null);
  input.dispose();
});

test('拖动超过阈值报告换位方向', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  const from = { x: 2, y: 2 };
  pointer(target, from, { clientX: 125 + SWIPE_DISTANCE + 4, clientY: 125 });
  const frame = input.snapshot();
  assert.deepEqual(frame.swipe, { from: { x: 2, y: 2 }, dir: { dx: 1, dy: 0 } });
  assert.equal(frame.tap, null, '拖动过的手势不再算轻点');
  input.dispose();
});

test('斜着拖按位移更大的轴走，一次手势只换一次', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, ...center({ x: 4, y: 4 }) });
  target.emit('pointermove', { pointerId: 1, clientX: 225 + 6, clientY: 225 + SWIPE_DISTANCE + 10 });
  target.emit('pointermove', { pointerId: 1, clientX: 225 + 40, clientY: 225 + 60 });
  target.emit('pointerup', { pointerId: 1, clientX: 265, clientY: 285 });
  const frame = input.snapshot();
  assert.deepEqual(frame.swipe, { from: { x: 4, y: 4 }, dir: { dx: 0, dy: 1 } });
  input.dispose();
});

test('取消手势不会留下输入', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', { pointerId: 1, ...center({ x: 1, y: 1 }) });
  target.emit('pointercancel', { pointerId: 1, clientX: 400, clientY: 400 });
  assert.equal(input.snapshot().tap, null);
  input.dispose();
});

test('快照取走后输入被清空', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  pointer(target, { x: 0, y: 0 });
  assert.ok(input.snapshot().tap);
  assert.equal(input.snapshot().tap, null, '同一次点击不应被消费两次');
  input.dispose();
});

test('方向键移动光标并夹在棋盘内', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false, columns: 8, rows: 8 });
  assert.deepEqual(input.snapshot().cursor, { x: 4, y: 4 });
  target.emit('keydown', { code: 'ArrowLeft' });
  target.emit('keydown', { code: 'ArrowUp' });
  assert.deepEqual(input.snapshot().cursor, { x: 3, y: 3 });
  for (let i = 0; i < 10; i += 1) target.emit('keydown', { code: 'ArrowLeft' });
  assert.deepEqual(input.snapshot().cursor, { x: 0, y: 3 }, '光标不应移出左边界');
  input.dispose();
});

test('空格选中后按方向键直接换位', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'Space' });
  assert.deepEqual(input.snapshot().tap, { x: 4, y: 4 }, '空格等于点一下当前格');
  target.emit('keydown', { code: 'ArrowRight' });
  const frame = input.snapshot();
  assert.deepEqual(frame.swipe, { from: { x: 4, y: 4 }, dir: { dx: 1, dy: 0 } });
  assert.deepEqual(frame.cursor, { x: 4, y: 4 }, '换位不移动光标');
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

test('手动触发的点选和换位也进快照', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false, pointer: false });
  input.pressCell(1, 2);
  input.pressSwipe({ x: 1, y: 2 }, { dx: 0, dy: -1 });
  const frame = input.snapshot();
  assert.deepEqual(frame.tap, { x: 1, y: 2 });
  assert.deepEqual(frame.swipe, { from: { x: 1, y: 2 }, dir: { dx: 0, dy: -1 } });
  input.dispose();
});

test('合并输入时前一份优先', () => {
  const a = { tap: { x: 1, y: 1 }, swipe: null, cursor: { x: 1, y: 1 } };
  const b = { tap: { x: 2, y: 2 }, swipe: { from: { x: 2, y: 2 }, dir: { dx: 1, dy: 0 } }, cursor: { x: 2, y: 2 } };
  const merged = mergeInput(a, b);
  assert.deepEqual(merged.tap, { x: 1, y: 1 });
  assert.deepEqual(merged.swipe, b.swipe, '前一份没有换位时用后一份');
});
