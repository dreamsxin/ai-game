import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_THRESHOLD, TAP_MAX_MS, createInput, keyAction, resolveDrag } from '../src/game/input.js';

// 极简 EventTarget 替身：只要能挂、能派发、能摘就够测手势状态机了。
function fakeTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    emit(type, event) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
  };
}

const down = (x, y, timeStamp = 0) => ({ pointerId: 1, clientX: x, clientY: y, timeStamp });

test('没过阈值就不算滑动', () => {
  assert.equal(resolveDrag(0, 0), null);
  assert.equal(resolveDrag(DRAG_THRESHOLD - 1, DRAG_THRESHOLD - 1), null);
});

test('取位移更大的轴，斜向滑动不会同时推行和推列', () => {
  assert.deepEqual(resolveDrag(40, 12), { axis: 'x', sign: 1 });
  assert.deepEqual(resolveDrag(-40, 12), { axis: 'x', sign: -1 });
  assert.deepEqual(resolveDrag(10, 40), { axis: 'y', sign: 1 });
  assert.deepEqual(resolveDrag(10, -40), { axis: 'y', sign: -1 });
});

test('两轴相等时判成横向，手机上横滑更常见', () => {
  assert.deepEqual(resolveDrag(40, 40), { axis: 'x', sign: 1 });
});

test('轻点派发 tap，坐标是抬手位置', () => {
  const target = fakeTarget();
  const taps = [];
  createInput(target, { onTap: (event) => taps.push(event), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointerup', down(102, 201, 120));
  assert.deepEqual(taps, [{ x: 102, y: 201 }]);
});

test('按太久不算轻点', () => {
  const target = fakeTarget();
  const taps = [];
  createInput(target, { onTap: (event) => taps.push(event), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointerup', down(100, 200, TAP_MAX_MS + 50));
  assert.equal(taps.length, 0);
});

test('滑动派发 drag，坐标是起手位置', () => {
  const target = fakeTarget();
  const drags = [];
  createInput(target, { onDrag: (event) => drags.push(event), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointermove', down(160, 205, 60));
  // 推移要按起手的那条线算，中途手指飘走也不能推错一条。
  assert.deepEqual(drags, [{ x: 100, y: 200, axis: 'x', sign: 1 }]);
});

test('一次滑动只推一格，后续移动不再派发', () => {
  const target = fakeTarget();
  const drags = [];
  createInput(target, { onDrag: (event) => drags.push(event), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointermove', down(160, 200, 40));
  target.emit('pointermove', down(240, 200, 80));
  assert.equal(drags.length, 1);
});

test('滑动之后抬手不会再补一个 tap', () => {
  const target = fakeTarget();
  const taps = [];
  const drags = [];
  createInput(target, { onTap: (e) => taps.push(e), onDrag: (e) => drags.push(e), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointermove', down(160, 200, 40));
  target.emit('pointerup', down(160, 200, 80));
  assert.equal(drags.length, 1);
  assert.equal(taps.length, 0);
});

test('抬手后能立刻开始下一次手势', () => {
  const target = fakeTarget();
  const drags = [];
  createInput(target, { onDrag: (e) => drags.push(e), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointermove', down(160, 200, 40));
  target.emit('pointerup', down(160, 200, 80));
  target.emit('pointerdown', down(100, 200, 100));
  target.emit('pointermove', down(100, 260, 140));
  assert.deepEqual(drags.at(-1), { x: 100, y: 200, axis: 'y', sign: 1 });
});

test('第二根手指不会打断第一根', () => {
  const target = fakeTarget();
  const drags = [];
  createInput(target, { onDrag: (e) => drags.push(e), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointerdown', { pointerId: 2, clientX: 300, clientY: 300, timeStamp: 10 });
  target.emit('pointermove', { pointerId: 2, clientX: 380, clientY: 300, timeStamp: 20 });
  assert.equal(drags.length, 0, '第二根手指的移动不该被当成滑动');
  target.emit('pointermove', down(40, 200, 30));
  assert.deepEqual(drags, [{ x: 100, y: 200, axis: 'x', sign: -1 }]);
});

test('按键映射到语义动作，不认的键不派发', () => {
  assert.equal(keyAction('ArrowLeft'), 'left');
  assert.equal(keyAction('KeyD'), 'right');
  assert.equal(keyAction('KeyZ'), 'undo');
  assert.equal(keyAction('KeyE'), 'layerUp');
  assert.equal(keyAction('F5'), null);
});

test('按键派发动作并阻止默认滚动，长按重复被忽略', () => {
  const target = fakeTarget();
  const actions = [];
  let prevented = 0;
  createInput(target, { onAction: (action) => actions.push(action), pointer: false });
  target.emit('keydown', { code: 'ArrowUp', preventDefault: () => { prevented += 1; } });
  target.emit('keydown', { code: 'ArrowUp', repeat: true, preventDefault: () => { prevented += 1; } });
  target.emit('keydown', { code: 'F5', preventDefault: () => { prevented += 1; } });
  assert.deepEqual(actions, ['up']);
  assert.equal(prevented, 1);
});

test('dispose 之后不再收到任何事件', () => {
  const target = fakeTarget();
  const taps = [];
  const input = createInput(target, { onTap: (e) => taps.push(e), keyboard: false });
  input.dispose();
  target.emit('pointerdown', down(10, 10, 0));
  target.emit('pointerup', down(10, 10, 50));
  assert.equal(taps.length, 0);
});

test('按下就立刻报出落点，让高亮先亮起来再决定推哪边', () => {
  const target = fakeTarget();
  const presses = [];
  const releases = [];
  createInput(target, {
    onPress: (event) => presses.push(event),
    onRelease: () => releases.push(true),
    keyboard: false,
  });
  target.emit('pointerdown', down(120, 260, 0));
  assert.deepEqual(presses, [{ x: 120, y: 260 }]);
  assert.equal(releases.length, 0, '还没抬手就不该报 release');
  target.emit('pointerup', down(120, 260, 90));
  assert.equal(releases.length, 1);
});

test('滑完抬手也会报 release，高亮不会赖在屏幕上', () => {
  const target = fakeTarget();
  const releases = [];
  createInput(target, { onRelease: () => releases.push(true), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointermove', down(190, 200, 40));
  target.emit('pointerup', down(190, 200, 60));
  assert.equal(releases.length, 1);
});

test('手势被系统打断（pointercancel）同样清掉高亮', () => {
  const target = fakeTarget();
  const releases = [];
  createInput(target, { onRelease: () => releases.push(true), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointercancel', down(100, 200, 30));
  assert.equal(releases.length, 1);
});

test('第二根手指按下时不会覆盖第一根的落点', () => {
  const target = fakeTarget();
  const presses = [];
  createInput(target, { onPress: (event) => presses.push(event), keyboard: false });
  target.emit('pointerdown', down(100, 200, 0));
  target.emit('pointerdown', { pointerId: 2, clientX: 300, clientY: 300, timeStamp: 10 });
  assert.deepEqual(presses, [{ x: 100, y: 200 }]);
});
