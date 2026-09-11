import test from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../src/game/arena.js';
import {
  acquireTarget,
  addRecoil,
  angleDelta,
  angleTo,
  isLocked,
  recoverRecoil,
  reticleState,
  shotAngle,
  steerAim,
  turnToward,
} from '../src/game/aim.js';
import {
  ASSIST_RANGE,
  LOCK_CONE,
  SPREAD_MAX,
  SPREAD_MIN,
  SPREAD_PER_SHOT,
  aimSpread,
  turnRate,
} from '../src/game/rules.js';

const arena = createArena();
const shooter = (over = {}) => ({
  id: 'ally-0',
  team: 'ally',
  x: 2,
  y: 1.5,
  aim: 0,
  alive: true,
  recoil: 0,
  focusTime: 0,
  moveRatio: 0,
  ...over,
});
const enemy = (over = {}) => ({ id: 'enemy-0', team: 'enemy', alive: true, x: 10, y: 1.5, ...over });

test('角度差取最短转向，跨过 ±PI 也不绕远路', () => {
  assert.ok(Math.abs(angleDelta(0, Math.PI * 2) ) < 1e-9);
  assert.ok(angleDelta(0.1, -0.1) < 0, '往回转是负的');
  const wrap = angleDelta(3.1, -3.1);
  assert.ok(Math.abs(wrap) < 0.1, `绕过 PI 只差一点点，实际 ${wrap}`);
});

test('枪口每帧最多转一个步长，转不到就停半路', () => {
  assert.equal(turnToward(0, 1, 0.2), 0.2);
  assert.equal(turnToward(0, 0.1, 0.2), 0.1, '够得到就直接对准');
  assert.ok(turnToward(0, -1, 0.2) < 0, '方向跟着目标走');
});

test('端稳会压低转速，换来更稳的枪口', () => {
  assert.ok(turnRate(1) < turnRate(0));
});

test('视线内且在辅助锥里的敌人会被软锁', () => {
  const found = acquireTarget(arena, shooter(), [enemy()]);
  assert.ok(found, '正前方的敌人应该被锁上');
  assert.equal(found.enemy.id, 'enemy-0');
});

test('隔着掩体、偏出锥外、超出距离都锁不上', () => {
  const behindCover = acquireTarget(arena, shooter({ x: 1.5, y: 3.5 }), [enemy({ x: 10.5, y: 3.5 })]);
  assert.equal(behindCover, null, '掩体后面锁不到');
  const offCone = acquireTarget(arena, shooter(), [enemy({ x: 2, y: 8.5 })]);
  assert.equal(offCone, null, '侧面 90 度不在辅助锥内');
  const tooFar = acquireTarget(arena, shooter({ x: 1.5, y: 1.5 }), [enemy({ x: 1.5 + ASSIST_RANGE + 2, y: 1.5 })]);
  assert.equal(tooFar, null, '超出辅助距离');
  const dead = acquireTarget(arena, shooter(), [enemy({ alive: false })]);
  assert.equal(dead, null, '尸体不锁');
});

test('多个候选里挑准星最近的那个', () => {
  const near = enemy({ id: 'enemy-1', x: 6, y: 1.9 });
  const centered = enemy({ id: 'enemy-2', x: 9, y: 1.5 });
  const found = acquireTarget(arena, shooter(), [near, centered]);
  assert.equal(found.enemy.id, 'enemy-2', '偏角更小的优先');
});

test('软锁只是牵引：枪口被额外拉向目标，但不会瞬移', () => {
  const unit = shooter();
  const target = { enemy: enemy({ y: 3.5 }), angle: 0.4 };
  const free = steerAim(unit.aim, 0, null, 1 / 60, 0);
  const pulled = steerAim(unit.aim, 0, target, 1 / 60, 0);
  assert.equal(free, 0, '没有目标就完全听玩家的');
  assert.ok(pulled > 0 && pulled < target.angle, `应该被拉过去一点，实际 ${pulled}`);
});

test('端稳时牵引更强，但依然不越过目标', () => {
  const target = { enemy: enemy({ y: 3.5 }), angle: 0.4 };
  const loose = steerAim(0, 0, target, 1 / 60, 0);
  const tight = steerAim(0, 0, target, 1 / 60, 1);
  assert.ok(tight > loose);
  assert.ok(tight <= target.angle);
});

test('散布：站定最准，跑动最散，端稳整体收紧', () => {
  const still = aimSpread(0, { moving: 0, focus: 0 });
  const running = aimSpread(0, { moving: 1, focus: 0 });
  const focused = aimSpread(0, { moving: 0, focus: 1 });
  assert.ok(running > still);
  assert.ok(focused < still);
  assert.equal(aimSpread(999, { moving: 1 }), SPREAD_MAX, '散布有上限');
  assert.ok(still >= SPREAD_MIN);
});

test('连发抬枪、松手回落，都夹在上限内', () => {
  let recoil = 0;
  for (let i = 0; i < 40; i += 1) recoil = addRecoil(recoil);
  assert.equal(recoil, SPREAD_MAX);
  assert.ok(addRecoil(0) === SPREAD_PER_SHOT);
  assert.equal(recoverRecoil(0.01, 1), 0, '回落不会变成负数');
  assert.ok(recoverRecoil(SPREAD_MAX, 0.2) < SPREAD_MAX);
});

test('出膛角落在散布锥内，随机为 0 时正中准星', () => {
  assert.equal(shotAngle(1.2, 0.05, 0), 1.2);
  assert.equal(shotAngle(0, 0.05, 1), 0.05);
  assert.equal(shotAngle(0, 0.05, -1), -0.05);
});

test('准星读数：偏角进锁定锥才算咬住目标', () => {
  const target = enemy({ x: 10, y: 1.5 });
  const aligned = reticleState(shooter({ aim: angleTo(shooter(), target) }), { enemy: target });
  assert.equal(aligned.locked, true);
  assert.equal(aligned.targetId, 'enemy-0');
  const off = reticleState(shooter({ aim: 0.6 }), { enemy: target });
  assert.equal(off.locked, false, '枪口还没跟上就不算锁定');
  assert.equal(reticleState(shooter(), null).targetId, null);
  assert.equal(isLocked(0, LOCK_CONE * 0.5), true);
  assert.equal(isLocked(0, LOCK_CONE * 2), false);
});
