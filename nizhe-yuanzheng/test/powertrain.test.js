import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_RATIOS,
  GEAR_MODES,
  autoShift,
  distributeTorque,
  drivelineTorque,
  engineRpm,
  engineTorque,
  fuelBurn,
  gearDirection,
  gearModeIndex,
  gearRatio,
  isDriven,
  revLimit,
} from '../src/game/powertrain.js';
import { truckOf } from '../src/game/trucks.js';

const hauler = truckOf('hauler');

test('挡位表齐全，空挡不传扭矩，倒挡方向为负', () => {
  assert.deepEqual(GEAR_MODES.map((mode) => mode.id), ['R', 'N', 'A', 'L', 'LL']);
  assert.equal(gearRatio('N'), 0);
  assert.equal(gearDirection('R'), -1);
  assert.equal(gearDirection('A'), 1);
  assert.equal(gearModeIndex('LL'), 4);
});

test('爬行挡比低速挡重，低速挡比自动挡最高档重', () => {
  assert.ok(gearRatio('LL') > gearRatio('L'));
  assert.ok(gearRatio('L') > gearRatio('A', AUTO_RATIOS.length - 1));
});

test('扭矩曲线在标定点上取值精确，曲线之外被夹住', () => {
  for (const point of hauler.engine.curve) {
    assert.ok(Math.abs(engineTorque(hauler.engine, point.rpm) - point.nm) < 1e-9);
  }
  assert.equal(engineTorque(hauler.engine, 0), hauler.engine.curve[0].nm);
  assert.equal(engineTorque(hauler.engine, 99999), hauler.engine.curve.at(-1).nm);
});

test('超转断油：转速顶穿之后扭矩归零', () => {
  assert.equal(revLimit(hauler.engine, hauler.engine.max), 1);
  assert.ok(revLimit(hauler.engine, hauler.engine.max + 100) < 1);
  assert.equal(revLimit(hauler.engine, hauler.engine.max + 500), 0);
});

test('转速由驱动轮转速反推，并被怠速托住', () => {
  const totalRatio = gearRatio('A', 0) * hauler.finalDrive;
  assert.equal(engineRpm(hauler.engine, 0, totalRatio), hauler.engine.idle);
  assert.equal(engineRpm(hauler.engine, 5, 0), hauler.engine.idle);
  const spinning = engineRpm(hauler.engine, 8, totalRatio);
  assert.ok(spinning > hauler.engine.idle && spinning <= hauler.engine.max + 260);
});

test('自动挡到点升挡、掉速降挡，中间一大段不动', () => {
  const engine = hauler.engine;
  assert.equal(autoShift(engine, 0, engine.max * 0.95, 0), 1);
  assert.equal(autoShift(engine, 2, engine.max * 0.2, 0), 1);
  assert.equal(autoShift(engine, 1, engine.max * 0.6, 0), 1);
  assert.equal(autoShift(engine, AUTO_RATIOS.length - 1, engine.max, 0), AUTO_RATIOS.length - 1);
  // 深踩油门时升挡点更高，扭矩留在轮上。
  assert.equal(autoShift(engine, 0, engine.max * 0.85, 1), 0);
});

test('空挡和松油门都没有驱动扭矩', () => {
  assert.equal(drivelineTorque(hauler, 'N', 0, 1500, 1), 0);
  assert.equal(drivelineTorque(hauler, 'A', 0, 1500, 0), 0);
  assert.ok(drivelineTorque(hauler, 'A', 0, 1500, 1) > 0);
  assert.ok(drivelineTorque(hauler, 'LL', 0, 1500, 1) > drivelineTorque(hauler, 'A', 0, 1500, 1));
});

test('四驱开关决定前桥是否参与驱动', () => {
  const front = hauler.axles.find((wheel) => wheel.powered === 'front');
  const rear = hauler.axles.find((wheel) => wheel.powered === 'rear');
  assert.equal(isDriven(front, false), false);
  assert.equal(isDriven(front, true), true);
  assert.equal(isDriven(rear, false), true);
});

// 差速器这几条是「为什么要有差速锁」的全部理由，值得逐条钉住。
const axlePair = (leftCapacity, rightCapacity) => [
  { axle: 'rear', powered: 'rear', capacity: leftCapacity },
  { axle: 'rear', powered: 'rear', capacity: rightCapacity },
];

test('开放差速器被抓地力弱的那侧卡住', () => {
  const torques = distributeTorque(axlePair(4000, 100), 8000, { awd: false, diffLock: false });
  assert.deepEqual(torques, [120, 120], '一侧打滑，整桥都只能给出弱侧的扭矩');
});

test('锁上差速器之后强的那侧不再被弱侧拖累', () => {
  const wheels = axlePair(4000, 100);
  const open = distributeTorque(wheels, 8000, { awd: false, diffLock: false });
  const locked = distributeTorque(wheels, 8000, { awd: false, diffLock: true });
  assert.equal(locked[0], 4000, '强侧吃到差速器分给它的那一份');
  assert.equal(locked[1], 140, '弱侧只能吃到自己的极限，多出来的就是空转');
  const sum = (list) => list.reduce((total, value) => total + value, 0);
  assert.ok(sum(locked) > sum(open) * 10, '锁差速带来的牵引力提升就是它存在的理由');
});

test('抓地力充足时两侧平分，且总量不超过发动机给的', () => {
  const torques = distributeTorque(axlePair(9000, 9000), 8000, { awd: false, diffLock: false });
  assert.deepEqual(torques, [4000, 4000]);
});

test('空挡或没有驱动轮时不分配扭矩', () => {
  assert.deepEqual(distributeTorque(axlePair(9000, 9000), 0, { awd: false, diffLock: false }), [0, 0]);
  const frontOnly = [{ axle: 'front', powered: 'front', capacity: 9000 }];
  assert.deepEqual(distributeTorque(frontOnly, 8000, { awd: false, diffLock: false }), [0]);
});

test('四驱把总扭矩摊到更多桥上，单轮扭矩因此更小', () => {
  const wheels = [
    { axle: 'front', powered: 'front', capacity: 9000 },
    { axle: 'front', powered: 'front', capacity: 9000 },
    { axle: 'rear', powered: 'rear', capacity: 9000 },
    { axle: 'rear', powered: 'rear', capacity: 9000 },
  ];
  const rwd = distributeTorque(wheels, 8000, { awd: false, diffLock: true });
  const awd = distributeTorque(wheels, 8000, { awd: true, diffLock: true });
  assert.equal(rwd[0], 0);
  assert.ok(awd[0] > 0);
  assert.ok(awd[2] < rwd[2], '四驱之后后轮分到的扭矩变少');
});

test('油耗随负荷上升，四驱额外费油', () => {
  const light = fuelBurn(hauler.engine, 800, 0, false, 1);
  const heavy = fuelBurn(hauler.engine, hauler.engine.max, 1, false, 1);
  const heavyAwd = fuelBurn(hauler.engine, hauler.engine.max, 1, true, 1);
  assert.ok(light > 0 && heavy > light * 4);
  assert.ok(heavyAwd > heavy);
  assert.ok(fuelBurn(hauler.engine, 1500, 0.5, false, 2) > fuelBurn(hauler.engine, 1500, 0.5, false, 1));
});
