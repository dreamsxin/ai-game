import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../src/game/random.js';
import { TERRAIN_WATER, ZONE_WATER, zoneSpec } from '../src/game/rules.js';
import { generateTerrain, waterCount } from '../src/game/terrain.js';
import { assignZones, coreDistance, landArea, zoneBreakdown } from '../src/game/blocks.js';
import { generateRoads } from '../src/game/roads.js';

const COLS = 64;
const ROWS = 64;

const setup = (seed, river = 1) => {
  const random = createRandom(seed);
  const { terrain } = generateTerrain(random, COLS, ROWS, river);
  const { blocks } = generateRoads(random, COLS, ROWS, { minBlock: 7, depth: 5 });
  return { terrain, blocks: assignZones(random, blocks, terrain, COLS, ROWS, 0.22) };
};

test('城心距离在中心是 0，四角是 1', () => {
  assert.ok(coreDistance(COLS, ROWS, 31.5, 31.5) < 0.01);
  assert.ok(coreDistance(COLS, ROWS, 0, 0) > 0.98);
});

test('同 seed 定性完全一致', () => {
  assert.deepEqual(setup(88).blocks, setup(88).blocks);
});

test('每个街区都有合法的用地性质和面积', () => {
  const { blocks } = setup(12);
  for (const block of blocks) {
    assert.ok(zoneSpec(block.zone), `未知用地 ${block.zone}`);
    assert.equal(block.area, block.cols * block.rows);
    assert.ok(block.distance >= 0 && block.distance <= 1);
  }
});

test('大半是水的街区一定定成水域', () => {
  const terrain = new Uint8Array(COLS * ROWS).fill(TERRAIN_WATER);
  const rect = [{ id: 0, col: 10, row: 10, cols: 8, rows: 8, depth: 2 }];
  const [block] = assignZones(createRandom(3), rect, terrain, COLS, ROWS, 0.2);
  assert.equal(block.zone, ZONE_WATER);
  assert.equal(block.water, 1);
  assert.equal(landArea(block, terrain, COLS), 0);
});

test('城心附近出现高强度开发，外围不会全是核心区', () => {
  const { blocks } = setup(5, 0);
  const inner = blocks.filter((block) => block.distance < 0.2);
  const outer = blocks.filter((block) => block.distance > 0.75);
  assert.ok(inner.some((block) => block.zone === 'core'), '城心应有 CBD');
  assert.ok(outer.every((block) => block.zone !== 'core'), '外围不该出现 CBD');
});

test('用地汇总按面积从大到小，总面积等于各街区之和', () => {
  const { blocks } = setup(41);
  const breakdown = zoneBreakdown(blocks);
  const total = blocks.reduce((sum, block) => sum + block.area, 0);
  assert.equal(breakdown.reduce((sum, entry) => sum + entry.area, 0), total);
  for (let index = 1; index < breakdown.length; index += 1) {
    assert.ok(breakdown[index - 1].area >= breakdown[index].area);
  }
});

test('waterCount 只统计给定矩形', () => {
  const terrain = new Uint8Array(COLS * ROWS);
  terrain[5 * COLS + 5] = TERRAIN_WATER;
  assert.equal(waterCount(terrain, COLS, { col: 4, row: 4, cols: 3, rows: 3 }), 1);
  assert.equal(waterCount(terrain, COLS, { col: 10, row: 10, cols: 3, rows: 3 }), 0);
});
