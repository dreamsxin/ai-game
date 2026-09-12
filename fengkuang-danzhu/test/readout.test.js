import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_ROWS, STAGE_TURNS } from '../src/game/rules.js';
import { brick, plus } from '../src/game/bricks.js';
import { setCell } from '../src/game/grid.js';
import { createGame } from '../src/game/simulation.js';
import { DEFAULT_AIM, clampAim } from '../src/game/aim.js';
import {
  aimLabel,
  ballsLabel,
  bricksLabel,
  comboLabel,
  dangerLabel,
  dangerRatio,
  formatScore,
  formatTime,
  hpLabel,
  muteLabel,
  recordLabel,
  rewardLabel,
  stageLabel,
  statusLabel,
  turnLabel,
  turnSummary,
} from '../src/scene/readout.js';

const blank = () => Array.from({ length: GRID_ROWS }, () => Array.from({ length: 7 }, () => null));

test('分数按中文千分位显示，时间补零', () => {
  assert.equal(formatScore(98765), '98,765');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(125.7), '02:05');
  assert.equal(formatTime(-3), '00:00');
});

test('回合、阶段、弹珠数、砖块数都有文案', () => {
  assert.equal(turnLabel(7), '第 7 回合');
  assert.equal(stageLabel(2), '第 2 阶段');
  assert.equal(ballsLabel(12), '12 颗弹珠');
  assert.equal(bricksLabel(0), '0 块砖');
});

test('状态文案覆盖每种状态', () => {
  for (const status of ['ready', 'playing', 'paused', 'over']) {
    assert.ok(statusLabel(status).length > 0, `${status} 缺文案`);
  }
  assert.equal(statusLabel('unknown'), '');
});

test('瞄准角度按数学习惯显示', () => {
  assert.equal(aimLabel(DEFAULT_AIM), '90°');
  assert.equal(aimLabel(clampAim(1, -1)), '45°');
  assert.equal(aimLabel(clampAim(-1, -1)), '135°');
});

test('连砸倍率文案跟着本回合拆砖数走', () => {
  assert.equal(comboLabel(0), '×1.00 连砸');
  assert.equal(comboLabel(20), '×2.00 连砸');
});

test('总血量不计加珠', () => {
  let grid = setCell(blank(), 0, 0, brick(7));
  grid = setCell(grid, 1, 0, plus());
  assert.equal(hpLabel(grid), '总血量 7');
});

test('危险度按最低那行算，越界提示更急', () => {
  const game = createGame(1);
  assert.ok(dangerRatio(game.grid) > 0);
  assert.ok(dangerRatio(game.grid) < 1);
  assert.equal(dangerRatio(blank()), 0);
  assert.ok(dangerLabel(blank()).includes(String(GRID_ROWS)));

  const brink = setCell(blank(), 3, GRID_ROWS - 1, brick(1));
  assert.equal(dangerRatio(brink), 1);
  assert.equal(dangerLabel(brink), '就要压到底线了');
  const oneMore = setCell(blank(), 3, GRID_ROWS - 2, brick(1));
  assert.equal(dangerLabel(oneMore), '离底线还有 1 行');
});

test('回合小结把拆砖数和吃到的加珠拼在一行', () => {
  assert.equal(turnSummary(null), '');
  const line = turnSummary({ turn: 9, destroyed: 5, pickups: 2, balls: 11 });
  assert.ok(line.includes('第 9 回合'));
  assert.ok(line.includes('砸 5 块'));
  assert.ok(line.includes('+2 珠'));
  assert.ok(line.includes('共 11 颗'));
  const quiet = turnSummary({ turn: 1, destroyed: 0, pickups: 0, balls: 1 });
  assert.ok(!quiet.includes('砸'));
  assert.ok(!quiet.includes('珠 '));
});

test('阶段常量与文案对得上', () => {
  assert.equal(stageLabel(1), '第 1 阶段');
  assert.ok(STAGE_TURNS > 1);
});

test('静音和纪录的文案', () => {
  assert.equal(muteLabel(true), '音效已关');
  assert.equal(muteLabel(false), '音效已开');
  assert.equal(recordLabel(true), '新纪录');
  assert.equal(recordLabel(false), '');
});

test('结算评价按最突出的那一项说话，并且每种情况都有话说', () => {
  const state = (over = {}) => ({ bestCombo: 0, ballCount: 1, pickups: 0, turn: 1, ...over });
  assert.equal(rewardLabel(state({ bestCombo: 14 })), '一串连爆带走一片，这手瞄得很准');
  assert.equal(rewardLabel(state({ ballCount: 33 })), '弹珠攒得够多了，下次早点开始扫加珠');
  assert.equal(rewardLabel(state({ pickups: 9 })), '加珠吃得不错，再多留意炸弹砖的位置');
  assert.equal(rewardLabel(state({ turn: 25 })), '撑得够久，接下来该想办法把下压压回去');
  assert.equal(rewardLabel(state()), '先盯着绿色加珠打，弹珠多了才砸得开');
  // 连爆最能说明问题，同时满足几条时它优先。
  assert.equal(rewardLabel(state({ bestCombo: 14, ballCount: 40, pickups: 20, turn: 40 })), '一串连爆带走一片，这手瞄得很准');
});

