import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINES_PER_LEVEL,
  MAX_LEVEL,
  comboScore,
  dropScore,
  gravityInterval,
  isDifficultClear,
  levelFor,
  lineScore,
  linesToNextLevel,
  resultStars,
} from '../src/game/rules.js';

test('每十行升一级，最高级封顶', () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(LINES_PER_LEVEL - 1), 1);
  assert.equal(levelFor(LINES_PER_LEVEL), 2);
  assert.equal(levelFor(1000), MAX_LEVEL);
  assert.equal(linesToNextLevel(0), LINES_PER_LEVEL);
  assert.equal(linesToNextLevel(1000), 0);
});

test('等级越高下落间隔越短', () => {
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    assert.ok(
      gravityInterval(level) < gravityInterval(level - 1),
      `${level} 级应比 ${level - 1} 级更快`,
    );
  }
  assert.equal(gravityInterval(MAX_LEVEL + 5), gravityInterval(MAX_LEVEL));
});

test('消行得分按行数、等级和 back-to-back 计算', () => {
  assert.equal(lineScore(0, 3), 0);
  assert.equal(lineScore(1, 1), 100);
  assert.equal(lineScore(2, 1), 300);
  assert.equal(lineScore(3, 1), 500);
  assert.equal(lineScore(4, 1), 800);
  assert.equal(lineScore(4, 2), 1600, '等级是倍率');
  assert.equal(lineScore(4, 1, { backToBack: true }), 1200, '连续 Tetris 有 1.5 倍');
  assert.equal(lineScore(1, 1, { tspin: true }), 800);
  assert.equal(lineScore(1, 1, { tspin: true, backToBack: true }), 1200);

  assert.equal(lineScore(2, 1, { backToBack: true }), 300, '双消不吃 back-to-back');
});

test('连击与下落得分', () => {
  assert.equal(comboScore(0, 3), 0);
  assert.equal(comboScore(2, 3), 300);
  assert.equal(dropScore(5, false), 5);
  assert.equal(dropScore(5, true), 10);
});

test('只有 Tetris 和 T-spin 算困难消行', () => {
  assert.equal(isDifficultClear(4, false), true);
  assert.equal(isDifficultClear(1, true), true);
  assert.equal(isDifficultClear(3, false), false);
  assert.equal(isDifficultClear(0, true), false);
});

test('结算星级随分数提升', () => {
  assert.equal(resultStars(0), 0);
  assert.equal(resultStars(8000), 1);
  assert.equal(resultStars(25000), 2);
  assert.equal(resultStars(60000), 3);
});
