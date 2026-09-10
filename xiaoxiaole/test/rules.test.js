import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNS,
  MAX_CHAIN_MULTIPLIER,
  ROWS,
  TILE_SCORE,
  chainMultiplier,
  clearScore,
  progressRatio,
  starsFor,
} from '../src/game/rules.js';

test('棋盘尺寸是 8 列 8 行', () => {
  assert.equal(COLUMNS, 8);
  assert.equal(ROWS, 8);
});

test('连锁倍率从 1 倍起每环加半倍并封顶', () => {
  assert.equal(chainMultiplier(1), 1);
  assert.equal(chainMultiplier(2), 1.5);
  assert.equal(chainMultiplier(3), 2);
  assert.equal(chainMultiplier(20), MAX_CHAIN_MULTIPLIER, '倍率不应超过上限');
});

test('消除得分按果实数乘连锁倍率', () => {
  assert.equal(clearScore(3, 1), 3 * TILE_SCORE);
  assert.equal(clearScore(3, 2), Math.floor(3 * TILE_SCORE * 1.5));
  assert.equal(clearScore(0, 5), 0, '没消到果实就没有分');
});

test('触发的特殊果实各加一份固定奖励', () => {
  assert.equal(clearScore(3, 1, ['row']), 3 * TILE_SCORE + 120);
  assert.equal(clearScore(3, 1, ['row', 'rainbow']), 3 * TILE_SCORE + 120 + 300);
});

test('星级按门槛从低到高累计，最多三星', () => {
  const thresholds = [1000, 2000, 3000];
  assert.equal(starsFor(500, thresholds), 0);
  assert.equal(starsFor(1000, thresholds), 1);
  assert.equal(starsFor(2500, thresholds), 2);
  assert.equal(starsFor(99999, thresholds), 3);
});

test('目标进度限制在 0 到 1 之间', () => {
  assert.equal(progressRatio(0, 1000), 0);
  assert.equal(progressRatio(500, 1000), 0.5);
  assert.equal(progressRatio(5000, 1000), 1);
});
