// 面板文案的测试。提示是跟着处境走的，所以这里守的是**优先级**：
// 同一秒里最要紧的那句话必须压过其他所有话。

import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame } from '../src/game/simulation.js';
import {
  actionLabel,
  bubbleRatio,
  formatScore,
  formatTime,
  gearLabel,
  hintLine,
  itemName,
  levelLabel,
  progressRatio,
  resultTitle,
  rivalLabel,
  starLabel,
  statusLabel,
} from '../src/scene/readout.js';

const view = (index = 4) => startGame(index, 0);

test('分数和时间是定宽的，读数不会跳', () => {
  assert.equal(formatScore(0), '00000');
  assert.equal(formatScore(1234), '01234');
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(95.4), '01:36');
  assert.equal(formatTime(-3), '00:00', '负数也得给出能读的东西');
});

test('被困住时压过其他所有提示', () => {
  const state = view();
  state.players[0].state = 'bubble';
  state.players[0].bubble = 2;
  state.time = 5;
  state.players[1].state = 'bubble';
  assert.match(hintLine(state), /挣脱/);
});

test('有水泡可以补时，提示会点名', () => {
  const state = view();
  state.players[1].state = 'bubble';
  state.players[1].bubble = 3;
  state.time = 5;
  const line = hintLine(state);
  assert.match(line, new RegExp(state.players[1].name));
  assert.match(line, /补一发/);
});

test('没人可补但时间快到时，提示改口催人', () => {
  const state = view();
  state.time = 12;
  assert.match(hintLine(state), /时间到算输/);
});

test('装备太薄时提示先去拆箱', () => {
  const state = view();
  state.time = 90;
  assert.match(hintLine(state), /拆箱/);
});

test('什么都不紧急时就不说话', () => {
  const state = view();
  state.time = 90;
  state.players[0].power = 3;
  state.players[0].bombs = 3;
  assert.equal(hintLine(state), '', '不说话也是一种回答');
});

test('对手计数会把水泡单独点出来', () => {
  const state = view();
  assert.equal(rivalLabel(state), '对手 3');
  state.players[1].state = 'bubble';
  assert.match(rivalLabel(state), /1 个是水泡/);
  for (const player of state.players.slice(1)) player.state = 'out';
  assert.equal(rivalLabel(state), '清场');
});

test('动作键的名字跟着处境换', () => {
  const state = view();
  assert.equal(actionLabel(state.players[0]), '放水弹');
  state.players[0].state = 'bubble';
  assert.equal(actionLabel(state.players[0]), '猛点挣脱');
});

test('装备条把三个数字和踢弹都写出来', () => {
  const state = view();
  const me = state.players[0];
  assert.match(gearLabel(me), /弹 1\/6/);
  assert.ok(!gearLabel(me).includes('踢'));
  me.kick = true;
  assert.match(gearLabel(me), /踢/);
});

test('水泡的剩余比例只在水泡状态下有值', () => {
  const state = view();
  assert.equal(bubbleRatio(state.players[0]), null);
  state.players[0].state = 'bubble';
  state.players[0].bubble = 2.1;
  const ratio = bubbleRatio(state.players[0]);
  assert.ok(ratio > 0.4 && ratio < 0.6);
});

test('进度按已经清掉的对手数算', () => {
  const state = view();
  assert.equal(progressRatio(state), 0);
  state.players[1].state = 'out';
  assert.ok(Math.abs(progressRatio(state) - 1 / 3) < 0.001);
});

test('关卡名、状态、结果标题和星星都有话可说', () => {
  const state = view(0);
  assert.equal(levelLabel(state), '第 1 关 · 初堂');
  assert.equal(statusLabel('down'), '这一局没撑住');
  assert.equal(resultTitle('won'), '通关');
  assert.equal(starLabel(2), '★★☆');
  assert.equal(itemName('kick'), '踢弹');
});
