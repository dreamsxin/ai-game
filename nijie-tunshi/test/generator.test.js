import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, createRng } from '../src/game/random.js';
import { DEFAULT_RECIPE, generateLevel, HANDMADE_SLOT, levelMetrics, nextMapSlot, SHUFFLE_STRIDE } from '../src/game/generator.js';
import { validateLevel } from '../src/game/validator.js';
import { createGame, step } from '../src/game/simulation.js';
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

test('a generated level can actually be played, not just validated', () => {
  const { level } = generateLevel({ seed: 6100 });
  let state = createGame(6100, {}, level);
  assert.equal(state.level, level, '关卡应随局保存，模拟层不再读模块级 LEVEL');
  assert.equal(state.player.x, level.start.x);
  assert.ok(state.maxObjectReach > 0, '触及上界应按本局关卡算出');

  // 直接把玩家放到最轻的对象上：追着吃会被逃离行为干扰，这里只验证吞噬链路通
  const lightest = state.objects.reduce((best, object) => (object.mass < best.mass ? object : best));
  state.player.x = lightest.x;
  state.player.z = lightest.z;
  state = step(state, {}, 1 / 60);
  assert.equal(state.collected, 1, '生成关卡上的对象必须能被吞噬');
  assert.ok(state.player.mass > 0);

  // 边界钳制要用生成关卡自己的 bounds，而不是首关的
  state.player.x = level.bounds.maxX + 50;
  state = step(state, { x: 1, z: 0 }, 1 / 60);
  assert.ok(state.player.x <= level.bounds.maxX, `玩家应被钳制在本局边界内，实际 ${state.player.x}`);
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

// UI 的"换一张图"没有自动化覆盖，但换图的判定本身是纯函数，必须能单独验证。
test('shuffling maps walks the seed forward and keeps every slot playable', () => {
  assert.equal(HANDMADE_SLOT.generated, false, '初始槽位应是手工关');
  let slot = HANDMADE_SLOT;
  const seeds = new Set();
  const layouts = new Set();
  for (let round = 0; round < 6; round += 1) {
    const before = slot;
    slot = nextMapSlot(slot);
    assert.ok(!slot.error, `第 ${round} 次换图失败: ${slot.error}`);
    assert.equal(slot.generated, true);
    // 生成器可能重试若干次，所以落点是 stride 之后而不是正好等于
    assert.ok(slot.seed >= before.seed + SHUFFLE_STRIDE, `种子必须往前走，${before.seed} -> ${slot.seed}`);
    assert.equal(validateLevel(slot.level).ok, true, `种子 ${slot.seed} 的关卡没通过验证`);
    seeds.add(slot.seed);
    layouts.add(JSON.stringify(slot.level.corridor));
    // 换到的图必须真能建局并吞噬，否则 UI 换过去就是一张死图
    const state = createGame(slot.seed, {}, slot.level);
    assert.equal(state.level, slot.level);
    assert.equal(state.objects.length, slot.level.objects.length);
  }
  assert.equal(seeds.size, 6, '每次换图都应是新种子');
  assert.equal(layouts.size, 6, `走廊布局应各不相同，实际只有 ${layouts.size} 种`);
});

test('the handmade slot is always reachable again and shuffling is reproducible', () => {
  const first = nextMapSlot(HANDMADE_SLOT);
  const again = nextMapSlot(HANDMADE_SLOT);
  assert.equal(first.seed, again.seed, '同一槽位换图必须可复现');
  assert.equal(JSON.stringify(first.level), JSON.stringify(again.level));
  assert.notEqual(first.level, HANDMADE_SLOT.level);
  // 回手工关就是回到那张手工表，不是重新生成一张
  assert.equal(HANDMADE_SLOT.level.objects.some((object) => object.id === 'orb-1'), true);
});

