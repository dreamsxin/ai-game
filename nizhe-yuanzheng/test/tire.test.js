import test from 'node:test';
import assert from 'node:assert/strict';
import { BEARING, MATERIALS, gripFromSink, materialIndexOf } from '../src/game/rules.js';
import { TIRES, restingHeight, softnessOf, tireGrip, tireOf, truckOf } from '../src/game/trucks.js';
import {
  PEAK_SLIP,
  SLIP_TAIL,
  contactArea,
  freeRollSpin,
  longitudinalSlip,
  rollingDrag,
  rutCut,
  sinkDepth,
  slipAngleOf,
  slipCurve,
  spinWaste,
  tireForces,
} from '../src/game/tire.js';

const mud = MATERIALS[materialIndexOf('mud')];
const rock = MATERIALS[materialIndexOf('rock')];

test('三台车的规格自洽：悬挂几何、油箱、货位都合理', () => {
  for (const id of ['scout', 'hauler', 'heavy']) {
    const spec = truckOf(id);
    assert.ok(Math.abs(restingHeight(spec) - spec.comY) < 0.005, `${id} 出生高度和 comY 不一致`);
    assert.ok(spec.cargoComY > spec.comY, `${id} 的货物重心应该高于车身重心`);
    assert.ok(spec.slots >= 2 && spec.fuel > 50);
    assert.ok(spec.snorkel > 0.5, `${id} 的排气管高度必须给出，涉水极限靠它`);
    assert.ok(spec.axles.length % 2 === 0, `${id} 车轮左右不对称`);
    assert.ok(spec.axles.some((wheel) => wheel.steered), `${id} 没有转向轮`);
    assert.ok(spec.axles.some((wheel) => wheel.powered === 'rear'), `${id} 没有常驱动桥`);
    assert.ok(spec.engine.curve.length >= 4);
  }
});

test('车越重，轮子越大——不然满载必定坐到底', () => {
  const specs = ['scout', 'hauler', 'heavy'].map(truckOf);
  for (let index = 1; index < specs.length; index += 1) {
    assert.ok(specs[index].mass > specs[index - 1].mass);
    assert.ok(specs[index].axles[0].radius > specs[index - 1].axles[0].radius);
  }
});

test('μ-slip 曲线：峰值前上升，峰值后掉力', () => {
  assert.equal(slipCurve(0), 0);
  assert.ok(Math.abs(slipCurve(PEAK_SLIP) - 1) < 1e-9);
  assert.ok(slipCurve(PEAK_SLIP * 0.5) < 1);
  const far = slipCurve(PEAK_SLIP * 20);
  assert.ok(Math.abs(far - SLIP_TAIL) < 1e-9, `峰后残余应该收敛到 ${SLIP_TAIL}`);
  // 这条就是「焖油反而没劲」的数学来源。
  assert.ok(slipCurve(PEAK_SLIP * 6) < slipCurve(PEAK_SLIP));
  assert.equal(slipCurve(-PEAK_SLIP), slipCurve(PEAK_SLIP), '曲线对滑移方向对称');
});

test('滑移率：轮速快于车速为正，低速时分母不炸', () => {
  assert.ok(longitudinalSlip(10, 0.6, 0) > 0);
  assert.ok(longitudinalSlip(0, 0.6, 8) < 0, '车在滑、轮子不转就是负滑移');
  assert.ok(Number.isFinite(longitudinalSlip(0, 0.6, 0)));
  assert.equal(longitudinalSlip(5, 0.6, 3), (5 * 0.6 - 3) / 3);
});

test('空转比例才是判断陷车的指标，滑移率不是', () => {
  assert.equal(spinWaste(0, 0.6, 0), 0, '轮子没转就不算空转');
  assert.ok(Math.abs(spinWaste(20, 0.6, 0) - 1) < 1e-9, '车不动轮子飞转就是完全空转');
  assert.ok(spinWaste(10, 0.6, 6) < 0.05, '正常滚动时空转比例接近零');
  const value = spinWaste(10, 0.6, 3);
  assert.ok(value > 0.4 && value < 0.6);
});

test('侧偏角在低速时不会产生巨大侧向力', () => {
  assert.ok(Math.abs(slipAngleOf(0, 0.2)) < 0.3);
  assert.ok(slipAngleOf(10, 3) > 0);
  assert.equal(slipAngleOf(10, 0), 0);
});

test('接地压强越大陷得越深，但最深不过轮心', () => {
  const shallow = sinkDepth(5000, 0.6, 0.46, 0.46);
  const deep = sinkDepth(40000, 0.6, 0.46, 0.46);
  assert.ok(deep > shallow);
  assert.ok(sinkDepth(1e9, 0.6, 0.46, 5) <= 0.6 * 0.8 + 1e-9, '没有封顶泥塘会变成无底洞');
  assert.equal(sinkDepth(20000, 0.6, 0.46, 0), 0, '硬地不下陷');
  assert.equal(sinkDepth(0, 0.6, 0.46, 0.4), 0);
  // 正好压到承载力上限时应该陷满余量。
  const load = BEARING * contactArea(0.6, 0.46);
  assert.ok(Math.abs(sinkDepth(load, 0.6, 0.46, 0.3) - 0.3) < 1e-9);
});

test('宽胎大轮压强低，因此陷得浅', () => {
  const narrow = sinkDepth(20000, 0.44, 0.3, 0.4);
  const wide = sinkDepth(20000, 0.72, 0.52, 0.4);
  assert.ok(wide < narrow);
});

test('埋得越深抓地力越差，但保留一个下限', () => {
  assert.equal(gripFromSink(0.5, 0, 0.6), 0.5);
  assert.ok(gripFromSink(0.5, 0.3, 0.6) < 0.5);
  assert.ok(gripFromSink(0.5, 5, 0.6) >= 0.5 * 0.3 - 1e-9);
});

test('轮胎力被摩擦圆限制：纵向吃满就没有侧向', () => {
  const load = 20000;
  const straight = tireForces({ load, grip: 0.8, slipRatio: PEAK_SLIP, slipAngle: 0, radius: 0.6, sink: 0 });
  assert.ok(Math.abs(straight.fx - 0.8 * load) < 1e-6);
  assert.ok(Math.abs(straight.fy) < 1e-9);

  const both = tireForces({ load, grip: 0.8, slipRatio: PEAK_SLIP * 3, slipAngle: 0.6, radius: 0.6, sink: 0 });
  const magnitude = Math.hypot(both.fx, both.fy);
  assert.ok(magnitude <= 0.8 * load + 1e-6, `合力 ${magnitude.toFixed(0)} 超出摩擦圆`);
  assert.ok(Math.abs(both.fy) < Math.abs(straight.fx), '纵向占满之后侧向余量很小');
});

test('离地的轮子不产生任何力', () => {
  const airborne = tireForces({ load: 0, grip: 1, slipRatio: 2, slipAngle: 1, radius: 0.6, sink: 0 });
  assert.deepEqual(airborne, { fx: 0, fy: 0, mu: 0, saturation: 0 });
});

test('侧向力反抗侧滑方向', () => {
  const left = tireForces({ load: 20000, grip: 0.8, slipRatio: 0, slipAngle: 0.2, radius: 0.6, sink: 0 });
  const right = tireForces({ load: 20000, grip: 0.8, slipRatio: 0, slipAngle: -0.2, radius: 0.6, sink: 0 });
  assert.ok(left.fy < 0);
  assert.ok(right.fy > 0);
});

test('滚动阻力随下陷深度上升，硬地上很小', () => {
  const hard = rollingDrag(20000, rock.roll, 0, 0.6);
  const soft = rollingDrag(20000, mud.roll, 0.24, 0.6);
  assert.ok(soft > hard * 3);
  // 阻力系数必须明显小于同材质的摩擦系数，否则新鲜泥地就成了过不去的墙。
  assert.ok(soft / 20000 < mud.grip, `泥地阻力系数 ${(soft / 20000).toFixed(3)} 不该超过摩擦系数 ${mud.grip}`);
});

test('每种软地面的阻力都低于它的抓地力上限', () => {
  for (const material of MATERIALS) {
    if (material.sink <= 0) continue;
    const radius = 0.66;
    const sink = Math.min(material.sink + material.ruts, radius * 0.8);
    const drag = rollingDrag(1, material.roll, sink * 0.75, radius);
    const grip = gripFromSink(material.grip, sink * 0.75, radius) * tireGrip(tireOf('mud'), material);
    assert.ok(drag < grip * 1.35, `${material.name}：阻力 ${drag.toFixed(3)} 对抓地 ${grip.toFixed(3)}，泥地胎也开不动`);
  }
});

test('打滑的轮子挖车辙比滚过去快得多，但挖掘速率有上限', () => {
  const rolling = rutCut(20000, 0.05, 0.2, 1);
  const spinning = rutCut(20000, 1.5, 0.2, 1);
  const insane = rutCut(20000, 40, 0.2, 1);
  assert.ok(spinning > rolling * 4);
  assert.ok(insane <= spinning * 1.5, '滑移率再大也不该无限挖');
  assert.equal(rutCut(20000, 3, 0, 1), 0, '硬地不挖车辙');
});

test('轮胎类型各有所长：公路胎怕泥，防滑链怕硬地', () => {
  const road = TIRES.find((tire) => tire.id === 'road');
  const chain = TIRES.find((tire) => tire.id === 'chain');
  assert.ok(tireGrip(road, rock) > tireGrip(chain, rock));
  assert.ok(tireGrip(chain, mud) > tireGrip(road, mud));
  assert.equal(softnessOf(rock), 0);
  assert.ok(softnessOf(MATERIALS[materialIndexOf('swamp')]) > 0.9);
});

test('自由滚动的轮速跟着车速', () => {
  assert.equal(freeRollSpin(6, 0.6), 10);
  assert.equal(freeRollSpin(0, 0.6), 0);
});
