import test from 'node:test';
import assert from 'node:assert/strict';
import { levelAt, levelCount } from '../src/game/levels.js';
import {
  clearLabel,
  formatScore,
  formatTime,
  goalLabel,
  levelLabel,
  movesLabel,
  progressPercent,
  remainLabel,
  specialLabel,
  starLabel,
  statusLabel,
} from '../src/scene/readout.js';

test('分数按中文千分位显示', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(12345.7), '12,345');
});

test('用时显示成分秒', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(95), '01:35');
  assert.equal(formatTime(-5), '00:00', '负数按零处理');
});

test('每种状态都有提示语', () => {
  for (const status of ['ready', 'playing', 'paused', 'won', 'over']) {
    assert.ok(statusLabel(status).length > 0, `${status} 缺提示语`);
  }
  assert.equal(statusLabel('unknown'), '');
});

test('关卡与目标文案带上关号和目标分', () => {
  const level = levelAt(0);
  assert.equal(levelLabel(level), `第 1/${levelCount} 关 · ${level.name}`);
  assert.equal(goalLabel(level), `目标 ${formatScore(level.target)}`);
});

test('剩余步数不显示负数', () => {
  assert.equal(movesLabel(7), '7 步');
  assert.equal(movesLabel(-2), '0 步');
});

test('进度按百分比取整并封顶', () => {
  assert.equal(progressPercent(0, 1000), 0);
  assert.equal(progressPercent(333, 1000), 33);
  assert.equal(progressPercent(4000, 1000), 100);
});

test('星级用实心和空心星拼出三颗', () => {
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(2), '★★☆');
  assert.equal(starLabel(3), '★★★');
});

test('消除提示带上数量、连锁和特殊果实', () => {
  assert.equal(clearLabel(null), '');
  assert.equal(clearLabel({ count: 3, chain: 1, gained: 180, specials: [] }), '消 3 · +180');
  assert.equal(
    clearLabel({ count: 9, chain: 3, gained: 1620, specials: ['row', 'row'] }),
    `消 9 · 3 连锁 · ${specialLabel('row')} · +1,620`,
    '重复的特殊果实只提一次',
  );
});

test('差距文案在达标后换成提示', () => {
  assert.equal(remainLabel(200, 1000), '还差 800 分');
  assert.equal(remainLabel(1200, 1000), '目标已达成');
});
