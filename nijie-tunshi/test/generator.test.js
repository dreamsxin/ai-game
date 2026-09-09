import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, createRng } from '../src/game/random.js';
import { DEFAULT_RECIPE, generateLevel, HANDMADE_SLOT, LAYOUT_NAMES, levelMetrics, nextMapSlot, SHUFFLE_STRIDE } from '../src/game/generator.js';
import { validateLevel } from '../src/game/validator.js';
import { createNavGrid, findPath, reachableFrom, targetReachable } from '../src/game/navigation.js';
import { createReplayAgent, deriveRoute } from '../src/game/replayAgent.js';
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
// 低质量下窄门是关着的，压住谁谁就早期够不到。
test('gates never sit on an anchor, the core or the exit', () => {
  for (let seed = 4000; seed < 4016; seed += 1) {
    const { level } = generateLevel({ seed });
    const core = level.objects.find((object) => object.id === 'core');
    const protectedPoints = [...level.anchors, core, level.exit];
    for (const gate of level.gates) {
      // 生成关卡的窄门只设下限：出生质量下关着，长大后开且永不再关
      assert.equal(canPassGate(0, gate), false, `${gate.id} 在出生质量下不应是开着的`);
      assert.equal(canPassGate(STELLAR_IGNITION_MASS, gate), true, `${gate.id} 在点火质量下必须已经打开`);
      assert.equal(gate.maxMass, undefined, `${gate.id} 不应有上限，否则长大后会把走廊封死`);
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

// 这条是实测逼出来的：带 maxMass 的窄门几乎必然压在主干走廊上（40 个种子的
// 73 道窄门，73 道都压在走廊上），一关就把那段走廊上的对象永久封死 ——
// 40 个种子全都有 2 到 8 个对象在点火质量下不可达，而验证器只查必经目标，
// 完全没报警。
test('no object is ever sealed off as the player grows', () => {
  for (let seed = 8000; seed < 8016; seed += 1) {
    const { level } = generateLevel({ seed });
    assert.ok(level, `seed ${seed} 未能生成关卡`);
    let previous = -1;
    for (const mass of [0, 20, 45, 90, STELLAR_IGNITION_MASS]) {
      const grid = createNavGrid(0.9, mass, level);
      const visited = reachableFrom(grid, level.start);
      const reachable = level.objects.filter((object) => targetReachable(grid, visited, object));
      // 可达范围只能随质量增长，绝不能缩小
      assert.ok(
        reachable.length >= previous,
        `seed ${seed} 在质量 ${mass} 时可达对象从 ${previous} 掉到 ${reachable.length}`,
      );
      previous = reachable.length;
      if (mass >= STELLAR_IGNITION_MASS) {
        assert.equal(
          reachable.length, level.objects.length,
          `seed ${seed} 点火质量下仍有 ${level.objects.length - reachable.length} 个对象够不到`,
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

// 窄门必须真的构成一道门，而不是一只可以绕开的盒子。上一版把窄门放在
// 走廊弦的中点，实测走廊型 12 张图的 116 条候选弦里，中点离走廊最远只有
// 1.0 单位 —— 压在走廊上的门一关就切断主干，不压在走廊上的门玩家绕开
// 就是了。现在窄门填在两道墙之间的门洞上。
test('a gate is a real door: closing it forces a detour but never cuts the map', () => {
  const pathLength = (path) => {
    if (!path) return Infinity;
    let total = 0;
    for (let index = 0; index < path.length - 1; index += 1) {
      total += Math.hypot(path[index + 1].x - path[index].x, path[index + 1].z - path[index].z);
    }
    return total;
  };
  let checked = 0;
  for (const layout of ['corridor', 'spiral']) {
    for (let seed = 8800; seed < 8808; seed += 1) {
      const { level } = generateLevel({ seed, layout });
      assert.ok(level, `${layout} seed ${seed} 未能生成关卡`);
      for (const gate of level.gates) {
        // 门必须夹在两道墙之间：门洞两侧各要有一道紧贴的墙
        const flanking = level.obstacles.filter((wall) => (
          Math.hypot(wall.x - gate.x, wall.z - gate.z)
          < Math.hypot(gate.width, gate.depth) / 2 + Math.hypot(wall.width, wall.depth) / 2 + 1.5
        ));
        assert.ok(flanking.length >= 2, `${layout} seed ${seed} 的 ${gate.id} 只贴着 ${flanking.length} 道墙`);

        // 屏障沿 gate.axis 延伸，因此穿门方向是另一条轴
        const offset = (gate.axis === 'x' ? gate.depth : gate.width) / 2 + 2.2;
        const near = gate.axis === 'x' ? { x: gate.x, z: gate.z - offset } : { x: gate.x - offset, z: gate.z };
        const far = gate.axis === 'x' ? { x: gate.x, z: gate.z + offset } : { x: gate.x + offset, z: gate.z };
        const open = pathLength(findPath(createNavGrid(0.9, gate.minMass + 2, level), near, far));
        const closed = pathLength(findPath(createNavGrid(0.9, Math.max(0, gate.minMass - 2), level), near, far));
        assert.ok(Number.isFinite(open), `${gate.id} 开着时两侧应直接连通`);
        assert.ok(closed > open * 1.5, `${gate.id} 关着时应被迫绕路，实际 ${closed.toFixed(1)} vs ${open.toFixed(1)}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 8, `样本太少，只检查到 ${checked} 道窄门`);
});

test('every layout template produces a playable level with its own shape', () => {
  const pathLength = (corridor) => {
    let total = 0;
    for (let index = 0; index < corridor.length - 1; index += 1) {
      total += Math.hypot(corridor[index + 1].x - corridor[index].x, corridor[index + 1].z - corridor[index].z);
    }
    return total;
  };
  const detour = {};
  assert.deepEqual(LAYOUT_NAMES, ['corridor', 'switchback', 'spiral']);
  for (const layout of LAYOUT_NAMES) {
    let sum = 0;
    for (let seed = 8600; seed < 8606; seed += 1) {
      const { level } = generateLevel({ seed, layout });
      assert.ok(level, `${layout} 在 seed ${seed} 上没生成出关卡`);
      assert.equal(level.layout, layout, '关卡应记下自己用的是哪个模板');
      assert.equal(levelMetrics(level).layout, layout);
      assert.equal(validateLevel(level).ok, true, `${layout} seed ${seed} 未通过验证`);
      const straight = Math.hypot(level.exit.x - level.start.x, level.exit.z - level.start.z);
      sum += pathLength(level.corridor) / straight;
    }
    detour[layout] = sum / 6;
  }
  // 折返型绕行最远，走廊型最短：这是三种模板在结构上真的不同的凭据
  assert.ok(detour.corridor < 1.6, `走廊型绕行倍数应接近直线，实际 ${detour.corridor.toFixed(2)}`);
  assert.ok(detour.spiral > detour.corridor + 0.5, `螺旋型应明显绕，实际 ${detour.spiral.toFixed(2)}`);
  assert.ok(detour.switchback > detour.spiral, `折返型应绕得比螺旋型更远，实际 ${detour.switchback.toFixed(2)}`);
});

test('layout choice follows the seed so shuffling changes the skeleton', () => {
  const seen = new Set();
  for (let seed = 8700; seed < 8730; seed += 1) {
    const { level } = generateLevel({ seed });
    assert.ok(LAYOUT_NAMES.includes(level.layout), `未知模板 ${level.layout}`);
    seen.add(level.layout);
  }
  assert.equal(seen.size, LAYOUT_NAMES.length, `30 个种子应覆盖全部模板，实际只出现 ${[...seen].join(',')}`);
  // 同 seed 仍要给同一个模板
  assert.equal(generateLevel({ seed: 8700 }).level.layout, generateLevel({ seed: 8700 }).level.layout);
});

test('the derived route eats light to heavy, then anchors, core and exit', () => {
  const { level } = generateLevel({ seed: 8200 });
  const route = deriveRoute(level);
  const eating = route.filter((node) => node.kind === 'object' && node.id !== 'core');
  assert.equal(eating.length, level.objects.length - 1, '除核心外每个对象都该在路线上');
  const masses = eating.map((node) => level.objects.find((object) => object.id === node.id).mass);
  for (let index = 1; index < masses.length; index += 1) {
    assert.ok(masses[index] >= masses[index - 1], `第 ${index} 个目标比前一个轻，路线不是升序`);
  }
  assert.deepEqual(
    route.slice(-5).map((node) => node.kind),
    ['anchor', 'anchor', 'anchor', 'object', 'exit'],
    '三枚锚点、核心、出口应压在路线末尾',
  );
  assert.deepEqual(JSON.stringify(deriveRoute(level)), JSON.stringify(route), '同一关卡派生的路线必须一致');
});

// 验证器说"存在合法吞噬顺序"，模拟层能不能真跑通是另一回事。这条用例
// 让自动演示在生成关卡上真打一局，是唯一的端到端证明。
test('the auto demo actually finishes generated levels', () => {
  for (const seed of [8300, 8400, 8500]) {
    const { level } = generateLevel({ seed });
    let state = createGame(level.seed, {}, level);
    const agent = createReplayAgent();
    agent.start();
    for (let tick = 0; tick < 60000 && state.status === 'playing'; tick += 1) {
      state = step(state, agent.snapshot(state), 1 / 60);
    }
    assert.equal(state.status, 'ascending', `seed ${seed} 没能点火，卡在质量 ${state.player.mass.toFixed(1)}`);
    assert.equal(state.player.ignited, true);
    assert.equal(agent.stats().failedPlans, 0, `seed ${seed} 出现寻路失败`);
  }
});


