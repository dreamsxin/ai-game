import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_BULLDOZE } from '../src/game/rules.js';
import { createGame } from '../src/game/simulation.js';
import { keyAction } from '../src/game/input.js';
import {
  buildingBrief,
  coachLine,
  monthLabel,
  netLabel,
  powerLabel,
  populationLabel,
  speedLabel,
  starLabel,
  toolLabel,
  winComment,
} from '../src/scene/readout.js';

test('月份显示成年月，跨年会进位', () => {
  assert.equal(monthLabel(0), '第 1 年 1 月');
  assert.equal(monthLabel(11), '第 1 年 12 月');
  assert.equal(monthLabel(13), '第 2 年 2 月');
});

test('电力读数没有负载时只报供电，有负载时报缺口两侧', () => {
  assert.equal(powerLabel({ demand: 0, supply: 36 }), '36');
  assert.equal(powerLabel({ demand: 40, supply: 36 }), '40 / 36');
});

test('收支和人口读数带符号、带目标', () => {
  assert.equal(netLabel(12), '+12');
  assert.equal(netLabel(-12), '-12');
  assert.equal(populationLabel(30, 60), '30 / 60');
  assert.equal(speedLabel(0), '暂停');
  assert.equal(speedLabel(2), '2× 速');
  assert.equal(starLabel(2), '★★☆');
});

test('建筑简介把这栋楼的作用讲清楚', () => {
  assert.match(buildingBrief('house'), /床位 12/);
  assert.match(buildingBrief('power'), /供电 36/);
  assert.match(buildingBrief('factory'), /岗位 20/);
  assert.match(buildingBrief('park'), /环境 \+6/);
  assert.equal(buildingBrief('不存在'), '');
  assert.equal(toolLabel(TOOL_BULLDOZE), '拆除');
});

test('教练提示先教修路，再按短板换话', () => {
  const fresh = createGame(0, 5);
  assert.match(coachLine(fresh), /城门/);

  const wired = { ...fresh, report: { ...fresh.report, counts: { road: 6 }, capacity: 0, jobs: 0 } };
  assert.match(coachLine(wired), /住宅/);

  const outage = {
    ...fresh,
    report: { ...fresh.report, counts: { road: 6 }, capacity: 12, jobs: 8, powered: false, limiter: 'power' },
  };
  assert.match(coachLine(outage), /电/);
  assert.match(coachLine({ ...fresh, status: 'won' }), /达标/);
});

test('结算点评随工期变化', () => {
  assert.match(winComment(10, 20), /漂亮/);
  assert.notEqual(winComment(40, 20), winComment(10, 20));
});

test('按键映射覆盖工具、时间和镜头，未绑定的键返回 null', () => {
  assert.equal(keyAction('Digit2'), 'tool:house');
  assert.equal(keyAction('KeyB'), `tool:${TOOL_BULLDOZE}`);
  assert.equal(keyAction('Space'), 'pause');
  assert.equal(keyAction('KeyQ'), 'rotateLeft');
  assert.equal(keyAction('Period'), 'nextTool');
  assert.equal(keyAction('KeyM'), null);
});
