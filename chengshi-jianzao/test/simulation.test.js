import test from 'node:test';
import assert from 'node:assert/strict';
import { BANKRUPT_MONTHS, DEMOLISH_COST, ROAD, TOOL_BULLDOZE } from '../src/game/rules.js';
import { buildAt, createCity, indexOf, place } from '../src/game/city.js';
import { monthlyReport } from '../src/game/economy.js';
import {
  build,
  createGame,
  cycleTool,
  restartLevel,
  setSpeed,
  setTool,
  tick,
  togglePause,
} from '../src/game/simulation.js';

const fresh = () => createGame(0, 2026);
// 城门在左边界中间，第一条路只能从这里往右接。
const gateRow = (state) => Math.floor(state.level.rows / 2);

test('开局：预算就位、时间暂停、城门已经有一格路', () => {
  const state = fresh();
  assert.equal(state.money, state.level.budget);
  assert.equal(state.speed, 0);
  assert.equal(state.population, 0);
  assert.equal(buildAt(state.city, 0, gateRow(state)), ROAD);
});

test('建一栋就扣一次钱，账目立刻刷新', () => {
  const state = fresh();
  const next = build(state, 1, gateRow(state));
  assert.equal(next.money, state.money - 8);
  assert.equal(buildAt(next.city, 1, gateRow(state)), ROAD);
  assert.equal(next.revision, state.revision + 1);
});

test('钱不够只给一句提示，不动城市也不扣钱', () => {
  const state = { ...fresh(), money: 3, tool: 'house' };
  const next = build(state, 1, gateRow(state));
  assert.equal(next.city, state.city);
  assert.equal(next.money, 3);
  assert.match(next.notice, /还差 37/);
});

test('同一句提示不会换出新状态，拖着建也不会刷屏', () => {
  const rejected = build({ ...fresh(), tool: 'house', money: 3 }, 1, gateRow(fresh()));
  assert.equal(build(rejected, 1, gateRow(rejected)), rejected);
});

test('拆除按次收费，且拆不掉城门', () => {
  let state = build(fresh(), 1, gateRow(fresh()));
  state = setTool(state, TOOL_BULLDOZE);
  const removed = build(state, 1, gateRow(state));
  assert.equal(buildAt(removed.city, 1, gateRow(state)), '');
  assert.equal(removed.money, state.money - DEMOLISH_COST);
  assert.match(build(removed, 0, gateRow(state)).notice, /城门/);
});

test('工具切换：重复选同一个不产生新状态，非法工具被挡下', () => {
  const state = fresh();
  assert.equal(setTool(state, ROAD), state);
  assert.equal(setTool(state, '飞机场'), state);
  assert.equal(cycleTool(state, 1).tool, 'house');
  assert.equal(cycleTool(state, -1).tool, TOOL_BULLDOZE, '往前退一格绕到拆除');
});

test('暂停键在停和 1 倍速之间来回，倍速只认表里的档位', () => {
  const state = fresh();
  const running = togglePause(state);
  assert.equal(running.speed, 1);
  assert.equal(togglePause(running).speed, 0);
  assert.equal(setSpeed(state, 3), state, '没有 3 倍速这一档');
});

test('走一个月：月份加一，空城不赚不亏', () => {
  const state = tick(fresh());
  assert.equal(state.month, 1);
  assert.equal(state.money, state.level.budget);
  assert.equal(state.population, 0);
});

test('规划得当的城市能在几十个月内达标，这是通关路径的回归测试', () => {
  // 手摆一座能自持的城：一条主街 + 一排住宅，工业区拉到三格以外免得压环境分。
  let city = createCity(12, 12);
  city.entrance = indexOf(city, 0, 6);
  city.build[city.entrance] = ROAD;
  for (let col = 1; col <= 10; col += 1) city = place(city, col, 6, ROAD);
  for (let row = 7; row <= 9; row += 1) city = place(city, 1, row, ROAD);
  for (let col = 1; col <= 6; col += 1) city = place(city, col, 5, 'house');
  city = place(city, 0, 9, 'factory');
  city = place(city, 2, 9, 'factory');
  city = place(city, 1, 10, 'power');

  let state = { ...createGame(0, 2026), city, money: 500, report: monthlyReport(city, 0) };
  assert.equal(state.report.powered, true, '供电 36 应该盖住 24 的需求');
  assert.equal(state.report.capacity, 72);
  assert.equal(state.report.jobs, 40);

  for (let month = 0; month < 24 && state.status === 'playing'; month += 1) state = tick(state);
  assert.equal(state.status, 'won');
  assert.ok(state.month <= 12, `按 par 20 个月算，应该提前达标，实际 ${state.month}`);
  assert.equal(state.stars, 3);
  assert.equal(state.speed, 0, '结算时要停表');
});


test('连续赤字满月数就破产', () => {
  const brink = { ...fresh(), money: -1, deficit: BANKRUPT_MONTHS - 1 };
  const state = tick(brink);
  assert.equal(state.deficit, BANKRUPT_MONTHS);
  assert.equal(state.status, 'lost');
  assert.match(state.notice, /破产/);
  assert.equal(tick(state), state, '结束后时间不再推进');
});

test('账面回正就清零赤字计数', () => {
  const state = tick({ ...fresh(), money: 10, deficit: 2 });
  assert.equal(state.deficit, 0);
  assert.equal(state.status, 'playing');
});

test('重开同一关会拿到同一张地图和满额预算', () => {
  const played = build(fresh(), 1, gateRow(fresh()));
  const again = restartLevel(played);
  assert.equal(again.money, again.level.budget);
  assert.equal(again.month, 0);
  assert.deepEqual(Array.from(again.city.terrain), Array.from(fresh().city.terrain));
});
