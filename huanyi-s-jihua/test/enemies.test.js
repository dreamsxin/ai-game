import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_BULLET_HP, FIELD_H, FIELD_W } from '../src/game/rules.js';
import { enemyKinds, makeEnemy, offField, spawnWave, stepEnemy, stepShot } from '../src/game/enemies.js';
import { createRandom } from '../src/game/random.js';

const tune = { hp: 1, fire: 1, speed: 1 };
const ship = { x: 50, y: 124 };
const rng = () => createRandom(7);

test('每种敌人都有正的血量和体积，出场时都在画面上方', () => {
  for (const kind of enemyKinds) {
    const enemy = makeEnemy(kind, 1, 50, -8, { tune });
    assert.ok(enemy.hp > 0, `${kind} 没血`);
    assert.ok(enemy.w > 0 && enemy.h > 0, `${kind} 没有体积`);
    assert.ok(enemy.y < 0, `${kind} 一出场就在画面里`);
  }
});

test('一波编队都落在场地里，横向不会挤到画面外', () => {
  const { enemies } = spawnWave({ at: 0, kind: 'zako', count: 9, spread: 78 }, { tune, rng: rng(), nextId: 1 });
  assert.equal(enemies.length, 9);
  for (const enemy of enemies) {
    assert.ok(enemy.x >= 8 && enemy.x <= FIELD_W - 8, `编队里有一架站到了 x=${enemy.x}`);
  }
});

test('障碍墙一定留一个缺口——那个缺口就是这一波的解法', () => {
  const count = 5;
  const { enemies } = spawnWave({ at: 0, kind: 'wall', count }, { tune, rng: rng(), nextId: 1 });
  assert.equal(enemies.length, count - 1, '铺满一整排就没得过了');
  for (const enemy of enemies) assert.ok(enemy.blocks, '障碍墙要挡子弹');
});

test('运载火箭带着指定机翼，血也比杂兵厚——它是关卡中途唯一的换翼机会', () => {
  const { enemies } = spawnWave({ at: 0, kind: 'carrier', count: 1, wing: 'J' }, { tune, rng: rng(), nextId: 1 });
  assert.equal(enemies[0].wing, 'J');
  assert.ok(enemies[0].hp > makeEnemy('zako', 1, 50, -8, { tune }).hp * 3);
});

test('贴地目标带 low 装甲，平射打它是白打', () => {
  const ground = makeEnemy('ground', 1, 50, -8, { tune });
  assert.equal(ground.armor, 'low');
  assert.equal(makeEnemy('zako', 2, 50, -8, { tune }).armor, null);
});

test('敌弹有血量，所以火力可以把弹幕抵消掉', () => {
  let enemy = makeEnemy('zako', 1, 50, 40, { tune });
  enemy = { ...enemy, timer: 0 };
  const { shots } = stepEnemy(enemy, 1 / 60, { ship, tune, nextId: 10 });
  assert.equal(shots.length, 1);
  assert.equal(shots[0].hp, ENEMY_BULLET_HP);
  assert.ok(shots[0].vy > 0, '子弹要朝玩家那边飞');
});

test('炮台停下来打一阵，到点就继续往下走——不然上半屏会被越攒越多的炮台封死', () => {
  let enemy = makeEnemy('turret', 1, 50, -8, { tune });
  const hold = FIELD_H * 0.3;
  for (let i = 0; i < 60 * 6; i += 1) enemy = stepEnemy(enemy, 1 / 60, { ship, tune, nextId: 1 }).enemy;
  assert.ok(Math.abs(enemy.y - hold) < 1, '第 6 秒应该还钉在三分之一处开火');
  for (let i = 0; i < 60 * 12; i += 1) enemy = stepEnemy(enemy, 1 / 60, { ship, tune, nextId: 1 }).enemy;
  assert.ok(enemy.y > hold + 20, '撑够时间就该滑走，不能永久驻场');
});

test('俯冲机会追着玩家的横向位置走，所以站着不动最危险', () => {
  let left = makeEnemy('diver', 1, 20, 10, { tune });
  for (let i = 0; i < 60; i += 1) left = stepEnemy(left, 1 / 60, { ship, tune, nextId: 1 }).enemy;
  assert.ok(left.x > 20, '俯冲机应该往玩家那边偏');
  assert.ok(left.x <= ship.x + 1, '偏过头就变成乱跑了');
});

test('飞出场地的东西认得出来，回收才不会越攒越多', () => {
  assert.equal(offField({ x: 50, y: FIELD_H + 40 }), true);
  assert.equal(offField({ x: -40, y: 50 }), true);
  assert.equal(offField({ x: 50, y: 50 }), false);
  const moved = stepShot({ x: 50, y: 50, vx: 0, vy: 30, age: 0 }, 1);
  assert.equal(moved.y, 80);
  assert.equal(moved.age, 1);
});

test('同一个 seed 排出同一张图，换 seed 才换站位', () => {
  const first = spawnWave({ at: 0, kind: 'wall', count: 6 }, { tune, rng: createRandom(11), nextId: 1 });
  const same = spawnWave({ at: 0, kind: 'wall', count: 6 }, { tune, rng: createRandom(11), nextId: 1 });
  assert.deepEqual(first.enemies.map((item) => item.x), same.enemies.map((item) => item.x));
});
