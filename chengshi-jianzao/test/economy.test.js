import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_APPEAL, ROAD, TERRAIN_FOREST } from '../src/game/rules.js';
import { createCity, indexOf, place } from '../src/game/city.js';
import { limiterOf, monthlyReport, survey, targetPopulation } from '../src/game/economy.js';

// 一条从城门伸出去的横路，路两侧放东西都算接入市政。
const town = () => {
  const city = createCity(6, 5);
  city.entrance = indexOf(city, 0, 2);
  city.build[city.entrance] = ROAD;
  let next = city;
  for (let col = 1; col < 5; col += 1) next = place(next, col, 2, ROAD);
  return next;
};

test('缺电时整城耗电建筑一起停摆，容量和岗位都归零', () => {
  let city = place(town(), 1, 1, 'house');
  city = place(city, 2, 1, 'shop');
  const report = survey(city);
  assert.equal(report.demand, 5, '住宅 2 + 商铺 3');
  assert.equal(report.powered, false);
  assert.equal(report.capacity, 0);
  assert.equal(report.jobs, 0);
});

test('电厂接上后耗电建筑复工', () => {
  let city = place(town(), 1, 1, 'house');
  city = place(city, 2, 1, 'shop');
  city = place(city, 4, 1, 'power');
  const report = survey(city);
  assert.equal(report.supply, 36);
  assert.equal(report.powered, true);
  assert.equal(report.capacity, 12);
  assert.equal(report.jobs, 8);
});

test('没接路的住宅既不算床位也不耗电', () => {
  const city = place(town(), 5, 4, 'house');
  const report = survey(city);
  assert.equal(report.serviced[indexOf(city, 5, 4)], 0);
  assert.equal(report.demand, 0);
  assert.equal(report.capacity, 0);
});

test('公园抬环境分，工厂压环境分，停摆的工厂照样难看', () => {
  let base = place(town(), 1, 1, 'house');
  base = place(base, 4, 1, 'power');
  assert.equal(survey(base).appeal, BASE_APPEAL - 7, '电厂自己就在压分');

  const parked = place(base, 1, 0, 'park');
  assert.equal(survey(parked).appeal, BASE_APPEAL - 7 + 6);

  // 工厂没接路（停摆），负分依然照算。
  const dirty = place(base, 2, 0, 'factory');
  assert.equal(survey(dirty).active[indexOf(dirty, 2, 0)], 0);
  assert.equal(survey(dirty).appeal, BASE_APPEAL - 7 - 5);
});

test('林地给周边加环境分，且有上限', () => {
  let city = place(town(), 1, 1, 'house');
  // 住宅上下各一排林地，落在半径内的有 8 格，加成会被封顶。
  for (let col = 0; col < 6; col += 1) {
    city.terrain[indexOf(city, col, 0)] = TERRAIN_FOREST;
    city.terrain[indexOf(city, col, 3)] = TERRAIN_FOREST;
  }
  city = place(city, 4, 1, 'power');
  assert.equal(survey(city).appeal, BASE_APPEAL - 7 + 6, '林地加成封顶在 6');
});

test('人口上限取床位和岗位的短板', () => {
  const homesShort = { capacity: 12, jobs: 20, appeal: 60, powered: true };
  assert.equal(targetPopulation(homesShort), 12);
  assert.equal(limiterOf(homesShort), 'homes');
  const jobsShort = { capacity: 120, jobs: 8, appeal: 60, powered: true };
  assert.equal(targetPopulation(jobsShort), 17, '8 个岗位养 17 个人');
  assert.equal(limiterOf(jobsShort), 'jobs');
});

test('环境分低于底线按比例折损容量，短板报环境', () => {
  const grim = { capacity: 100, jobs: 100, appeal: 20, powered: true };
  assert.equal(targetPopulation(grim), 50);
  assert.equal(limiterOf(grim), 'appeal');
  assert.equal(limiterOf({ ...grim, powered: false }), 'power', '缺电比环境更要紧');
});

test('月报：人口往上限收敛，税收随人口和环境走', () => {
  let city = place(town(), 1, 1, 'house');
  city = place(city, 2, 1, 'shop');
  city = place(city, 4, 1, 'power');
  const first = monthlyReport(city, 0);
  assert.equal(first.target, 12);
  assert.ok(first.growth > 0, '有床位有岗位就该有人搬进来');
  assert.equal(first.taxIncome, 0, '还没人住，收不到税');
  assert.equal(first.net, -13, '住宅 2 + 商铺 3 + 电厂 8 的维护费');

  const later = monthlyReport(city, 12);
  assert.equal(later.growth, 0, '住满了就不再涨');
  assert.ok(later.taxIncome > 0);
});

test('容量掉下来时居民会搬走，一次至少走一个', () => {
  const report = monthlyReport(createCity(4, 4), 10);
  assert.equal(report.target, 0);
  assert.ok(report.growth < 0);
  assert.equal(report.population, 10 + report.growth);
});
