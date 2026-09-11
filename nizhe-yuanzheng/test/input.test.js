import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_KEYS, HOLD_KEYS, advanceSteer, createInput, holdAction, keyAction, mergeControls } from '../src/game/input.js';
import { CAMERA_MODES, advanceCamera, bearingTo, createCameraState, mapPoint, rigOf } from '../src/scene/camera.js';
import { quatFromYaw } from '../src/game/vec.js';

// 极简 EventTarget 替身：能挂、能派发、能摘就够测输入状态机了。
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

const key = (code, extra = {}) => ({ code, preventDefault: () => {}, ...extra });

test('按键分成「按住的」和「点一下的」两类，互不重叠', () => {
  for (const code of Object.keys(HOLD_KEYS)) assert.equal(keyAction(code), null, `${code} 不该同时是一次性动作`);
  for (const code of Object.keys(ACTION_KEYS)) assert.equal(holdAction(code), null);
  assert.equal(holdAction('KeyW'), 'throttle');
  assert.equal(keyAction('KeyE'), 'winchToggle');
  assert.equal(keyAction('F5'), null);
});

test('五个挡位都有对应按键', () => {
  const actions = new Set(Object.values(ACTION_KEYS));
  for (const gear of ['gearR', 'gearN', 'gearA', 'gearL', 'gearLL']) assert.ok(actions.has(gear), `缺少 ${gear} 的按键`);
});

test('按住油门和刹车会进快照，抬手就消失', () => {
  const target = fakeTarget();
  const input = createInput(target);
  target.emit('keydown', key('KeyW'));
  assert.equal(input.axes(1 / 60).throttle, 1);
  target.emit('keyup', key('KeyW'));
  assert.equal(input.axes(1 / 60).throttle, 0);
  target.emit('keydown', key('Space'));
  assert.equal(input.axes(1 / 60).handbrake, true);
});

test('长按不会重复派发一次性动作', () => {
  const target = fakeTarget();
  const actions = [];
  createInput(target, { onAction: (action) => actions.push(action) });
  target.emit('keydown', key('KeyG'));
  target.emit('keydown', key('KeyG', { repeat: true }));
  target.emit('keydown', key('Digit4'));
  assert.deepEqual(actions, ['diffLock', 'gearL']);
});

test('方向键的转向是渐进的，松手回中更快', () => {
  const held = new Set(['right']);
  let steer = 0;
  for (let index = 0; index < 6; index += 1) steer = advanceSteer(steer, held, 1 / 60);
  assert.ok(steer > 0 && steer < 1, `六帧就打满了：${steer}`);
  const pressed = steer;
  const released = advanceSteer(pressed, new Set(), 1 / 60);
  assert.ok(pressed - released > 0);
  assert.ok(pressed - released > (steer - 0) / 6 * 0.9, '回中应该比打方向快');
});

test('转向量夹在 ±1，回中不会越过零点', () => {
  let steer = 0;
  for (let index = 0; index < 200; index += 1) steer = advanceSteer(steer, new Set(['left']), 1 / 60);
  assert.equal(steer, -1);
  assert.equal(advanceSteer(0.001, new Set(), 1), 0);
});

test('触屏和键盘合并：绝对值大的那个说话', () => {
  const held = new Set(['throttle']);
  const merged = mergeControls(held, { brake: 0.4, steer: 0.9 }, 0.2);
  assert.equal(merged.throttle, 1);
  assert.equal(merged.brake, 0.4);
  assert.equal(merged.steer, 0.9);
  const keyboardWins = mergeControls(new Set(), { steer: 0.1 }, -0.8);
  assert.equal(keyboardWins.steer, -0.8);
});

test('切走标签页会松开所有按键，回来时车不会还在焖油门', () => {
  const target = fakeTarget();
  const input = createInput(target);
  target.emit('keydown', key('KeyW'));
  target.emit('blur', {});
  assert.equal(input.axes(1 / 60).throttle, 0);
});

test('dispose 之后不再收到任何输入', () => {
  const target = fakeTarget();
  const actions = [];
  const input = createInput(target, { onAction: (action) => actions.push(action) });
  input.dispose();
  target.emit('keydown', key('KeyG'));
  target.emit('keydown', key('KeyW'));
  assert.equal(actions.length, 0);
  assert.equal(input.axes(1 / 60).throttle, 0);
});

const fakeVehicle = (yaw = 0, speed = 0) => ({
  position: { x: 0, y: 5, z: 0 },
  quaternion: quatFromYaw(yaw),
  forwardSpeed: speed,
});

test('相机停在车后方，并且高于车', () => {
  const rig = createCameraState();
  const vehicle = fakeVehicle(0);
  for (let index = 0; index < 240; index += 1) advanceCamera(rig, vehicle, 'chase', 1 / 60);
  // 车头朝 -z，所以相机该在 +z 一侧。
  assert.ok(rig.position.z > 5, `相机没在车后：z=${rig.position.z.toFixed(2)}`);
  assert.ok(rig.position.y > vehicle.position.y);
  assert.ok(Math.abs(rig.position.x) < 0.5);
});

test('车转向之后相机跟过去', () => {
  const rig = createCameraState();
  const vehicle = fakeVehicle(Math.PI / 2);
  for (let index = 0; index < 240; index += 1) advanceCamera(rig, vehicle, 'chase', 1 / 60);
  // 车头朝 +x，相机该退到 -x。
  assert.ok(rig.position.x < -5, `相机没跟上转向：x=${rig.position.x.toFixed(2)}`);
});

test('速度越快镜头拉得越远', () => {
  const slow = createCameraState();
  const fast = createCameraState();
  for (let index = 0; index < 300; index += 1) {
    advanceCamera(slow, fakeVehicle(0, 0), 'chase', 1 / 60);
    advanceCamera(fast, fakeVehicle(0, 15), 'chase', 1 / 60);
  }
  assert.ok(fast.distance > slow.distance);
});

test('相机不会钻到地下', () => {
  const rig = createCameraState();
  for (let index = 0; index < 120; index += 1) advanceCamera(rig, fakeVehicle(0), 'chase', 1 / 60, 40);
  assert.ok(rig.position.y >= 41.2 - 1e-9);
});

test('三种镜头模式各有自己的距离和视野', () => {
  assert.deepEqual(CAMERA_MODES, ['chase', 'high', 'cockpit']);
  const chase = rigOf('chase');
  const high = rigOf('high');
  const cockpit = rigOf('cockpit');
  assert.ok(high.distance > chase.distance && high.height > chase.height);
  assert.ok(cockpit.distance < chase.distance && cockpit.fov > chase.fov);
  assert.equal(rigOf('nope'), chase, '未知模式退回跟随视角');
});

test('小地图坐标压到 0..1 并夹住越界', () => {
  assert.deepEqual(mapPoint(0, 0, 512), { u: 0.5, v: 0.5 });
  assert.deepEqual(mapPoint(-256, -256, 512), { u: 0, v: 0 });
  assert.deepEqual(mapPoint(9999, 9999, 512), { u: 1, v: 1 });
});

test('罗盘方位：目标在正前方是 0，在右手边是正数', () => {
  const vehicle = fakeVehicle(0);
  assert.ok(Math.abs(bearingTo(vehicle, { x: 0, z: -50 })) < 1e-6);
  assert.ok(bearingTo(vehicle, { x: 50, z: -50 }) > 0);
  assert.ok(bearingTo(vehicle, { x: -50, z: -50 }) < 0);
});
