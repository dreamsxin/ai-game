import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP, startGame, step } from '../src/game/simulation.js';
import { LEVELS, bossAt, levelAt } from '../src/game/levels.js';
import { WEAKNESS, WING_CODES, recommendedWing } from '../src/game/wings.js';
import { botInput } from './bot.js';

const LIMIT = 60 * 150;

/** 让机器人打一关，回报打完没打完、死了几次、Boss 那一仗打了多久。 */
function play(index, wing, { immortal = false, frames = LIMIT, refuseDrops = false } = {}) {
  let state = startGame(index, wing);
  let deaths = 0;
  let bossAtTime = null;
  for (let i = 0; i < frames; i += 1) {
    if (state.status !== 'playing' && state.status !== 'dying') break;
    state = step(state, botInput(state), STEP);
    // 比火力的时候要把走位失误排除掉，否则量到的是机器人的手感，不是机翼的效率。
    if (immortal) state = { ...state, ship: { ...state.ship, invuln: 1e9 }, lives: 9 };
    // 模拟一个不去捡机翼的玩家：只有这样才量得到「拿错机翼」本身的代价。
    if (refuseDrops && state.drops.length) state = { ...state, drops: [] };
    for (const effect of state.effects) {
      if (effect.type === 'die') deaths += 1;
      if (effect.type === 'bossIn') bossAtTime = state.elapsed;
    }
  }
  return {
    state,
    deaths,
    fight: bossAtTime === null ? null : state.elapsed - bossAtTime,
  };
}

for (const [index, level] of LEVELS.entries()) {
  test(`第 ${index + 1} 关 ${level.name}：带对机翼的人打得过去`, () => {
    const wing = recommendedWing(level.boss.weak);
    const { state, deaths } = play(index, wing);
    assert.equal(state.status, 'clear', `第 ${index + 1} 关卡住了（停在 ${state.status}）`);
    assert.ok(deaths < 3, `第 ${index + 1} 关死太多次了（${deaths} 次）`);
    assert.ok(state.elapsed < 90, `第 ${index + 1} 关拖了 ${state.elapsed.toFixed(1)} 秒，太长`);
  });
}

test('第 4n+2 关的跳关门真的能走：会用它的人省下 4 关', () => {
  for (const index of [1, 5, 9, 13]) {
    const level = levelAt(index);
    const { state } = play(index, recommendedWing(level.boss.weak));
    assert.equal(state.status, 'clear');
    assert.equal(state.skipped, true, `第 ${index + 1} 关的门没走通`);
    assert.ok(state.elapsed < bossAt(level), '跳关应该发生在 Boss 出场之前');
  }
});

test('Boss 战时长落在设计的区间里：既不是一触即死，也不是磨半天', () => {
  for (const [index, level] of LEVELS.entries()) {
    if (level.skip) continue; // 这几关机器人会去走跳关门，量不到 Boss 战。
    const wing = recommendedWing(level.boss.weak);
    const { fight } = play(index, wing, { immortal: true });
    assert.ok(fight !== null, `第 ${index + 1} 关没打到 Boss`);
    assert.ok(fight > 4, `第 ${index + 1} 关的 Boss 只撑了 ${fight.toFixed(1)} 秒，白配了弱点`);
    assert.ok(
      fight < level.boss.ttk * 1.6,
      `第 ${index + 1} 关的 Boss 打了 ${fight.toFixed(1)} 秒，目标是 ${level.boss.ttk} 秒`,
    );
  }
});

// 这是整套设计的地基：拿错机翼不是慢一点，是把一场仗拖成一场消耗。
// 每种有硬性解法的弱点各挑一关，用同一个机器人、同样的不死条件，只换机翼。
// 两边都不许捡场上的机翼，否则运载火箭会替玩家把答案送上来（那条路子由下一个测试守）。
for (const index of [2, 6, 7]) {
  const level = levelAt(index);
  test(`第 ${index + 1} 关：${level.boss.weak} 弱点用加农炮硬啃，时间要翻上去`, () => {
    const right = recommendedWing(level.boss.weak);
    assert.ok(!WEAKNESS[level.boss.weak].keys.includes('C'), '这一关的答案不该是加农炮');
    const good = play(index, right, { immortal: true, refuseDrops: true });
    assert.equal(good.state.status, 'clear');

    const bad = play(index, 'C', { immortal: true, refuseDrops: true });
    const ratio = bad.state.status === 'clear' ? bad.fight / good.fight : Infinity;
    assert.ok(
      ratio > 1.7,
      `拿错机翼只慢了 ${ratio.toFixed(2)} 倍（对的 ${good.fight.toFixed(1)}s，错的 ${bad.fight?.toFixed(1)}s），惩罚不够`,
    );
  });
}

test('开局带错了也不是死局：打掉运载火箭就能把答案捡回来', () => {
  for (const index of [2, 6, 7]) {
    const level = levelAt(index);
    const keys = WEAKNESS[level.boss.weak].keys;
    const { state } = play(index, 'C', { immortal: true });
    assert.equal(state.status, 'clear');
    assert.ok(
      keys.includes(state.ship.wing),
      `第 ${index + 1} 关带着 C 进去，打完手上还是 ${state.ship.wing}——中途换翼这条路没通`,
    );
  }
});

test('十种机翼都能开局带出去，没有一种会让第 1 关直接崩掉', () => {
  for (const code of WING_CODES) {
    const state = play(0, code, { frames: 60 * 40 }).state;
    assert.ok(
      ['playing', 'clear', 'over', 'dying'].includes(state.status),
      `带着 ${code} 开局把第 1 关跑成了 ${state.status}`,
    );
  }
});
