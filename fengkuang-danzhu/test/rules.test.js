import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREAK_SCORE,
  HIT_SCORE,
  MAX_COMBO_MULTIPLIER,
  STAGE_TURNS,
  bombChance,
  breakScore,
  brickHp,
  comboMultiplier,
  hitScore,
  pickupScore,
  stageOf,
} from '../src/game/rules.js';

test('阶段每 STAGE_TURNS 回合进一档', () => {
  assert.equal(stageOf(1), 1);
  assert.equal(stageOf(STAGE_TURNS), 1);
  assert.equal(stageOf(STAGE_TURNS + 1), 2);
  assert.equal(stageOf(STAGE_TURNS * 3 + 2), 4);
  assert.equal(stageOf(0), 1, '还没开局也按第一阶段算');
});

test('连砸倍率随本回合拆砖数增长并封顶', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(10), 1.5);
  assert.equal(comboMultiplier(20), MAX_COMBO_MULTIPLIER);
  assert.equal(comboMultiplier(200), MAX_COMBO_MULTIPLIER, '再多也封顶');
});

test('撞击、拆砖、加珠三种得分都吃连砸倍率', () => {
  assert.equal(hitScore(0), HIT_SCORE);
  assert.equal(hitScore(20), HIT_SCORE * 2);
  assert.equal(breakScore('brick', 0), BREAK_SCORE);
  assert.ok(breakScore('bomb', 0) > breakScore('brick', 0), '炸弹砖更值钱');
  assert.equal(pickupScore(20), 30);
});

test('砖块血量跟着回合涨，最低是 1', () => {
  assert.equal(brickHp(1, 0), 1);
  assert.ok(brickHp(10, 0) > brickHp(3, 0));
  assert.equal(brickHp(1, -5), 1, '骰子再差也不会出 0 血砖');
  assert.equal(brickHp(5, 2), brickHp(5, 0) + 2);
});

test('炸弹出现率随阶段提高但封在 35%', () => {
  assert.ok(bombChance(1) < bombChance(STAGE_TURNS * 2 + 1));
  assert.ok(bombChance(1000) <= 0.35);
});
