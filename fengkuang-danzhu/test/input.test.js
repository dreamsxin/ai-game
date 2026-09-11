import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput, mergeInput } from '../src/game/input.js';

// 假 target：只实现监听器注册和 getBoundingClientRect，够 createInput 用。
const fakeTarget = ({ width = 350, height = 800 } = {}) => {
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

// 350x800 的场地是 7x13 格，每格 50 像素，上下各留 75 像素。
const point = (x, y) => ({ pointerId: 1, clientX: x * 50, clientY: y * 50 + 75 });

test('按下和拖动都在报告瞄准点', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', point(3.5, 4));
  assert.deepEqual(input.snapshot().aimAt, { x: 3.5, y: 4 });
  target.emit('pointermove', point(1, 2));
  const frame = input.snapshot();
  assert.deepEqual(frame.aimAt, { x: 1, y: 2 });
  assert.equal(frame.fire, false, '还没松手就不开火');
  input.dispose();
});

test('松手就是开火，抬手那一刻的方向为准', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', point(3.5, 10));
  target.emit('pointermove', point(5, 6));
  target.emit('pointerup', point(6, 3));
  const frame = input.snapshot();
  assert.equal(frame.fire, true);
  assert.deepEqual(frame.aimAt, { x: 6, y: 3 });
  assert.equal(input.snapshot().fire, false, '同一次开火不会被消费两次');
  input.dispose();
});

test('取消手势不开火，但瞄准点留着', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.emit('pointerdown', point(2, 5));
  target.emit('pointercancel', point(2, 5));
  const frame = input.snapshot();
  assert.equal(frame.fire, false);
  assert.deepEqual(frame.aimAt, { x: 2, y: 5 });
  input.dispose();
});

test('左右键给微调方向，右为正', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'ArrowRight' });
  assert.equal(input.snapshot().nudge, 1);
  target.emit('keydown', { code: 'ArrowLeft' });
  assert.equal(input.snapshot().nudge, 0, '两边同时按住互相抵消');
  target.emit('keyup', { code: 'ArrowRight' });
  assert.equal(input.snapshot().nudge, -1);
  target.emit('keyup', { code: 'ArrowLeft' });
  assert.equal(input.snapshot().nudge, 0);
  input.dispose();
});

test('空格开火，长按不连发', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.emit('keydown', { code: 'Space' });
  assert.equal(input.snapshot().fire, true);
  target.emit('keydown', { code: 'Space', repeat: true });
  assert.equal(input.snapshot().fire, false);
  input.dispose();
});

test('Esc 与 P 触发暂停回调', () => {
  const target = fakeTarget();
  let paused = 0;
  const input = createInput(target, { pointer: false, onPause: () => { paused += 1; } });
  target.emit('keydown', { code: 'Escape' });
  target.emit('keydown', { code: 'KeyP' });
  target.emit('keydown', { code: 'KeyP', repeat: true });
  assert.equal(paused, 2);
  input.dispose();
});

test('dispose 会摘掉所有监听器', () => {
  const target = fakeTarget();
  const input = createInput(target);
  assert.ok(target.total() > 0);
  input.dispose();
  assert.equal(target.total(), 0);
});

test('手动触发的瞄准和开火也进快照', () => {
  const input = createInput(fakeTarget(), { keyboard: false, pointer: false });
  input.aimTo({ x: 1, y: 2 });
  input.pressFire();
  const frame = input.snapshot();
  assert.deepEqual(frame.aimAt, { x: 1, y: 2 });
  assert.equal(frame.fire, true);
  input.dispose();
});

test('合并输入时触屏优先，按键兜底', () => {
  const merged = mergeInput({ aimAt: { x: 1, y: 1 }, nudge: 0, fire: false }, { aimAt: { x: 5, y: 5 }, nudge: -1, fire: true });
  assert.deepEqual(merged.aimAt, { x: 1, y: 1 });
  assert.equal(merged.nudge, -1);
  assert.equal(merged.fire, true);
  assert.equal(mergeInput({ aimAt: null, nudge: 0, fire: false }, { aimAt: null, nudge: 0, fire: false }).aimAt, null);
});
