// 输入层的测试。手机上「按了没反应」和「按了乱走」都是致命的，
// 所以这里守三条：斜向一律折成四向、后按的方向盖住先按的、动作键是脉冲。

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEAD_ZONE, createInput, mergeInput, resolveDir } from '../src/game/input.js';

/** 最小事件源：只要有 addEventListener/removeEventListener 就够 createInput 用。 */
function target() {
  const handlers = new Map();
  return {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    send(type, event = {}) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
    count(type) {
      return handlers.get(type)?.size ?? 0;
    },
  };
}

test('斜向一律折成分量大的那一轴，死区内不动', () => {
  assert.deepEqual(resolveDir(40, 10), { x: 1, y: 0 });
  assert.deepEqual(resolveDir(-10, 40), { x: 0, y: 1 });
  assert.deepEqual(resolveDir(30, -31), { x: 0, y: -1 });
  assert.deepEqual(resolveDir(DEAD_ZONE - 2, 0), { x: 0, y: 0 }, '死区内的抖动不该变成走位');
  assert.deepEqual(resolveDir(20, 20), { x: 1, y: 0 }, '正好四十五度时按横向，横巷更常用');
});

test('后按的方向键盖住先按的', () => {
  const host = target();
  const input = createInput(host);
  host.send('keydown', { code: 'ArrowRight' });
  assert.deepEqual(input.snapshot().dir, { x: 1, y: 0 });
  host.send('keydown', { code: 'ArrowUp' });
  assert.deepEqual(input.snapshot().dir, { x: 0, y: -1 }, '两个方向一起按时听最后落下的那个');
  host.send('keyup', { code: 'ArrowUp' });
  assert.deepEqual(input.snapshot().dir, { x: 1, y: 0 }, '松开后回到还按着的那个');
  host.send('keyup', { code: 'ArrowRight' });
  assert.deepEqual(input.snapshot().dir, { x: 0, y: 0 });
  input.dispose();
});

test('动作键是脉冲：一次按下只算一次', () => {
  const host = target();
  const input = createInput(host);
  let prevented = 0;
  host.send('keydown', { code: 'Space', preventDefault: () => { prevented += 1; } });
  const first = input.snapshot();
  assert.equal(first.bomb, true);
  assert.equal(first.struggle, true, '同一颗按钮：活着放弹，被困住挣脱');
  assert.equal(input.snapshot().bomb, false, '不清零的话按住不放会变成连发');
  assert.equal(prevented, 1, '空格要挡住页面滚动');
  input.dispose();
});

test('按住不放不会重复触发（repeat 事件直接丢掉）', () => {
  const host = target();
  const input = createInput(host);
  host.send('keydown', { code: 'KeyJ' });
  input.snapshot();
  host.send('keydown', { code: 'KeyJ', repeat: true });
  assert.equal(input.snapshot().bomb, false);
  input.dispose();
});

test('Escape 和 P 只管暂停，不参与走位', () => {
  const host = target();
  let paused = 0;
  const input = createInput(host, { onPause: () => { paused += 1; } });
  host.send('keydown', { code: 'Escape' });
  host.send('keydown', { code: 'KeyP' });
  assert.equal(paused, 2);
  assert.deepEqual(input.snapshot().dir, { x: 0, y: 0 });
  input.dispose();
});

test('拖过死区才算方向，抬手立刻停', () => {
  const host = target();
  const input = createInput(host, { keyboard: false });
  host.send('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  host.send('pointermove', { pointerId: 1, clientX: 106, clientY: 100 });
  assert.deepEqual(input.snapshot().dir, { x: 0, y: 0 }, '刚按下的小位移是点，不是走');
  host.send('pointermove', { pointerId: 1, clientX: 100 + DEAD_ZONE + 8, clientY: 102 });
  assert.deepEqual(input.snapshot().dir, { x: 1, y: 0 });
  host.send('pointerup', { pointerId: 1 });
  assert.deepEqual(input.snapshot().dir, { x: 0, y: 0 });
  input.dispose();
});

test('一次按住能连续改向，不用抬手重按', () => {
  const host = target();
  const input = createInput(host, { keyboard: false });
  host.send('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  host.send('pointermove', { pointerId: 1, clientX: 400, clientY: 100 });
  assert.deepEqual(input.snapshot().dir, { x: 1, y: 0 });
  // 原点会跟着手指走，所以往回拉一小段就能立刻换成反方向。
  host.send('pointermove', { pointerId: 1, clientX: 340, clientY: 100 });
  assert.deepEqual(input.snapshot().dir, { x: -1, y: 0 });
  input.dispose();
});

test('屏幕按钮和键盘走同一个入口', () => {
  const host = target();
  const input = createInput(host, { keyboard: false, pointer: false });
  input.hold('left', true);
  assert.deepEqual(input.snapshot().dir, { x: -1, y: 0 });
  input.hold('left', false);
  input.press('bomb');
  const frame = input.snapshot();
  assert.deepEqual(frame.dir, { x: 0, y: 0 });
  assert.equal(frame.bomb, true);
  input.dispose();
});

test('dispose 之后不再挂着任何监听', () => {
  const host = target();
  const input = createInput(host);
  assert.ok(host.count('keydown') > 0);
  input.dispose();
  assert.equal(host.count('keydown'), 0);
});

test('键盘和触屏同时在用时取并集，键盘优先给方向', () => {
  const merged = mergeInput(
    { dir: { x: 0, y: -1 }, bomb: false, struggle: false },
    { dir: { x: 1, y: 0 }, bomb: true, struggle: true },
  );
  assert.deepEqual(merged.dir, { x: 0, y: -1 });
  assert.equal(merged.bomb, true);
  const idle = mergeInput(
    { dir: { x: 0, y: 0 }, bomb: false, struggle: false },
    { dir: { x: 1, y: 0 }, bomb: false, struggle: false },
  );
  assert.deepEqual(idle.dir, { x: 1, y: 0 }, '键盘没按时听触屏的');
});
