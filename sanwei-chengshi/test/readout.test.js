import test from 'node:test';
import assert from 'node:assert/strict';
import { ROAD_TRUNK, ZONE_CORE } from '../src/game/rules.js';
import { generateCity } from '../src/game/city.js';
import {
  HELP_STEPS, areaLabel, buildingCard, cameraFrame, floorAreaLabel, heightLabel,
  roadKmLabel, roadLabel, seedLabel, statLines, tallestLabel, waterLabel, zoneLabel,
} from '../src/scene/readout.js';

test('镜头距离随城市尺寸放大，且缩放区间包住初始距离', () => {
  const small = cameraFrame(64, 64, 10);
  const large = cameraFrame(128, 128, 10);
  assert.ok(large.distance > small.distance);
  assert.ok(small.minDistance < small.distance && small.distance < small.maxDistance);
  assert.ok(small.height > 0);
});

test('标签文案带单位，数字做过收敛', () => {
  assert.equal(seedLabel(42), '#000042');
  assert.equal(areaLabel(0.9216), '0.92 km²');
  assert.equal(roadKmLabel(12.345), '12.3 km');
  assert.equal(heightLabel(199.98), '200 m');
  assert.equal(waterLabel(0.1234), '12.3%');
  assert.equal(floorAreaLabel(834.6), '835 万 m²');
  assert.equal(floorAreaLabel(23400), '2.34 亿 m²');
});

test('用地和道路等级都有中文名，未知值有兜底', () => {
  assert.equal(zoneLabel(ZONE_CORE), '中央商务区');
  assert.equal(zoneLabel('unknown'), '未定性');
  assert.equal(roadLabel(ROAD_TRUNK), '主干道');
  assert.equal(roadLabel(0), '非道路');
});

test('统计面板六项都填得上值', () => {
  const city = generateCity(303, 'town');
  const lines = statLines(city.stats);
  assert.equal(lines.length, 6);
  assert.ok(lines.every((line) => line.label && line.value));
  assert.ok(tallestLabel(city.stats).includes('m'));
  assert.equal(tallestLabel({ tallest: null }), '暂无楼宇');
});

test('信息卡列出用地、层数和高度，没选楼时是 null', () => {
  const city = generateCity(303, 'town');
  const card = buildingCard(city.stats.tallest);
  assert.equal(card.title, city.stats.tallest.name);
  assert.deepEqual(
    card.lines.map((line) => line.label),
    ['用地性质', '建筑类别', '层数', '建筑高度', '占地'],
  );
  assert.equal(buildingCard(null), null);
});

test('说明文案四步齐全', () => {
  assert.equal(HELP_STEPS.length, 4);
  assert.ok(HELP_STEPS.every((step) => step.title && step.detail));
});
