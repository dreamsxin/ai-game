import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basisOf,
  cross,
  dot,
  normalize,
  quatFromYaw,
  quatIntegrate,
  quatMultiply,
  quatNormalize,
  rotate,
  tiltOf,
  unrotate,
  wrapAngle,
  yawOf,
} from '../src/game/vec.js';

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} 不接近 ${expected}`);

test('零向量归一化退化成朝上，不产生 NaN', () => {
  assert.deepEqual(normalize({ x: 0, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
});

test('叉积右手系：x × y = z', () => {
  assert.deepEqual(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
});

// 这条是整个游戏最容易写错的地方：航向角和四元数的方向约定必须互为逆运算，
// 错了车会朝着与航向差 90 度的方向开，而物理本身看起来完全正常。
test('yawOf 是 quatFromYaw 的逆运算', () => {
  for (const yaw of [0, 0.4, 1.87, -2.2, Math.PI - 0.01]) {
    close(wrapAngle(yawOf(quatFromYaw(yaw)) - yaw), 0, 1e-6);
  }
});

test('yaw=0 车头朝 -z，yaw 增大朝 +x 转', () => {
  const zero = basisOf(quatFromYaw(0));
  close(zero.forward.x, 0);
  close(zero.forward.z, -1);
  const quarter = basisOf(quatFromYaw(Math.PI / 2));
  close(quarter.forward.x, 1);
  close(quarter.forward.z, 0, 1e-6);
});

test('航向朝目标点的公式和 basis 一致', () => {
  // level.js 用 atan2(dx, -dz) 算发车航向，这里验证它确实指向目标。
  const target = { x: 58, z: 18 };
  const forward = basisOf(quatFromYaw(Math.atan2(target.x, -target.z))).forward;
  const length = Math.hypot(target.x, target.z);
  close(forward.x, target.x / length, 1e-6);
  close(forward.z, target.z / length, 1e-6);
});

test('unrotate 抵消 rotate', () => {
  const q = quatNormalize(quatMultiply(quatFromYaw(0.7), { x: 0.2, y: 0, z: 0.1, w: 0.9 }));
  const v = { x: 1.3, y: -0.4, z: 2.2 };
  const back = unrotate(q, rotate(q, v));
  close(back.x, v.x, 1e-6);
  close(back.y, v.y, 1e-6);
  close(back.z, v.z, 1e-6);
});

test('绕水平轴转半圈就是彻底翻过去', () => {
  close(tiltOf(quatFromYaw(1.2)), 0, 1e-6);
  const rolled = { x: 1, y: 0, z: 0, w: 0 };
  close(tiltOf(quatNormalize(rolled)), Math.PI, 1e-6);
});

test('角速度积分后四元数保持单位长度', () => {
  let q = quatFromYaw(0.3);
  for (let step = 0; step < 400; step += 1) {
    q = quatIntegrate(q, { x: 0.6, y: -1.4, z: 0.9 }, 1 / 120);
  }
  close(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-9);
  const basis = basisOf(q);
  close(dot(basis.forward, basis.up), 0, 1e-6);
  close(Math.hypot(basis.up.x, basis.up.y, basis.up.z), 1, 1e-6);
});

test('角度差归一到 (-π, π]', () => {
  close(wrapAngle(Math.PI * 2), 0);
  close(wrapAngle(Math.PI * 3), Math.PI);
  close(wrapAngle(-Math.PI * 1.5), Math.PI / 2);
});
