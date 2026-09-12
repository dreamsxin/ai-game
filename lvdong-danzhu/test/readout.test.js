import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_ROWS } from '../src/game/rules.js';
import { marble } from '../src/game/marbles.js';
import { LEVELS, levelCount } from '../src/game/levels.js';
import { createGame } from '../src/game/simulation.js';
import {
  ammoLabel,
  bpmLabel,
  clearLabel,
  formatScore,
  formatTime,
  goalLabel,
  grooveLabel,
  levelLabel,
  livesLabel,
  muteLabel,
  pressureRatio,
  progressPercent,
  recordLabel,
  remainLabel,
  rewardLabel,
  starLabel,
  statusLabel,
  waveLabel,
} from '../src/scene/readout.js';

test('只有真刷掉旧的最高分才报新纪录', () => {
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), null);
});

test('音效开关的文案把当前状态说清楚', () => {
  assert.equal(muteLabel(true), '音效已关');
  assert.equal(muteLabel(false), '音效已开');
});

test('星级点评按拿到几颗给，通关时不挑刺', () => {
  assert.match(rewardLabel(3), /满星/);
  assert.match(rewardLabel(2), /满星/);
  assert.notEqual(rewardLabel(2), rewardLabel(3));
  assert.match(rewardLabel(1), /过关/);
  assert.notEqual(rewardLabel(0), rewardLabel(1), '零星是没过关，不能和过关说一样的话');
});


test('分数按中文千分位显示，时间补零', () => {
  assert.equal(formatScore(12345), '12,345');
  assert.equal(formatScore(0), '0');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(75.9), '01:15');
  assert.equal(formatTime(-5), '00:00', '负数按 0 处理');
});

test('关卡与目标文案带上关号和总关数', () => {
  const level = LEVELS[2];
  assert.equal(levelLabel(level), `第 3/${levelCount} 关 · ${level.name}`);
  assert.equal(goalLabel(level), `目标 ${formatScore(level.target)}`);
  assert.equal(bpmLabel(level), `${level.bpm} BPM`);
});

test('状态文案覆盖每种状态', () => {
  for (const status of ['ready', 'playing', 'paused', 'won', 'over']) {
    assert.ok(statusLabel(status).length > 0, `${status} 缺文案`);
  }
  assert.equal(statusLabel('unknown'), '');
});

test('命数、波次和律动倍率都有对应显示', () => {
  assert.equal(livesLabel(3), '剩 3 条命');
  assert.equal(livesLabel(0), '剩 0 条命');
  assert.equal(waveLabel(2), '还有 2 波下压');
  assert.equal(waveLabel(0), '最后一波，清场即过关');
  assert.equal(grooveLabel(0), '×1.0 律动');
  assert.equal(grooveLabel(10), '×2.0 律动');
  assert.equal(ammoLabel('rose'), '上膛 玫红');
});

test('进度与星级按门槛换算', () => {
  assert.equal(progressPercent(1050, 2100), 50);
  assert.equal(progressPercent(9999, 2100), 100);
  assert.equal(starLabel(0), '☆☆☆');
  assert.equal(starLabel(2), '★★☆');
  assert.equal(remainLabel(0, 2100), `还差 ${formatScore(2100)} 分拿第一颗星`);
  assert.equal(remainLabel(2100, 2100), '星级门槛已达成');
});

test('消除提示把颜色、连消、掉落和得分拼在一行', () => {
  assert.equal(clearLabel(null), '');
  const line = clearLabel({ count: 4, chain: 2, combo: 5, gained: 900, dropped: 3, color: 'mint' });
  assert.ok(line.includes('薄荷 4 连'));
  assert.ok(line.includes('2 连消'));
  assert.ok(line.includes('掉落 3'));
  assert.ok(line.includes('×1.5'));
  assert.ok(line.includes('+900'));
  const plain = clearLabel({ count: 3, chain: 1, combo: 0, gained: 150, dropped: 0, color: 'rose' });
  assert.ok(!plain.includes('连消'), '首次消除不显示连消');
  assert.ok(!plain.includes('掉落'));
});

test('压迫感按最低那行算，空墙是 0', () => {
  const game = createGame(1);
  assert.ok(pressureRatio(game.grid) > 0);
  assert.ok(pressureRatio(game.grid) < 1);
  const empty = game.grid.map((row) => row.map(() => null));
  assert.equal(pressureRatio(empty), 0);
  const bottom = empty.map((row, index) => (index === GRID_ROWS - 1 ? row.map(() => marble('rose')) : row));
  assert.equal(pressureRatio(bottom), 1, '压到底线就是 1');
});
