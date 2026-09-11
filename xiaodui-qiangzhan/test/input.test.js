import test from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../src/game/arena.js';
import { viewBox } from '../src/game/layout.js';
import { FIRE_MAG, STICK_RADIUS, createInput, mergeInput } from '../src/game/input.js';

const arena = createArena();
const WIDTH = 640;
const HEIGHT = 360;
const box = viewBox(WIDTH, HEIGHT, arena.cols, arena.rows);

// 假 target：只实现监听器注册和 getBoundingClientRect，够 createInput 用。
const fakeTarget = () => {
  const listeners = new Map();
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }),
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

const keyboardInput = (over = {}) => createInput(fakeTarget(), { arena, pointer: false, ...over });

test('WASD 给出归一化的自由移动向量', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, pointer: false });
  target.emit('keydown', { code: 'KeyD' });
  assert.deepEqual(input.snapshot().move, { x: 1, y: 0 });
  target.emit('keydown', { code: 'KeyW' });
  const diagonal = input.snapshot().move;
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9, '斜着走不该更快');
  assert.ok(diagonal.y < 0, 'W 是往上');
  target.emit('keydown', { code: 'KeyS' });
  assert.ok(Math.abs(input.snapshot().move.y) < 1e-9, '上下同时按住互相抵消');
  target.emit('keyup', { code: 'KeyD' });
  target.emit('keyup', { code: 'KeyW' });
  target.emit('keyup', { code: 'KeyS' });
  assert.deepEqual(input.snapshot().move, { x: 0, y: 0 });
  input.dispose();
});

test('鼠标位置换成场上坐标，交给模拟层算枪口角', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, keyboard: false });
  target.emit('pointermove', {
    pointerType: 'mouse',
    clientX: box.originX + 12 * box.scale,
    clientY: box.originY + 6 * box.scale,
  });
  const frame = input.snapshot();
  assert.ok(Math.abs(frame.aimPoint.x - 12) < 1e-6);
  assert.ok(Math.abs(frame.aimPoint.y - 6) < 1e-6);
  assert.equal(frame.aimAngle, null, '鼠标不给角度，只给点');
  input.dispose();
});

test('鼠标左键开火，右键端稳，松手都归零', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, keyboard: false });
  target.emit('pointerdown', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
  assert.equal(input.snapshot().fire, true);
  target.emit('pointerup', { pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
  assert.equal(input.snapshot().fire, false);
  target.emit('pointerdown', { pointerType: 'mouse', button: 2, clientX: 100, clientY: 100 });
  assert.equal(input.snapshot().focus, true);
  target.emit('pointerup', { pointerType: 'mouse', button: 2, clientX: 100, clientY: 100 });
  assert.equal(input.snapshot().focus, false);
  input.dispose();
});

test('空格开火、Shift 端稳、R 换弹只触发一次', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, pointer: false });
  target.emit('keydown', { code: 'Space' });
  assert.equal(input.snapshot().fire, true, '按住就一直开火');
  assert.equal(input.snapshot().fire, true);
  target.emit('keyup', { code: 'Space' });
  assert.equal(input.snapshot().fire, false);
  target.emit('keydown', { code: 'ShiftLeft' });
  assert.equal(input.snapshot().focus, true);
  target.emit('keydown', { code: 'KeyR' });
  assert.equal(input.snapshot().reload, true);
  assert.equal(input.snapshot().reload, false, '同一次换弹不该被消费两次');
  target.emit('keydown', { code: 'KeyR', repeat: true });
  assert.equal(input.snapshot().reload, false, '长按不刷换弹');
  input.dispose();
});

test('左半屏是移动摇杆，推满得到单位向量', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, keyboard: false });
  target.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200 });
  assert.deepEqual(input.snapshot().move, { x: 0, y: 0 }, '刚按下还没推');
  target.emit('pointermove', { pointerId: 1, pointerType: 'touch', clientX: 100 + STICK_RADIUS, clientY: 200 });
  const frame = input.snapshot();
  assert.ok(Math.abs(frame.move.x - 1) < 1e-9);
  assert.equal(frame.fire, false, '左摇杆不开火');
  target.emit('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200 });
  assert.deepEqual(input.snapshot().move, { x: 0, y: 0 }, '松手停下');
  input.dispose();
});

test('右半屏是瞄准摇杆：轻推只转枪口，推过一半才开火', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, keyboard: false });
  target.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 200 });
  const soft = STICK_RADIUS * (FIRE_MAG - 0.1);
  target.emit('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 200 + soft });
  const light = input.snapshot();
  assert.ok(Math.abs(light.aimAngle - Math.PI / 2) < 1e-9, '往下推枪口朝下');
  assert.equal(light.fire, false);
  target.emit('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 200 + STICK_RADIUS });
  assert.equal(input.snapshot().fire, true);
  input.dispose();
});

test('推出圆外时基准跟着手指走，摇杆行程用不完', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, keyboard: false });
  target.emit('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 500, clientY: 200 });
  target.emit('pointermove', { pointerId: 3, pointerType: 'touch', clientX: 500 + STICK_RADIUS * 4, clientY: 200 });
  const stick = input.sticks().aim;
  assert.ok(Math.abs(stick.x - 1) < 1e-9, '仍然是推满，不会超过 1');
  assert.ok(stick.baseX > 500, '基准被拖了过去');
  input.dispose();
});

test('HUD 按钮也能端稳和换弹', () => {
  const input = keyboardInput({ keyboard: false, pointer: false });
  input.setFocus(true);
  input.pressReload();
  const frame = input.snapshot();
  assert.equal(frame.focus, true);
  assert.equal(frame.reload, true);
  input.setFocus(false);
  assert.equal(input.snapshot().focus, false);
  input.dispose();
});

test('Esc 与 P 触发暂停回调，长按不重复', () => {
  const target = fakeTarget();
  let paused = 0;
  const input = createInput(target, { arena, pointer: false, onPause: () => { paused += 1; } });
  target.emit('keydown', { code: 'Escape' });
  target.emit('keydown', { code: 'KeyP' });
  target.emit('keydown', { code: 'KeyP', repeat: true });
  assert.equal(paused, 2);
  input.dispose();
});

test('失焦会松掉所有按键，回到前台不会一直跑', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena, pointer: false });
  target.emit('keydown', { code: 'KeyD' });
  target.emit('keydown', { code: 'Space' });
  target.emit('blur', {});
  const frame = input.snapshot();
  assert.deepEqual(frame.move, { x: 0, y: 0 });
  assert.equal(frame.fire, false);
  input.dispose();
});

test('dispose 会摘掉所有监听器', () => {
  const target = fakeTarget();
  const input = createInput(target, { arena });
  assert.ok(target.total() > 0);
  input.dispose();
  assert.equal(target.total(), 0);
});

test('合并输入：谁有动作谁说话', () => {
  const keys = { move: { x: 0, y: 0 }, aimAngle: null, aimPoint: { x: 3, y: 4 }, fire: false, focus: false, reload: false };
  const touch = { move: { x: 1, y: 0 }, aimAngle: 0.5, aimPoint: null, fire: true, focus: false, reload: false };
  const merged = mergeInput(keys, touch);
  assert.deepEqual(merged.move, { x: 1, y: 0 }, '键盘没推就用摇杆');
  assert.equal(merged.aimAngle, 0.5);
  assert.deepEqual(merged.aimPoint, { x: 3, y: 4 });
  assert.equal(merged.fire, true);
});
