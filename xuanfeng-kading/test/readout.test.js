// 界面文字。守的是同一条规矩：**相反的处境不能给出同一句话**。
// 提示行是这游戏唯一的教学通道（没有新手关，也没有说明书），所以它必须永远说对眼下这一件事。

import test from 'node:test';
import assert from 'node:assert/strict';
import { LAUNCH_WINDOW } from '../src/game/rules.js';
import { HUMAN, startGame } from '../src/game/simulation.js';
import {
  formatLap,
  formatScore,
  formatTime,
  hintLine,
  lapLabel,
  levelLabel,
  muteLabel,
  nextLabel,
  ordinal,
  qualifyLabel,
  resultTitle,
  speedLabel,
  starLabel,
  statusLabel,
  tierName,
  tokenPips,
} from '../src/scene/readout.js';

const view = (level = 0, patch = {}) => {
  const state = startGame(level, 0);
  state.countdown = 0;
  Object.assign(state.karts[HUMAN], patch);
  return state;
};

test('时间、单圈、速度、名次的写法', () => {
  assert.equal(formatTime(0), '0:00.0');
  assert.equal(formatTime(9.44), '0:09.4');
  assert.equal(formatTime(75.2), '1:15.2');
  assert.equal(formatLap(0), '--');
  assert.equal(formatLap(16.834), '16.83s');
  assert.equal(speedLabel(10), 36);
  assert.equal(speedLabel(-5), 0);
  assert.equal(ordinal(1), '第1名');
  assert.equal(formatScore(1234567), '1,234,567');
  assert.equal(starLabel(2), '★★☆');
  assert.equal(tierName(3), '大喷');
  assert.deepEqual(tokenPips([2, 1]), [2, 1, 0]);
});

test('关卡与门槛的说法跟着关卡表走', () => {
  const first = view(0);
  assert.equal(levelLabel(first), '第1关 环湖热身');
  assert.equal(lapLabel(first), '1/2圈');
  assert.equal(qualifyLabel(first), '前3名过关');
  assert.equal(qualifyLabel(view(7)), '冠军才算过关');
  assert.equal(nextLabel(view(0)), '下一关');
  assert.equal(nextLabel(view(7)), '收官');
  assert.equal(muteLabel(true), '开启音效');
  assert.equal(statusLabel('paused'), '暂停中');
  assert.equal(resultTitle('won'), '全线通关');
  assert.equal(resultTitle('down'), '没进名次');
});

test('读秒期间：先说等，再说按，抢跑了就说抢跑', () => {
  const early = startGame(0, 0);
  early.countdown = 2.4;
  assert.match(hintLine(early), /等读秒/);
  early.countdown = LAUNCH_WINDOW * 0.5;
  assert.match(hintLine(early), /就是现在/);
  early.karts[HUMAN].launch = 'early';
  assert.match(hintLine(early), /抢跑/);
  early.karts[HUMAN].launch = 'perfect';
  assert.match(hintLine(early), /弹射/);
});

test('相反的处境给出不同的提示', () => {
  const grass = hintLine(view(0, { offTrack: true }));
  const banked = hintLine(view(0, { tokens: [2], drifting: false, rank: 1 }));
  const thin = hintLine(view(0, { drifting: true, charge: 0.1 }));
  const combo = hintLine(view(0, { drifting: false, comboTimer: 0.3, tokens: [] }));
  const lines = [grass, banked, thin, combo];
  assert.equal(new Set(lines).size, lines.length, `四种处境说了重复的话：${lines.join(' / ')}`);
  assert.match(grass, /草地/);
  assert.match(banked, /中喷/);
  assert.match(thin, /方向/);
  assert.match(combo, /连喷/);
});

test('罚站和名次落后都有专门的一句', () => {
  assert.match(hintLine(view(0, { stall: 0.5 })), /罚站/);
  assert.match(hintLine(view(7, { rank: 4, tokens: [] })), /名次差 3 位/);
});

test('无事可说时就不说：提示行允许是空的', () => {
  const quiet = view(0, { rank: 1, tokens: [], drifting: false, comboTimer: 0, speed: 10 });
  assert.equal(hintLine(quiet), '');
});
