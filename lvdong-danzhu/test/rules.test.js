import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMOR,
  BEAT_WINDOW,
  MARBLE_SCORE,
  beatPeriod,
  chainMultiplier,
  clearScore,
  crackScore,
  dropScore,
  grooveMultiplier,
  onBeat,
  progressRatio,
  starsFor,
} from '../src/game/rules.js';

test('连消倍率每多一环加 0.5，最高 4 倍', () => {
  assert.equal(chainMultiplier(1), 1);
  assert.equal(chainMultiplier(2), 1.5);
  assert.equal(chainMultiplier(7), 4);
  assert.equal(chainMultiplier(99), 4, '再长也封顶');
  assert.equal(chainMultiplier(0), 1, '还没消过按 1 倍算');
});

test('律动倍率按连续踩拍数攒，最高 2 倍', () => {
  assert.equal(grooveMultiplier(0), 1);
  assert.equal(grooveMultiplier(5), 1.5);
  assert.equal(grooveMultiplier(10), 2);
  assert.equal(grooveMultiplier(40), 2, '封顶后不再涨');
});

test('消除得分是颗数乘连消倍率再乘律动倍率', () => {
  assert.equal(clearScore(3), 3 * MARBLE_SCORE);
  assert.equal(clearScore(3, 2), Math.floor(3 * MARBLE_SCORE * 1.5));
  assert.equal(clearScore(3, 2, 10), Math.floor(3 * MARBLE_SCORE * 1.5 * 2));
  assert.equal(clearScore(0, 3, 3), 0, '没消到就不给分');
});

test('掉落和砸裂各自结算，只吃律动倍率', () => {
  assert.equal(dropScore(2), 160);
  assert.equal(dropScore(2, 10), 320);
  assert.equal(dropScore(0), 0);
  assert.equal(crackScore(0), 10);
  assert.equal(crackScore(10), 20);
});

test('星级按门槛累加，最多三颗', () => {
  assert.equal(starsFor(3000, [4000, 6500, 9000]), 0);
  assert.equal(starsFor(4000, [4000, 6500, 9000]), 1);
  assert.equal(starsFor(9999, [4000, 6500, 9000]), 3);
});

test('进度比例夹在 0 到 1 之间', () => {
  assert.equal(progressRatio(0, 100), 0);
  assert.equal(progressRatio(50, 100), 0.5);
  assert.equal(progressRatio(500, 100), 1);
  assert.equal(progressRatio(10, 0), 1, '没有目标就算已达成');
});

test('拍前拍后各半个窗口内都算踩准', () => {
  const period = beatPeriod(120);
  assert.equal(period, 0.5);
  assert.equal(onBeat(0, period), true, '正好压在拍上');
  assert.equal(onBeat(BEAT_WINDOW - 0.01, period), true, '刚过拍一点点');
  assert.equal(onBeat(period - BEAT_WINDOW + 0.01, period), true, '快到下一拍');
  assert.equal(onBeat(period / 2, period), false, '两拍正中间是最差时机');
});

test('异色砸两下才碎', () => {
  assert.equal(ARMOR, 2);
});
