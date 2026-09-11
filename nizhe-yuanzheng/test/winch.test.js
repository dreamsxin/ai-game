import test from 'node:test';
import assert from 'node:assert/strict';
import { WINCH_FORCE, WINCH_RANGE, WINCH_SPEED } from '../src/game/rules.js';
import { attach, cableSnapped, createWinch, detach, findAnchor, reel, winchMount, winchTension } from '../src/game/winch.js';
import { quatFromYaw } from '../src/game/vec.js';
import { truckOf } from '../src/game/trucks.js';
import {
  CARGO_TYPES,
  atSite,
  cargoLayout,
  cargoMass,
  loadOne,
  loadedMass,
  shedCargo,
  unloadOne,
} from '../src/game/cargo.js';

const props = [
  { type: 'tree', x: 6, y: 0, z: 0, radius: 0.5, height: 10, anchor: true },
  { type: 'tree', x: 30, y: 0, z: 0, radius: 0.5, height: 10, anchor: true },
  { type: 'tree', x: 2, y: 0, z: 2, radius: 0.5, height: 10, anchor: false },
];
const origin = { x: 0, y: 1, z: 0 };

test('只挂射程内、且标为锚点的目标，取最近的那个', () => {
  const found = findAnchor(props, origin);
  assert.equal(found.index, 0);
  assert.equal(found.distance, 6);
  assert.ok(found.point.y > 0, '挂钩点在树干上，不在地面');
  assert.equal(findAnchor([props[1]], origin, 10), null, '射程之外挂不上');
  assert.equal(findAnchor([props[2]], origin), null, '远景树不能当锚点');
  assert.equal(findAnchor([], origin), null);
});

test('挂钩瞬间没有张力：缆长就是挂点到锚点的真实距离', () => {
  const result = attach(createWinch(), props, origin);
  assert.equal(result.attached, true);
  // 锚点比挂钩点高，所以缆长要比水平距离长一点。混用两者会让挂钩瞬间凭空产生拉力。
  assert.ok(result.winch.length > 6);
  const pull = winchTension(result.winch, origin, { x: 0, y: 0, z: 0 });
  assert.equal(pull.tension, 0);
  assert.ok(Math.abs(pull.distance - result.winch.length) < 1e-9);
});

test('挂不上时不改动绞盘状态', () => {
  const before = createWinch();
  const result = attach(before, [props[1]], origin, 5);
  assert.equal(result.attached, false);
  assert.equal(result.winch, before);
});

test('收线缩短缆长，松开就停住，且不会收到零', () => {
  let winch = attach(createWinch(), props, origin).winch;
  const start = winch.length;
  winch = reel(winch, true, 1);
  assert.ok(Math.abs(winch.length - (start - WINCH_SPEED)) < 1e-9);
  assert.equal(winch.pulling, true);
  const held = winch.length;
  winch = reel(winch, false, 1);
  assert.equal(winch.length, held);
  assert.equal(winch.pulling, false);
  for (let index = 0; index < 200; index += 1) winch = reel(winch, true, 1);
  assert.ok(winch.length >= 1.2);
});

test('没挂钩时收线是空操作', () => {
  const idle = createWinch();
  assert.equal(reel(idle, true, 1), idle);
  assert.equal(winchTension(idle, origin, { x: 0, y: 0, z: 0 }).tension, 0);
});

test('钢缆只拉不推，方向指向锚点，且不超过额定拉力', () => {
  const winch = { ...attach(createWinch(), props, origin).winch, length: 3 };
  const pull = winchTension(winch, origin, { x: 0, y: 0, z: 0 });
  assert.ok(pull.tension > 0);
  assert.ok(pull.force.x > 0, '锚点在 +x，拉力也该朝 +x');
  assert.ok(Math.abs(pull.force.z) < 1e-9);
  // 靠得比缆长更近就该完全松弛。
  const slack = winchTension({ ...winch, length: 20 }, origin, { x: 0, y: 0, z: 0 });
  assert.equal(slack.tension, 0);
  const extreme = winchTension({ ...winch, length: 0.1 }, origin, { x: -50, y: 0, z: 0 });
  assert.ok(extreme.tension <= WINCH_FORCE);
});

test('远离锚点时阻尼加力，靠近时不反向加速', () => {
  const winch = { ...attach(createWinch(), props, origin).winch, length: 3 };
  const leaving = winchTension(winch, origin, { x: -4, y: 0, z: 0 });
  const closing = winchTension(winch, origin, { x: 4, y: 0, z: 0 });
  assert.ok(leaving.tension > closing.tension);
});

test('缆绳被拽出额定长度太多就断', () => {
  const winch = { ...createWinch(), anchor: { x: 0, y: 0, z: 0 }, length: 5 };
  assert.equal(cableSnapped(winch, 8), false);
  assert.equal(cableSnapped(winch, 12), true);
  assert.equal(cableSnapped(createWinch(), 999), false);
});

test('脱钩清空状态', () => {
  assert.deepEqual(detach(), createWinch());
});

test('绞盘挂点在车头前方', () => {
  const spec = truckOf('hauler');
  const mount = winchMount(spec);
  assert.ok(mount.z < -spec.body.length * 0.4);
  assert.equal(mount.x, 0);
  assert.ok(Number.isFinite(quatFromYaw(0).w));
  assert.ok(WINCH_RANGE > 10, '射程太短的话路边的树就没意义了');
});

test('货物质量与重心抬升：装得越多越重、重心越高', () => {
  const spec = truckOf('hauler');
  const empty = loadedMass(spec, []);
  assert.equal(empty.mass, spec.mass);
  assert.equal(empty.comLift, 0);
  const one = loadedMass(spec, [{ type: 'pipes' }]);
  const three = loadedMass(spec, [{ type: 'pipes' }, { type: 'pipes' }, { type: 'pipes' }]);
  assert.ok(three.mass > one.mass && one.mass > empty.mass);
  assert.ok(three.comLift > one.comLift);
  // 抬升量必须夹在悬挂行程内，否则悬挂几何会失效。
  assert.ok(three.comLift <= spec.suspension.rest * 0.6 + 1e-9);
});

test('装货：满了装不下，货场空了也装不了', () => {
  const spec = truckOf('scout');
  let cargo = [];
  for (let index = 0; index < spec.slots; index += 1) {
    const result = loadOne(cargo, spec, { type: 'timber' });
    assert.equal(result.loaded, true);
    cargo = result.cargo;
  }
  const overflow = loadOne(cargo, spec, { type: 'timber' });
  assert.equal(overflow.loaded, false);
  assert.equal(overflow.cargo, cargo);
  assert.ok(overflow.reason);
  const dry = loadOne([], spec, 0);
  assert.equal(dry.loaded, false);
});

test('卸货一次一件，空车卸不出东西', () => {
  const result = unloadOne([{ type: 'pipes' }, { type: 'pipes' }]);
  assert.equal(result.cargo.length, 1);
  assert.equal(result.unloaded.type, 'pipes');
  assert.equal(unloadOne([]).unloaded, null);
});

test('翻车会甩掉货，甩不出负数', () => {
  assert.equal(shedCargo([{ type: 'pipes' }, { type: 'pipes' }], 1).lost, 1);
  assert.equal(shedCargo([{ type: 'pipes' }], 5).cargo.length, 0);
  assert.equal(shedCargo([], 1).lost, 0);
});

test('到点判定要求停稳', () => {
  const site = { x: 10, z: 10, radius: 8 };
  assert.equal(atSite(site, { x: 10, z: 10 }, 0.5), true);
  assert.equal(atSite(site, { x: 10, z: 10 }, 9), false, '飞驰而过不算到场');
  assert.equal(atSite(site, { x: 40, z: 10 }, 0), false);
  assert.equal(atSite(null, { x: 0, z: 0 }, 0), false);
});

test('车厢摆货：件数越多堆得越高，都在车身范围内', () => {
  const spec = truckOf('heavy');
  const cargo = Array.from({ length: spec.slots }, () => ({ type: 'transformer' }));
  const layout = cargoLayout(spec, cargo);
  assert.equal(layout.length, spec.slots);
  assert.ok(layout.at(-1).y > layout[0].y);
  for (const item of layout) {
    assert.ok(Math.abs(item.x) < spec.body.width);
    assert.ok(Math.abs(item.z) < spec.body.length);
  }
  assert.equal(cargoMass(cargo), CARGO_TYPES.transformer.mass * spec.slots);
});
