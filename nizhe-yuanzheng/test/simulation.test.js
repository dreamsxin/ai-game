import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_COUNT } from '../src/game/level.js';
import { RECOVER_PENALTY, STUCK_SECONDS, createGame, handleCargo, recover, refuel, setGear, step, toggleAwd, toggleDiffLock, toggleWinch } from '../src/game/simulation.js';
import { resultStars } from '../src/game/rules.js';
import { MATERIALS, materialIndexOf } from '../src/game/rules.js';
import { readout, timeLabel, damageLabel, gearLabel, starLabel, winComment } from '../src/scene/readout.js';
import { restingY } from '../src/game/vehicle.js';
import { quatFromYaw } from '../src/game/vec.js';
import { truckParts } from '../src/scene/parts.js';

const idle = { throttle: 0, brake: 0, steer: 0, handbrake: true, winch: false };
const run = (state, seconds, input = idle) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) step(state, input, 1 / 60);
  return state;
};

test('开局状态干净：空挡、满油、无损、货在场上', () => {
  const state = createGame(0, 777);
  assert.equal(state.status, 'ready');
  assert.equal(state.vehicle.gear, 'N');
  assert.equal(state.fuel, state.maxFuel);
  assert.equal(state.damage, 0);
  assert.equal(state.cargo.length, 0);
  assert.equal(state.pending, state.required);
  assert.equal(state.delivered, 0);
  assert.equal(state.spec.id, state.level.truckId);
});

test('秒表从玩家动手那一刻开始，空挡干等不计时', () => {
  const state = createGame(0, 5);
  run(state, 3, { throttle: 0, brake: 0, steer: 0, handbrake: false, winch: false });
  assert.equal(state.status, 'ready', '空挡没踩踏板，不该开始计时');
  assert.equal(state.elapsed, 0);
  setGear(state, 'A');
  step(state, idle, 1 / 60);
  assert.equal(state.status, 'driving');
  assert.ok(state.elapsed > 0);
});

test('大 dt 会被切成子步，物理不会一步跨过半个车身', () => {
  const state = createGame(0, 11);
  run(state, 1);
  const before = { ...state.vehicle.position };
  step(state, idle, 5);
  const moved = Math.hypot(state.vehicle.position.x - before.x, state.vehicle.position.z - before.z);
  assert.ok(moved < 3, `一帧挪了 ${moved.toFixed(2)} 米`);
  assert.ok(state.elapsed < 1.5, '掉帧时宁可模拟走慢，也不让弹簧炸掉');
});

test('挂挡换向需要先停稳', () => {
  const state = createGame(0, 12);
  setGear(state, 'A');
  run(state, 4, { throttle: 1, brake: 0, steer: 0, handbrake: false, winch: false });
  assert.ok(Math.abs(state.vehicle.forwardSpeed) > 1.4, '没跑起来就测不到这条');
  setGear(state, 'R');
  assert.equal(state.vehicle.gear, 'A', '高速下不该允许直接挂倒挡');
  run(state, 6, { ...idle, brake: 1 });
  setGear(state, 'R');
  assert.equal(state.vehicle.gear, 'R');
});

test('四驱和差速锁开关生效，爬行挡自带锁差速', () => {
  const state = createGame(1, 13);
  const initial = state.vehicle.awd;
  toggleAwd(state);
  assert.equal(state.vehicle.awd, !initial);
  toggleDiffLock(state);
  assert.equal(state.vehicle.diffLock, true);
  setGear(state, 'LL');
  assert.equal(readout(state).diffLock, true);
});

test('油会烧完，烧完之后油门失效', () => {
  const state = createGame(0, 14);
  setGear(state, 'A');
  state.fuel = 0.2;
  run(state, 3, { throttle: 1, brake: 0, steer: 0, handbrake: false, winch: false });
  assert.equal(state.fuel, 0);
  const before = { ...state.vehicle.position };
  run(state, 3, { throttle: 1, brake: 0, steer: 0, handbrake: false, winch: false });
  const rolled = Math.hypot(state.vehicle.position.x - before.x, state.vehicle.position.z - before.z);
  assert.ok(rolled < 6, `没油还窜了 ${rolled.toFixed(1)} 米`);
});

test('装卸货只能在对应场地进行，而且要停稳', () => {
  const state = createGame(0, 15);
  handleCargo(state);
  assert.equal(state.cargo.length, 1, '开局就在货场里，应该能装上');
  assert.equal(state.pending, state.required - 1);
  const mass = state.vehicle.mass;
  assert.ok(mass > state.spec.mass, '装货之后总质量要涨');
  assert.ok(state.vehicle.comLift > 0, '装货之后重心要升高');

  // 挪到荒地上就什么也做不了。
  state.vehicle.position.x += 120;
  state.vehicle.position.z += 120;
  const held = state.cargo.length;
  handleCargo(state);
  assert.equal(state.cargo.length, held);
});

test('装货抬高重心的同时抬高车身，悬挂不会被压到底', () => {
  const state = createGame(2, 16);
  run(state, 1.5);
  const settled = state.vehicle.position.y;
  const compression = state.vehicle.wheels[0].compression;
  handleCargo(state);
  assert.ok(state.vehicle.position.y > settled, '重心上移时车身位置要跟着抬');
  run(state, 1);
  const loaded = state.vehicle.wheels[0].compression;
  assert.ok(loaded < state.spec.suspension.rest * 0.995, `悬挂被压到底了：${loaded.toFixed(3)}`);
  assert.ok(loaded > compression * 0.5);
});

test('在交付点卸完全部货物就算通关，并给出星级', () => {
  const state = createGame(0, 17);
  for (let index = 0; index < state.required; index += 1) handleCargo(state);
  assert.equal(state.cargo.length, Math.min(state.required, state.spec.slots));
  // 直接把车放到交付点，只验证任务判定，不重复跑一遍驾驶。
  state.vehicle.position.x = state.level.site.x;
  state.vehicle.position.z = state.level.site.z;
  state.vehicle.velocity = { x: 0, y: 0, z: 0 };
  state.vehicle.speed = 0;
  while (state.cargo.length > 0) handleCargo(state);
  step(state, idle, 1 / 60);
  assert.equal(state.status, 'won');
  assert.ok(state.stars >= 1 && state.stars <= 3);
  assert.equal(state.stars, resultStars(state.elapsed + state.penalty, state.level.par));
});

test('通关之后 step 不再改变状态', () => {
  const state = createGame(0, 18);
  state.status = 'won';
  const snapshot = state.elapsed;
  run(state, 2);
  assert.equal(state.elapsed, snapshot);
});

test('车损满格判失败', () => {
  const state = createGame(0, 19);
  run(state, 0.5);
  state.damage = 1;
  step(state, idle, 1 / 60);
  assert.equal(state.status, 'lost');
});

test('挂不上绞盘会明确说原因，不会静默失败', () => {
  const state = createGame(0, 20);
  // 挪到远离所有道具的地方。
  state.vehicle.position.x = 0;
  state.vehicle.position.z = 0;
  toggleWinch(state);
  const message = state.effects.at(-1);
  assert.ok(message && message.kind === 'winch');
  if (!state.winch.anchor) assert.match(message.text, /没有/);
});

test('挂上之后再按一次就脱钩', () => {
  const state = createGame(1, 21);
  const anchor = state.level.props.find((prop) => prop.anchor);
  state.vehicle.position.x = anchor.x + 4;
  state.vehicle.position.z = anchor.z;
  toggleWinch(state);
  assert.ok(state.winch.anchor, '旁边就有锚点却挂不上');
  toggleWinch(state);
  assert.equal(state.winch.anchor, null);
});

test('在压烂的深泥沼里焖油门会陷车，并给出提示', () => {
  const state = createGame(1, 22);
  // 把地面铺成平的、压到底的深泥沼：地形起伏会让车顺坡溜走，测不到陷车本身。
  // 新鲜沼泽还能慢慢爬，反复碾过的沼泽就是个坑——这条差别就是车辙机制的意义。
  const swamp = materialIndexOf('swamp');
  state.level.terrain.height.fill(6);
  state.level.terrain.material.fill(swamp);
  state.level.terrain.ruts.fill(MATERIALS[swamp].ruts);
  state.vehicle.position.y = restingY(state.spec, 6);
  for (let index = 0; index < state.spec.slots; index += 1) handleCargo(state);
  setGear(state, 'LL');
  run(state, STUCK_SECONDS + 5, { throttle: 1, brake: 0, steer: 0, handbrake: false, winch: false });
  assert.ok(state.vehicle.avgSink > 0.3, `没陷进去：${state.vehicle.avgSink.toFixed(3)}`);
  assert.ok(state.vehicle.slipping > 0.7, `轮子没在空转：${state.vehicle.slipping.toFixed(2)}`);
  assert.ok(state.vehicle.speed < 1, `压烂的沼泽里还能跑 ${state.vehicle.speed.toFixed(2)} m/s`);
  assert.equal(state.stuck, true, `空转 ${state.vehicle.slipping.toFixed(2)}`);
  assert.ok(state.effects.some((effect) => effect.kind === 'stuck'));
});

test('绞盘能把陷死的车拽出来——这是陷车之后唯一的正经出路', () => {
  const state = createGame(1, 44);
  const swamp = materialIndexOf('swamp');
  state.level.terrain.height.fill(6);
  state.level.terrain.material.fill(swamp);
  state.level.terrain.ruts.fill(MATERIALS[swamp].ruts);
  // 把车摆在一棵锚点树旁边，车头朝着它。
  const anchor = state.level.props.find((prop) => prop.anchor);
  anchor.y = 6;
  state.vehicle.position.x = anchor.x;
  state.vehicle.position.z = anchor.z + 12;
  state.vehicle.position.y = restingY(state.spec, 6);
  state.vehicle.quaternion = quatFromYaw(Math.atan2(0, -(-12)));
  for (let index = 0; index < state.spec.slots; index += 1) handleCargo(state);
  setGear(state, 'LL');

  run(state, 12, { throttle: 1, brake: 0, steer: 0, handbrake: false, winch: false });
  const bogged = Math.hypot(state.vehicle.position.x - anchor.x, state.vehicle.position.z - anchor.z);
  assert.ok(state.stuck, `没陷住，测不到绞盘：速度 ${state.vehicle.speed.toFixed(2)}`);

  toggleWinch(state);
  assert.ok(state.winch.anchor, '车头前 12 米就有锚点却挂不上');
  run(state, 8, { throttle: 0.5, brake: 0, steer: 0, handbrake: false, winch: true });
  const pulled = Math.hypot(state.vehicle.position.x - anchor.x, state.vehicle.position.z - anchor.z);
  assert.ok(bogged - pulled > 1.5, `收了八秒线只挪了 ${(bogged - pulled).toFixed(2)} 米`);
  assert.ok(state.winch.length < 12);
});

test('同一片沼泽，没被压过时还爬得动', () => {
  const drive = (rutted) => {
    const state = createGame(1, 33);
    const swamp = materialIndexOf('swamp');
    state.level.terrain.height.fill(6);
    state.level.terrain.material.fill(swamp);
    if (rutted) state.level.terrain.ruts.fill(MATERIALS[swamp].ruts);
    state.vehicle.position.y = restingY(state.spec, 6);
    for (let index = 0; index < state.spec.slots; index += 1) handleCargo(state);
    setGear(state, 'LL');
    run(state, 10, { throttle: 0.85, brake: 0, steer: 0, handbrake: false, winch: false });
    return state.distance;
  };
  const fresh = drive(false);
  const rutted = drive(true);
  assert.ok(fresh > rutted * 2, `新鲜沼泽 ${fresh.toFixed(1)} 米 vs 压烂的 ${rutted.toFixed(1)} 米，车辙没起作用`);
  assert.ok(fresh > 4, `新鲜沼泽也开不动了：${fresh.toFixed(1)} 米`);
});

test('拖车把车放回路线，代价是罚时', () => {
  const state = createGame(2, 23);
  state.vehicle.position.x = 0;
  state.vehicle.position.z = 200;
  state.fuel = 0;
  state.damage = 0.5;
  recover(state);
  assert.equal(state.penalty, RECOVER_PENALTY);
  assert.ok(state.fuel > 0);
  assert.ok(state.damage < 0.5);
  assert.equal(state.vehicle.gear, 'N');
  assert.equal(state.winch.anchor, null);
  const distances = state.level.route.map((point) => Math.hypot(point.x - state.vehicle.position.x, point.z - state.vehicle.position.z));
  assert.ok(Math.min(...distances) < 1, '拖车之后必须在路线上');
});

test('加油只在加油点有效', () => {
  const state = createGame(1, 24);
  state.fuel = 10;
  refuel(state);
  assert.equal(state.fuel, 10, '不在加油点不该加上油');
  const spot = state.level.refuel[0];
  state.vehicle.position.x = spot.x;
  state.vehicle.position.z = spot.z;
  state.vehicle.speed = 0;
  refuel(state);
  assert.equal(state.fuel, state.maxFuel);
});

test('每一关都能被创建，并且各自有自己的车和货', () => {
  const seen = new Set();
  for (let index = 0; index < LEVEL_COUNT; index += 1) {
    const state = createGame(index, 100 + index);
    assert.ok(state.level.name);
    assert.ok(state.required >= state.spec.slots, '货比车厢多才需要跑第二趟');
    seen.add(state.spec.id);
  }
  assert.equal(seen.size, LEVEL_COUNT, '三关应该开三台不同的车');
});

test('HUD 快照全是可直接渲染的原始值', () => {
  const state = createGame(0, 25);
  run(state, 1);
  const hud = readout(state);
  for (const key of ['time', 'par', 'speed', 'rpm', 'gear', 'fuel', 'ground', 'remaining', 'damageText']) {
    assert.equal(typeof hud[key], 'string', `${key} 应该是字符串`);
  }
  for (const key of ['rpmFraction', 'fuelFraction', 'slip', 'sink', 'drown']) {
    assert.ok(hud[key] >= 0 && hud[key] <= 1, `${key} 越界了：${hud[key]}`);
  }
  assert.equal(hud.gearId, state.vehicle.gear);
  assert.equal(hud.slots, state.spec.slots);
});

test('文案函数覆盖各档取值', () => {
  assert.equal(timeLabel(0), '00:00');
  assert.equal(timeLabel(125), '02:05');
  assert.equal(gearLabel('A', 2), 'A3');
  assert.equal(gearLabel('LL', 0), 'LL');
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(3), '★★★');
  assert.notEqual(damageLabel(0), damageLabel(0.95));
  assert.notEqual(winComment(10, 100), winComment(400, 100));
});

test('车身部件都在车体尺寸范围内，而且带排气管', () => {
  const state = createGame(2, 26);
  const parts = truckParts(state.spec);
  assert.ok(parts.length > 6);
  assert.ok(parts.some((part) => part.name === 'snorkel'));
  for (const part of parts) {
    assert.ok(part.size.x <= state.spec.body.width + 0.1, `${part.name} 比车还宽`);
    assert.ok(Math.abs(part.position.z) <= state.spec.body.length * 0.55, `${part.name} 伸出车外`);
  }
});
