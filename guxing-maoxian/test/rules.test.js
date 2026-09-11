import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAVITY, HOLD_GRAVITY, RUN_MAX, WALK_MAX, jumpGravity, resultStars, sizeFor, speedCap, stompScore, timeBonus } from '../src/game/rules.js';

test('按住跳跃键时重力更小，上升段才有可变跳跃高度', () => {
  assert.equal(jumpGravity(-8, true), HOLD_GRAVITY);
  assert.equal(jumpGravity(-8, false), GRAVITY);
  assert.equal(jumpGravity(3, true), GRAVITY, '下落段按住也不减重力');
});

test('奔跑键抬高速度上限', () => {
  assert.equal(speedCap(false), WALK_MAX);
  assert.equal(speedCap(true), RUN_MAX);
  assert.ok(RUN_MAX > WALK_MAX);
});

test('连续踩敌人分数递增，第六个之后封顶', () => {
  assert.equal(stompScore(1), 100);
  assert.equal(stompScore(3), 400);
  assert.equal(stompScore(6), 2000);
  assert.equal(stompScore(12), 2000);
  assert.equal(stompScore(0), 100, '至少按一次算');
});

test('剩余时间折算成过关奖励', () => {
  assert.equal(timeBonus(10.9), 500);
  assert.equal(timeBonus(0), 0);
  assert.equal(timeBonus(-5), 0);
});

test('体型只有小和大两种', () => {
  assert.ok(sizeFor('big').h > sizeFor('small').h);
  assert.deepEqual(sizeFor('star'), sizeFor('big'), '除 small 以外都是大身体');
});

test('结算星级按分数分档', () => {
  assert.equal(resultStars(0), 0);
  assert.equal(resultStars(9000), 1);
  assert.equal(resultStars(18000), 2);
  assert.equal(resultStars(31000), 3);
});
