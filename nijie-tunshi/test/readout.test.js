import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../src/game/level.js';
import { massToCross } from '../src/game/rules.js';
import {
  AVAILABLE_COLOR, DARK_POLARITY_COLOR, GATE_OPEN_OPACITY, GATE_SHUT_OPACITY, LIGHT_POLARITY_COLOR,
  LIGHT_POLARITY_DIM, UNAVAILABLE_COLOR, gateReadoutState, labelColor, moodTilt, objectLabelState,
  obstacleLabelState,
} from '../src/scene/readout.js';

test('mass labels encode polarity with a sign and availability with colour', () => {
  const neutral = objectLabelState({ mass: 7.4 }, true);
  assert.deepEqual(neutral, { text: '7', color: AVAILABLE_COLOR });
  assert.equal(objectLabelState({ mass: 7.4 }, false).color, UNAVAILABLE_COLOR);

  const dark = objectLabelState({ mass: 18, polarity: 'dark' }, true);
  assert.equal(dark.text, '-18', '暗极性必须带负号');
  assert.equal(dark.color, DARK_POLARITY_COLOR);

  assert.equal(objectLabelState({ mass: 18, polarity: 'light' }, true).text, '+18', '亮极性必须带正号');
  assert.equal(objectLabelState({ mass: 18, polarity: 'light' }, true).color, LIGHT_POLARITY_COLOR);
  assert.equal(objectLabelState({ mass: 18, polarity: 'light' }, false).color, LIGHT_POLARITY_DIM);
});

test('obstacle labels flip to the warm colour exactly at the crossing threshold', () => {
  const wall = LEVEL.obstacles.find((obstacle) => obstacle.id === 'wall-a');
  const threshold = massToCross(wall.height);

  const below = obstacleLabelState(threshold - 1, wall);
  assert.equal(below.text, `H${wall.height.toFixed(1)}`);
  assert.equal(below.crossable, false);
  assert.equal(below.color, UNAVAILABLE_COLOR, '不够高时应保持暗灰');

  const above = obstacleLabelState(threshold + 1, wall);
  assert.equal(above.crossable, true);
  assert.equal(above.color, AVAILABLE_COLOR, '够高时应转暖色');

  const tall = LEVEL.obstacles.find((obstacle) => obstacle.id === 'wall-c');
  assert.equal(obstacleLabelState(999, tall).crossable, false, '高墙永远不该显示为可跨越');
});

test('gate readouts switch colour and opacity when the cap is exceeded', () => {
  const gate = LEVEL.gates.find((candidate) => candidate.id === 'gate-north');

  const open = gateReadoutState(gate.maxMass, gate);
  assert.equal(open.open, true, '恰好等于上限时仍应可通过');
  assert.equal(open.text, `≤${gate.maxMass}`);
  assert.equal(open.labelColor, AVAILABLE_COLOR);
  assert.equal(open.opacity, GATE_OPEN_OPACITY);

  const shut = gateReadoutState(gate.maxMass + 0.1, gate);
  assert.equal(shut.open, false, '超过上限即关闭');
  assert.equal(shut.labelColor, UNAVAILABLE_COLOR);
  assert.equal(shut.opacity, GATE_SHUT_OPACITY, '关闭后应更不透明');
  assert.notEqual(shut.color, open.color, '开合必须用不同颜色区分');
  assert.notEqual(shut.emissive, open.emissive);
});

test('mood tilt leans along the axis facing the player', () => {
  const player = { x: 0, z: 0 };

  // 目标在 +z 方向：后缩（负 lean）应绕 x 轴负向倾斜，z 轴分量为零
  const north = moodTilt({ x: 0, z: 5 }, player, -0.12);
  assert.ok(Math.abs(north.rotationX + 0.12) < 1e-9, `实际 ${north.rotationX}`);
  assert.ok(Math.abs(north.rotationZ) < 1e-9, `正对 z 轴时 rotationZ 应为 0，实际 ${north.rotationZ}`);

  // 目标在 +x 方向：倾斜应完全落在 z 轴分量上
  const east = moodTilt({ x: 5, z: 0 }, player, 0.14);
  assert.ok(Math.abs(east.rotationX) < 1e-9, `正对 x 轴时 rotationX 应为 0，实际 ${east.rotationX}`);
  assert.ok(Math.abs(east.rotationZ + 0.14) < 1e-9, `实际 ${east.rotationZ}`);

  // 前倾与后缩必须方向相反
  const forward = moodTilt({ x: 3, z: 4 }, player, 0.14);
  const backward = moodTilt({ x: 3, z: 4 }, player, -0.14);
  assert.ok(forward.rotationX * backward.rotationX < 0, '前倾与后缩应反向');

  // 重合位置不能产生 NaN
  const same = moodTilt({ x: 0, z: 0 }, player, 0.14);
  assert.ok(Number.isFinite(same.rotationX) && Number.isFinite(same.rotationZ), '重合时不应产生 NaN');

  assert.ok(Math.abs(moodTilt({ x: 5, z: 0 }, player, 0).rotationZ) < 1e-9, '无情绪时不应倾斜');
});

test('label colour has exactly two states', () => {
  assert.equal(labelColor(true), AVAILABLE_COLOR);
  assert.equal(labelColor(false), UNAVAILABLE_COLOR);
  assert.notEqual(AVAILABLE_COLOR, UNAVAILABLE_COLOR);
});
