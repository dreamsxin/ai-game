import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLevel } from '../src/game/level.js';
import { heightAt, materialAt } from '../src/game/terrain.js';
import { restingHeight, truckOf } from '../src/game/trucks.js';
import { createVehicle, restingY, stepVehicle } from '../src/game/vehicle.js';
import { materialIndexOf } from '../src/game/rules.js';

const level = buildLevel(0, 20260911);
const spawn = (truckId = 'hauler') => {
  const spec = truckOf(truckId);
  const groundY = heightAt(level.terrain, level.start.x, level.start.z);
  const vehicle = createVehicle(spec, { ...level.start, y: restingY(spec, groundY) });
  return { spec, vehicle, groundY };
};

const settle = (vehicle, seconds = 2, controls = {}) => {
  const dt = 1 / 120;
  for (let index = 0; index < Math.round(seconds / dt); index += 1) {
    stepVehicle(vehicle, level, { throttle: 0, brake: 0, steer: 0, handbrake: true, ...controls }, dt);
  }
  return vehicle;
};

test('每台车的悬挂几何和声明的重心高度自洽', () => {
  for (const id of ['scout', 'hauler', 'heavy']) {
    const spec = truckOf(id);
    assert.ok(Math.abs(restingHeight(spec) - spec.comY) < 0.005, `${id} 出生高度对不上`);
  }
});

test('静止的车会稳定停在地面上，不下沉也不弹飞', () => {
  const { vehicle, groundY } = spawn();
  settle(vehicle, 3);
  const clearance = vehicle.position.y - groundY;
  assert.ok(clearance > 0.6 && clearance < 2, `离地高度异常：${clearance.toFixed(3)}`);
  assert.ok(vehicle.speed < 0.3, `静止的车在滑动：${vehicle.speed.toFixed(3)}`);
  assert.ok(vehicle.tilt < 0.5, `车站歪了：${vehicle.tilt.toFixed(3)}`);
});

test('四个轮子都接地，载荷合起来约等于车重', () => {
  const { vehicle } = spawn();
  settle(vehicle, 3);
  assert.equal(vehicle.contacts, vehicle.wheels.length);
  const load = vehicle.wheels.reduce((sum, wheel) => sum + wheel.load, 0);
  const weight = vehicle.mass * 9.81;
  assert.ok(Math.abs(load - weight) / weight < 0.25, `法向力 ${load.toFixed(0)} 对不上车重 ${weight.toFixed(0)}`);
});

test('挂挡给油车会往前走，空挡不会', () => {
  const neutral = spawn().vehicle;
  settle(neutral, 1);
  const startZ = neutral.position.z;
  settle(neutral, 2, { throttle: 1, handbrake: false });
  assert.ok(Math.hypot(neutral.position.x - level.start.x, neutral.position.z - startZ) < 3, '空挡也在窜车');

  const { vehicle } = spawn();
  vehicle.gear = 'A';
  settle(vehicle, 1);
  const from = { x: vehicle.position.x, z: vehicle.position.z };
  settle(vehicle, 4, { throttle: 1, handbrake: false });
  const moved = Math.hypot(vehicle.position.x - from.x, vehicle.position.z - from.z);
  assert.ok(moved > 8, `四秒才走了 ${moved.toFixed(1)} 米`);
  assert.ok(vehicle.forwardSpeed > 1.5, '车在往前但速度读数不对');
});

test('倒挡往后走', () => {
  const { vehicle } = spawn();
  vehicle.gear = 'R';
  settle(vehicle, 1);
  const before = vehicle.position.z;
  settle(vehicle, 3, { throttle: 1, handbrake: false });
  assert.ok(vehicle.forwardSpeed < -0.8, `倒挡没有倒车：${vehicle.forwardSpeed.toFixed(2)}`);
  assert.notEqual(vehicle.position.z, before);
});

test('刹车能把车停住', () => {
  const { vehicle } = spawn();
  vehicle.gear = 'A';
  settle(vehicle, 3, { throttle: 1, handbrake: false });
  assert.ok(vehicle.speed > 2, '没跑起来，这条测不到刹车');
  settle(vehicle, 4, { throttle: 0, brake: 1, handbrake: false });
  assert.ok(vehicle.speed < 0.5, `刹不住：${vehicle.speed.toFixed(2)}`);
});

test('泥地里比碎石路上难加速', () => {
  const runOn = (materialId) => {
    const { vehicle } = spawn();
    // 直接改写车下这一片的材质，其它条件完全一致。
    const index = materialIndexOf(materialId);
    level.terrain.material.fill(index);
    level.terrain.ruts.fill(0);
    vehicle.gear = 'A';
    vehicle.diffLock = true;
    settle(vehicle, 1);
    settle(vehicle, 5, { throttle: 1, handbrake: false });
    return vehicle.speed;
  };
  const gravel = runOn('gravel');
  const mud = runOn('mud');
  const swamp = runOn('swamp');
  assert.ok(gravel > mud, `碎石 ${gravel.toFixed(2)} 应该快于泥地 ${mud.toFixed(2)}`);
  assert.ok(mud > swamp, `泥地 ${mud.toFixed(2)} 应该快于沼泽 ${swamp.toFixed(2)}`);
  assert.ok(swamp > 0.2, `沼泽里彻底走不动了：${swamp.toFixed(2)}`);
});

test('压过泥地会留下车辙，同一格越压越深', () => {
  const fresh = buildLevel(0, 4242);
  fresh.terrain.material.fill(materialIndexOf('mud'));
  const spec = truckOf('hauler');
  const vehicle = createVehicle(spec, { ...fresh.start, y: restingY(spec, heightAt(fresh.terrain, fresh.start.x, fresh.start.z)) });
  vehicle.gear = 'A';
  vehicle.diffLock = true;
  let total = 0;
  for (let index = 0; index < 360; index += 1) {
    stepVehicle(vehicle, fresh, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 120);
    total += vehicle.dug;
  }
  assert.ok(total > 0, '泥地上开了三秒却没压出任何车辙');
  assert.ok(Math.max(...fresh.terrain.ruts) > 0.02, '车辙深度没涨起来');
  assert.ok(materialAt(fresh.terrain, vehicle.position.x, vehicle.position.z) === materialIndexOf('mud'));
});
