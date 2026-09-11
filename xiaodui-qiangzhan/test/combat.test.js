import test from 'node:test';
import assert from 'node:assert/strict';
import { createArena } from '../src/game/arena.js';
import { advanceBullets, segmentCircle, spawnBullet } from '../src/game/combat.js';
import { BASE_DAMAGE, BULLET_RANGE, BULLET_SPEED, FALLOFF_END, UNIT_RADIUS, damageAt } from '../src/game/rules.js';

const arena = createArena();
const unit = (over = {}) => ({ id: 'ally-0', team: 'ally', x: 2, y: 1.5, aim: 0, alive: true, ...over });
const foe = (over = {}) => unit({ id: 'enemy-0', team: 'enemy', x: 5, y: 1.5, ...over });

test('子弹从枪口出膛，不会生在自己脚底下', () => {
  const bullet = spawnBullet(1, unit(), 0);
  assert.ok(bullet.x > 2 + UNIT_RADIUS);
  assert.equal(bullet.y, 1.5);
  assert.equal(bullet.traveled, 0);
});

test('线段撞圆给出最近命中点，擦不到就是 null', () => {
  assert.equal(segmentCircle(0, 0, 10, 0, 5, 0, 0.5), 0.45);
  assert.equal(segmentCircle(0, 0, 10, 0, 5, 3, 0.5), null);
  assert.equal(segmentCircle(0, 0, 1, 0, 0, 0, 0.5), 0, '起点就在圆里算贴身命中');
});

test('打中敌人：子弹消失并按距离结算伤害', () => {
  const shot = spawnBullet(1, unit(), 0);
  const target = foe();
  const result = advanceBullets(arena, [shot], [unit(), target], 0.1);
  assert.equal(result.bullets.length, 0, '命中后不再飞');
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].targetId, 'enemy-0');
  assert.equal(result.hits[0].damage, BASE_DAMAGE, '近距离满伤');
  assert.ok(result.hits[0].x > 2 && result.hits[0].x < 5);
});

test('掩体挡子弹：墙后面的人不掉血', () => {
  const shooter = unit({ x: 1.5, y: 3.5 });
  const shot = spawnBullet(1, shooter, 0);
  const target = foe({ x: 10.5, y: 3.5 });
  const result = advanceBullets(arena, [shot], [shooter, target], 0.3);
  assert.equal(result.hits.length, 0);
  assert.equal(result.impacts.length, 1, '打在墙上留个弹着点');
  assert.ok(result.impacts[0].x < 6);
});

test('没有友伤：子弹直接穿过队友', () => {
  const shot = spawnBullet(1, unit(), 0);
  const mate = unit({ id: 'ally-1', x: 4, y: 1.5 });
  const result = advanceBullets(arena, [shot], [unit(), mate], 0.05);
  assert.equal(result.hits.length, 0);
  assert.equal(result.bullets.length, 1, '继续往前飞');
});

test('飞满射程就自己消失', () => {
  // 借一张没有墙的空场，单独验证射程上限。
  const openArena = createArena(Array.from({ length: 3 }, () => '.'.repeat(40)));
  let bullets = [spawnBullet(1, unit({ x: 1.5, y: 1.5 }), 0)];
  let impacts = 0;
  for (let i = 0; i < 200 && bullets.length; i += 1) {
    const result = advanceBullets(openArena, bullets, [], 1 / 60);
    bullets = result.bullets;
    impacts += result.impacts.length;
  }
  assert.equal(bullets.length, 0);
  assert.equal(impacts, 1);
});

test('伤害随距离衰减，远距离最低但不为零', () => {
  assert.equal(damageAt(0), BASE_DAMAGE);
  assert.equal(damageAt(6), BASE_DAMAGE);
  assert.ok(damageAt(13) < BASE_DAMAGE);
  assert.ok(damageAt(FALLOFF_END) < damageAt(13));
  assert.ok(damageAt(BULLET_RANGE) > 0);
});

test('一帧只推进 BULLET_SPEED × dt，不会瞬移到对面', () => {
  const shot = spawnBullet(1, unit({ x: 1.5, y: 1.5 }), 0);
  const result = advanceBullets(arena, [shot], [], 1 / 60);
  const moved = result.bullets[0].traveled;
  assert.ok(Math.abs(moved - BULLET_SPEED / 60) < 1e-9, `实际推进 ${moved}`);
});
