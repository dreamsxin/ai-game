import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_WEAPON, WEAPONS, aimVector, dropFor, shotsFor, weaponAt } from '../src/game/weapons.js';

test('八向瞄准：只按上下是纯垂直，加上横向就是 45 度斜射', () => {
  assert.deepEqual(aimVector({ dir: 1 }), { ax: 1, ay: 0 });
  assert.deepEqual(aimVector({ dir: -1 }), { ax: -1, ay: 0 });
  assert.deepEqual(aimVector({ dir: 1, up: true }), { ax: 0, ay: -1 });
  const upRight = aimVector({ dir: 1, up: true, right: true });
  assert.ok(upRight.ax > 0 && upRight.ay < 0);
  assert.ok(Math.abs(Math.hypot(upRight.ax, upRight.ay) - 1) < 1e-9, '斜射也要是单位向量');
});

test('蹲下（在地面按下）不算瞄下方，只有在空中按下才是压枪', () => {
  assert.deepEqual(aimVector({ dir: 1, down: true, airborne: false }), { ax: 1, ay: 0 });
  assert.deepEqual(aimVector({ dir: 1, down: true, airborne: true }), { ax: 0, ay: 1 });
});

test('没按横向时朝身体面向的方向打', () => {
  assert.deepEqual(aimVector({ dir: -1 }), { ax: -1, ay: 0 });
  const back = aimVector({ dir: -1, up: true, left: true });
  assert.ok(back.ax < 0 && back.ay < 0);
});

test('散弹一次三发，对称展开，弹速都一样', () => {
  const shots = shotsFor('spread', { x: 0, y: 0, ax: 1, ay: 0 });
  assert.equal(shots.length, 3);
  const speeds = shots.map((shot) => Math.hypot(shot.vx, shot.vy));
  for (const speed of speeds) assert.ok(Math.abs(speed - WEAPONS.spread.speed) < 1e-9);
  assert.ok(Math.abs(shots[0].vy + shots[2].vy) < 1e-9, '上下两发的偏角要对称');
  assert.ok(Math.abs(shots[1].vy) < 1e-9, '中间那发是平的');
});

test('激光是穿透的，步枪不是；机枪最快，激光伤害最高', () => {
  assert.ok(WEAPONS.laser.pierce > 0);
  assert.equal(WEAPONS.rifle.pierce, 0);
  assert.ok(WEAPONS.machine.cd < WEAPONS.rifle.cd);
  assert.ok(WEAPONS.laser.dmg > WEAPONS.rifle.dmg);
});

test('散弹的性价比在于三发都能各自回弹：一次扣的弹药少于吐出的子弹数', () => {
  assert.ok(WEAPONS.spread.count > WEAPONS.spread.cost);
});

test('未知枪械回落到制式步枪', () => {
  assert.equal(weaponAt('nope').key, BASE_WEAPON);
  assert.equal(weaponAt(undefined).key, BASE_WEAPON);
});

test('补给箱掉落按序号轮转，同一关每次玩掉的东西一样', () => {
  assert.equal(dropFor(0), dropFor(4));
  assert.notEqual(dropFor(0), dropFor(1));
  const kinds = new Set([0, 1, 2, 3].map(dropFor));
  assert.equal(kinds.size, 4, '四种掉落都要出得来');
  assert.ok(kinds.has('ammo'), '总得有纯补弹的那一种');
});
