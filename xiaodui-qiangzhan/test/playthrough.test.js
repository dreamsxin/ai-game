import test from 'node:test';
import assert from 'node:assert/strict';
import { circleBlocked } from '../src/game/arena.js';
import { botIntent } from '../src/game/bots.js';
import { createRandom } from '../src/game/random.js';
import { MATCH_SECONDS, SCORE_LIMIT, TEAM_ALLY, TEAM_ENEMY } from '../src/game/rules.js';
import { STEP, playerUnit, startGame, step } from '../src/game/simulation.js';

const IDLE = { move: { x: 0, y: 0 }, aimAngle: null, aimPoint: null, fire: false, focus: false, reload: false };

// 用机器人的意图当玩家输入：意图和输入同构，所以可以让机器人代打一整局。
// 玩家单位自己不带机器人记忆，代打的那份脑子放在这里维护。
const createAutopilot = (seed) => {
  const rng = createRandom(seed ^ 0x5f3759df);
  let brain = null;
  return (state) => {
    const player = playerUnit(state);
    if (!player.alive) return IDLE;
    const enemies = state.units.filter((unit) => unit.team !== player.team);
    const intent = botIntent(state.arena, { ...player, brain: brain ?? player.brain }, enemies, rng, STEP);
    brain = intent.brain;
    return { ...IDLE, move: intent.move, aimAngle: intent.aimAngle, fire: intent.fire, reload: intent.reload };
  };
};

const playMatch = (seed) => {
  const autopilot = createAutopilot(seed);
  let state = startGame(seed);
  const limit = Math.ceil(MATCH_SECONDS / STEP) + 120;
  let frames = 0;
  while (state.status === 'playing' && frames < limit) {
    state = step(state, autopilot(state), STEP);
    frames += 1;
    for (const unit of state.units) {
      assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.y), '坐标不该出现 NaN');
      assert.ok(unit.x > 0 && unit.x < state.arena.cols, `跑出场外：${unit.x}`);
      assert.ok(unit.y > 0 && unit.y < state.arena.rows, `跑出场外：${unit.y}`);
      if (unit.alive) assert.equal(circleBlocked(state.arena, unit.x, unit.y), false, `${unit.name} 卡进墙里`);
      assert.ok(unit.health >= 0 && unit.health <= 100);
      assert.ok(unit.ammo >= 0);
    }
  }
  return { state, frames };
};

for (const seed of [1, 20260911]) {
  test(`seed ${seed}：整局能打完，双方都能拿分`, () => {
    const { state, frames } = playMatch(seed);
    assert.ok(['won', 'over'].includes(state.status), `对局没有收场：${state.status}`);
    assert.ok(frames < Math.ceil(MATCH_SECONDS / STEP) + 120, '不该跑到强制上限');
    const ally = state.score[TEAM_ALLY];
    const enemy = state.score[TEAM_ENEMY];
    assert.ok(ally + enemy > 0, '一局下来没人被淘汰，说明枪打不中人');
    assert.ok(Math.max(ally, enemy) === SCORE_LIMIT || state.timeLeft === 0, '结束条件必须是分数线或时间到');
    assert.ok(state.stats.shots > 0, '玩家一枪没开');
    assert.ok(state.bullets.length < 200, '子弹没有泄漏');
    assert.ok(state.killfeed.length <= 4, '击杀播报有长度上限');
  });
}

test('自动对局的双方实力接近，不会一边倒', () => {
  const { state } = playMatch(7);
  const ally = state.score[TEAM_ALLY];
  const enemy = state.score[TEAM_ENEMY];
  assert.ok(Math.min(ally, enemy) > 0, `一边挂零说明 AI 或数值失衡：${ally} : ${enemy}`);
});
