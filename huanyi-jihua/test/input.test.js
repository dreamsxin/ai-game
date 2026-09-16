import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_GAIN, EMPTY_INPUT, TAP_SLOP, createInput, mergeInput } from '../src/game/input.js';
import { FIELD_W } from '../src/game/rules.js';

/** 一个够用的假 DOM 目标：记下监听器，让测试能直接派事件。 */
const fakeTarget = (width = 400, height = 600) => {
  const handlers = new Map();
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
    fire: (type, event) => handlers.get(type)?.(event),
    has: (type) => handlers.has(type),
  };
};

const pointer = (id, x, y) => ({ pointerId: id, clientX: x, clientY: y });

test('空输入不动也不弃翼', () => {
  assert.equal(EMPTY_INPUT.jettison, false);
  assert.equal(EMPTY_INPUT.drag.dx, 0);
});

test('按住拖动就是走位，像素位移换算成场地格', () => {
  const target = fakeTarget(400, 600);
  const input = createInput(target, { keyboard: false });
  target.fire('pointerdown', pointer(1, 200, 300));
  target.fire('pointermove', pointer(1, 240, 300));
  const frame = input.snapshot();
  // 400 像素宽对应 100 格，拖 40 像素 = 10 格，再乘灵敏度。
  assert.ok(Math.abs(frame.drag.dx - 10 * DRAG_GAIN) < 0.001);
  assert.equal(frame.jettison, false, '拖动不该顺手把翅膀扔了');
  // 取过一次就清零，位移不会重复计入。
  assert.equal(input.snapshot().drag.dx, 0);
});

test('轻点一下就是弃翼——这是全局唯一的战术按键', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.fire('pointerdown', pointer(1, 100, 100));
  input.tick(0.05);
  target.fire('pointerup', pointer(1, 100, 100));
  assert.equal(input.snapshot().jettison, true);
});

test('拖过一段距离再松手不算轻点', () => {
  const target = fakeTarget(400, 600);
  const input = createInput(target, { keyboard: false });
  target.fire('pointerdown', pointer(1, 100, 100));
  // 拖出去的距离要超过 TAP_SLOP 才算走位手势。
  target.fire('pointermove', pointer(1, 100 + (TAP_SLOP * 400) / FIELD_W + 20, 100));
  input.tick(0.05);
  target.fire('pointerup', pointer(1, 220, 100));
  assert.equal(input.snapshot().jettison, false);
});

test('按住太久再松手也不算轻点，免得慢慢按一下就掉翅膀', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false });
  target.fire('pointerdown', pointer(1, 100, 100));
  input.tick(0.5);
  target.fire('pointerup', pointer(1, 100, 100));
  assert.equal(input.snapshot().jettison, false);
});

test('键盘方向键是按住状态，空格是一次性脉冲', () => {
  const target = fakeTarget();
  const input = createInput(target, { pointer: false });
  target.fire('keydown', { code: 'ArrowLeft' });
  target.fire('keydown', { code: 'Space', preventDefault() {} });
  const frame = input.snapshot();
  assert.equal(frame.held.left, true);
  assert.equal(frame.jettison, true);
  // 脉冲取过就没了，按住空格不会一直弃翼。
  assert.equal(input.snapshot().jettison, false);
  assert.equal(input.snapshot().held.left, true, '方向键要一直按住才算');
  target.fire('keyup', { code: 'ArrowLeft' });
  assert.equal(input.snapshot().held.left, false);
});

test('Esc 和 P 走暂停回调，不当成操作', () => {
  const target = fakeTarget();
  let paused = 0;
  const input = createInput(target, { pointer: false, onPause: () => { paused += 1; } });
  target.fire('keydown', { code: 'Escape' });
  target.fire('keydown', { code: 'KeyP' });
  assert.equal(paused, 2);
  assert.equal(input.snapshot().jettison, false);
});

test('屏幕上的弃翼键和键盘走同一个入口', () => {
  const target = fakeTarget();
  const input = createInput(target, { keyboard: false, pointer: false });
  input.press('jettison');
  assert.equal(input.snapshot().jettison, true);
  input.hold('jettison', true);
  assert.equal(input.snapshot().jettison, true);
});

test('两份输入合并：位移相加，脉冲取或', () => {
  const a = { jettison: false, drag: { dx: 3, dy: -1 }, held: { left: true, right: false, up: false, down: false } };
  const b = { jettison: true, drag: { dx: -1, dy: 2 }, held: { left: false, right: true, up: false, down: false } };
  const merged = mergeInput(a, b);
  assert.equal(merged.jettison, true);
  assert.equal(merged.drag.dx, 2);
  assert.equal(merged.drag.dy, 1);
  assert.equal(merged.held.left, true);
  assert.equal(merged.held.right, true);
});

test('dispose 之后监听器全部摘掉，热更新不会攒着一堆手势', () => {
  const target = fakeTarget();
  const input = createInput(target, {});
  assert.equal(target.has('pointerdown'), true);
  input.dispose();
  assert.equal(target.has('pointerdown'), false);
  assert.equal(target.has('keydown'), false);
});
