import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, createRng } from '../src/game/random.js';
import { DEFAULT_RECIPE, generateLevel, levelMetrics } from '../src/game/generator.js';
import { validateLevel } from '../src/game/validator.js';
import { canPassGate, STELLAR_FUEL_TARGET, STELLAR_IGNITION_MASS } from '../src/game/rules.js';

test('the same seed always yields the same random sequence', () => {
  const left = createRandom(42);
  const right = createRandom(42);
  const other = createRandom(43);
  const a = Array.from({ length: 12 }, left);
  const b = Array.from({ length: 12 }, right);
  const c = Array.from({ length: 12 }, other);
  assert.deepEqual(a, b, '同 seed 必须给出同一序列');
  assert.notDeepEqual(a, c, '不同 seed 应给出不同序列');
  for (const value of a) assert.ok(value >= 0 && value < 1, `取值越界: ${value}`);
});

test('helper draws stay in range and shuffle is a permutation', () => {
  const rng = createRng(7);
  for (let index = 0; index < 200; index += 1) {
    const float = rng.float(-3, 5);
    assert.ok(float >= -3 && float <= 5);
    const int = rng.int(2, 6);
    assert.ok(int >= 2 && int <= 6 && Number.isInteger(int));
  }
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = createRng(9).shuffle(source);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), source, '打乱后应是同一多重集');
  assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7, 8], '不应改动原数组');
  assert.equal(createRandom(0)(), createRandom(0)(), 'seed 为 0 也要稳定');
});

test('generated levels are byte identical for the same seed', () => {
  const left = generateLevel({ seed: 777 });
  const right = generateLevel({ seed: 777 });
  assert.ok(left.level, '默认配方应能生成关卡');
  assert.equal(JSON.stringify(left.level), JSON.stringify(right.level));
  assert.equal(left.attempts, right.attempts);
});

test('a batch of seeds all pass validation with real variety', () => {
  const masses = new Set();
  let generated = 0;
  for (let seed = 2000; seed < 2024; seed += 1) {
    const { level } = generateLevel({ seed });
    assert.ok(level, `seed ${seed} 未能生成通过验证的关卡`);
    generated += 1;
    // 生成器内部已跑过验证，这里再独立跑一次，确认返回的就是通过的那张
    assert.equal(validateLevel(level).ok, true, `seed ${seed} 复验失败`);
    masses.add(levelMetrics(level).totalMass);
  }
  assert.equal(generated, 24);
  assert.ok(masses.size > 12, `成长阶梯应随 seed 变化，实际只有 ${masses.size} 种总质量`);
});

test('every generated level leaves headroom on mass and fuel', () => {
  for (let seed = 3000; seed < 3012; seed += 1) {
    const { level } = generateLevel({ seed });
    const metrics = levelMetrics(level);
    assert.ok(metrics.totalMass > STELLAR_IGNITION_MASS, `seed ${seed} 总质量不足点火`);
    assert.ok(metrics.totalFuel > STELLAR_FUEL_TARGET, `seed ${seed} 总燃料不足`);
    assert.ok(metrics.fuelSources >= 5, `seed ${seed} 燃料来源过少: ${metrics.fuelSources}`);
    assert.ok(
      metrics.fuelSpareAfterMiss >= 0,
      `seed ${seed} 漏掉最大燃料来源后就点不了火，余量 ${metrics.fuelSpareAfterMiss}`,
    );
  }
});

// 早期实测里 12/30 个种子失败，唯一原因就是窄门压在锚点上：
// 点火质量下所有窄门都是关着的，压住谁谁就永久不可达。
test('gates never sit on an anchor, the core or the exit', () => {
  for (let seed = 4000; seed < 4016; seed += 1) {
    const { level } = generateLevel({ seed });
    const core = level.objects.find((object) => object.id === 'core');
    const protectedPoints = [...level.anchors, core, level.exit];
    for (const gate of level.gates) {
      // 点火质量下窄门必然关闭，因此它的占位等同于实墙
      assert.equal(canPassGate(STELLAR_IGNITION_MASS, gate), false, `${gate.id} 在点火质量下不应还开着`);
      for (const point of protectedPoints) {
        const clearance = Math.hypot(gate.width, gate.depth) / 2;
        assert.ok(
          Math.hypot(point.x - gate.x, point.z - gate.z) > clearance,
          `seed ${seed} 的 ${gate.id} 压住了 (${point.x}, ${point.z})`,
        );
      }
    }
  }
});

test('objects ascend in mass along the corridor so the growth chain holds', () => {
  const { level } = generateLevel({ seed: 5150 });
  const ordered = level.objects.filter((object) => object.id.startsWith('obj-'));
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(
      ordered[index].mass >= ordered[index - 1].mass,
      `第 ${index} 个对象比前一个更轻，成长阶梯被打断`,
    );
  }
  assert.ok(level.objects.some((object) => object.id === 'core'), '必须有糖心熔炉');
  assert.equal(DEFAULT_RECIPE.objectCount, 20);
});
