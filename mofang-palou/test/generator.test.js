import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ORDER,
  MIN_ORDER,
  TOWERS_PER_ORDER,
  loopsForTower,
  orderForTower,
  scrambleForTower,
  towerRecipe,
} from '../src/game/rules.js';
import { canReach } from '../src/game/cube.js';
import { buildTower, generateTower, validateTower } from '../src/game/generator.js';
import { replay } from '../src/game/solver.js';

test('阶数从三阶爬到六阶，每阶连爬两座', () => {
  assert.equal(orderForTower(0), MIN_ORDER);
  assert.equal(orderForTower(TOWERS_PER_ORDER - 1), MIN_ORDER);
  assert.equal(orderForTower(TOWERS_PER_ORDER), MIN_ORDER + 1);
  assert.equal(orderForTower(100), MAX_ORDER, '六阶封顶，不会有七阶');
  assert.equal(orderForTower(-5), MIN_ORDER, '负数当第一座');
});

test('难度曲线单调：打乱步数只增不减，额外开门率只减不增', () => {
  let lastScramble = 0;
  let lastLoops = 1;
  for (let index = 0; index < 40; index += 1) {
    const scramble = scrambleForTower(index);
    const loops = loopsForTower(index);
    assert.ok(scramble >= lastScramble, `第 ${index} 座的打乱步数掉下去了`);
    assert.ok(loops <= lastLoops, `第 ${index} 座的开门率涨回去了`);
    lastScramble = scramble;
    lastLoops = loops;
  }
});

test('到六阶之后靠打乱步数继续加压，但有封顶', () => {
  const first = scrambleForTower((MAX_ORDER - MIN_ORDER) * TOWERS_PER_ORDER);
  const later = scrambleForTower((MAX_ORDER - MIN_ORDER) * TOWERS_PER_ORDER + 5);
  assert.ok(later > first, '同是六阶，越往后越乱');
  assert.equal(scrambleForTower(999), scrambleForTower(1000), '封顶之后不再涨');
});

test('每座塔都过体检，且是第一次尝试就过居多', () => {
  let attempts = 0;
  const count = 24;
  for (let index = 0; index < count; index += 1) {
    const built = generateTower(index, 4242 + index * 131);
    assert.ok(built.tower, `第 ${index} 座生成失败：${JSON.stringify(built.failures.slice(0, 2))}`);
    assert.deepEqual(validateTower(built.tower).issues, []);
    attempts += built.attempts;
  }
  assert.ok(attempts / count < 1.6, `平均尝试 ${(attempts / count).toFixed(2)} 次，太高了`);
});

test('起点钉在底层、出口钉在顶层，这是「爬楼」的最低要求', () => {
  for (let index = 0; index < 16; index += 1) {
    const { tower } = generateTower(index, 77 + index * 909);
    assert.equal(tower.start.layer, 0, `第 ${index} 座的起点不在底层`);
    assert.equal(tower.exit.layer, tower.order - 1, `第 ${index} 座的出口不在顶层`);
  }
});

test('初始态一定还没通，否则这座塔白给', () => {
  for (let index = 0; index < 16; index += 1) {
    const { tower } = generateTower(index, 5150 + index * 37);
    assert.equal(canReach(tower.cube, tower.start, tower.exit), false, `第 ${index} 座开局就通了`);
  }
});

test('保底解法真的走通，可解性是构造出来的不是搜出来的', () => {
  for (let index = 0; index < 20; index += 1) {
    const { tower } = generateTower(index, 909 + index * 613);
    const end = replay(tower.cube, tower.start, tower.exit, tower.solution);
    assert.equal(canReach(end.cube, end.cell, end.exit), true, `第 ${index} 座的保底解法走不到出口`);
    assert.equal(tower.solution.length, tower.scramble);
    assert.equal(tower.par, tower.scramble);
  }
});

test('保底解法把砖阵还原成解开态', () => {
  const { tower } = generateTower(3, 20260912);
  const end = replay(tower.cube, tower.start, tower.exit, tower.solution);
  assert.deepEqual(end.cube.tiles, tower.solvedCube.tiles);
  assert.deepEqual(end.cell, tower.solvedStart);
  assert.deepEqual(end.exit, tower.solvedExit);
});

test('同 seed 同一座塔逐字段一致，重开才能开出一样的图', () => {
  const recipe = { ...towerRecipe(5), seed: 31337 };
  assert.deepEqual(buildTower(recipe), buildTower(recipe));
  assert.notDeepEqual(buildTower(recipe).cube, buildTower({ ...recipe, seed: 31338 }).cube);
});

test('体检拦得住被改坏的塔', () => {
  const { tower } = generateTower(0, 12345);
  assert.equal(validateTower(null).ok, false, '生成失败要能说清');
  assert.equal(validateTower({ ...tower, start: { ...tower.start, layer: 1 } }).ok, false);
  assert.equal(validateTower({ ...tower, exit: { ...tower.exit, layer: 0 } }).ok, false);
  assert.equal(validateTower({ ...tower, solution: [] }).ok, false, '空解法救不了打乱过的塔');
});
