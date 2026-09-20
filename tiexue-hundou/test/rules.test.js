import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMMO_MAX,
  PRONE_RELOAD_BOOST,
  RELOAD_FILL,
  RELOAD_TIME,
  REFUND_HIT,
  REFUND_WEAK,
  chainBonus,
  jumpGravity,
  refundFor,
  reloadRate,
  resultStars,
  sizeFor,
  timeBonus,
} from '../src/game/rules.js';

test('装填只补回一个底数，而且远远填不满弹匣', () => {
  assert.ok(RELOAD_FILL < AMMO_MAX / 3, '底数必须明显小于满弹匣，否则回弹就不值钱了');
});

test('蹲下装填比站着装填快，而且快得看得出来', () => {
  const standing = reloadRate(false);
  const prone = reloadRate(true);
  assert.ok(prone > standing);
  assert.equal(prone / standing, PRONE_RELOAD_BOOST);
  assert.equal(standing, 1 / RELOAD_TIME);
});

test('回弹发数：核心舱比普通命中多，装甲一发不回', () => {
  assert.equal(refundFor('hit'), REFUND_HIT);
  assert.equal(refundFor('weak'), REFUND_WEAK);
  assert.equal(refundFor('armor'), 0);
  assert.ok(refundFor('weak') > refundFor('hit'));
});

test('蹲下的身形更矮更宽，站起来更高', () => {
  const stand = sizeFor(false);
  const prone = sizeFor(true);
  assert.ok(prone.h < stand.h);
  assert.ok(prone.w > stand.w);
});

test('连击加分单调不降，到顶后封顶', () => {
  const values = [1, 2, 3, 4, 5, 6, 9].map((chain) => chainBonus(chain));
  for (let i = 1; i < values.length; i += 1) assert.ok(values[i] >= values[i - 1]);
  assert.equal(chainBonus(9), chainBonus(6));
  assert.equal(chainBonus(0), chainBonus(1));
});

test('按住跳跃键时重力更小，松手或下落时回到正常重力', () => {
  assert.ok(jumpGravity(-5, true) < jumpGravity(-5, false));
  assert.equal(jumpGravity(5, true), jumpGravity(5, false));
});

test('时间奖励与分数星级都是单调的', () => {
  assert.ok(timeBonus(40) > timeBonus(10));
  assert.equal(timeBonus(-3), 0);
  assert.equal(resultStars(0), 0);
  assert.ok(resultStars(50000) === 3);
  const stars = [0, 12000, 26000, 42000].map(resultStars);
  for (let i = 1; i < stars.length; i += 1) assert.ok(stars[i] > stars[i - 1]);
});
