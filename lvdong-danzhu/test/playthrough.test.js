import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, PADDLE_WIDTH } from '../src/game/rules.js';
import { colorCounts, lowestRow } from '../src/game/grid.js';
import { LEVELS } from '../src/game/levels.js';
import { STEP, chooseColor, marblesLeft, startGame, step } from '../src/game/simulation.js';

// 挡板落点在中心两侧轮换，逼出不同反弹角度，别让球一直在一列里上下。
const OFFSETS = [-0.9, 0.45, -0.45, 0.9, 0];

// 机器人只看底部三行：球是从下面撞上去的，那几行的主色最可能凑成同色组。
function bestColor(state) {
  const bottom = lowestRow(state.grid);
  if (bottom < 0) return state.colorIndex;
  const window = state.grid.map((row, index) => (index > bottom - 3 && index <= bottom ? row : []));
  const counts = colorCounts(window);
  let pick = state.colors[0];
  let most = -1;
  for (const color of state.colors) {
    const count = counts.get(color) ?? 0;
    if (count > most) {
      most = count;
      pick = color;
    }
  }
  return state.colors.indexOf(pick);
}

// 跟球机器人：挡板贴着球走，接球前换好颜色，点一下发球。
// 落点偏移按「第几次接球」轮换而不是按帧轮换，否则会和飞行周期共振，球一直沿同一条线来回。
function play(levelIndex, seed, seconds = 300) {
  let state = startGame(seed, levelIndex);
  const frames = Math.floor(seconds / STEP);
  let paddleHits = 0;
  for (let i = 0; i < frames; i += 1) {
    if (state.status !== 'playing') break;
    // 球在下落段时重新挑颜色，接球那一刻上膛的就是它。
    if (state.phase === 'serve' || state.ball.vy > 0) {
      const wanted = bestColor(state);
      if (wanted !== state.colorIndex) state = chooseColor(state, wanted);
    }
    const offset = OFFSETS[paddleHits % OFFSETS.length];
    const target = Math.min(COLUMNS - PADDLE_WIDTH / 2, Math.max(PADDLE_WIDTH / 2, state.ball.x + offset));
    state = step(state, { paddleX: target, move: 0, tap: state.phase === 'serve' }, STEP);
    if (state.effects.some((effect) => effect.type === 'paddle')) paddleHits += 1;
  }
  return state;
}

// 关卡数据一旦调成机器人都清不完的死关，这条测试就会失败。
for (const [index, level] of LEVELS.entries()) {
  test(`第 ${level.id} 关《${level.name}》能被跟球机器人清场`, () => {
    for (const seed of [1000 + level.id * 31, 7 * level.id + 3, 90210 + level.id]) {
      const state = play(index, seed);
      assert.equal(
        state.status,
        'won',
        `seed ${seed} 结束时状态 ${state.status}，剩 ${marblesLeft(state)} 颗、得分 ${state.score}`,
      );
      assert.equal(marblesLeft(state), 0, '过关时墙必须清空');
      assert.equal(state.wavesLeft, 0, '所有波次都要下完');
      assert.ok(state.stars >= 1, `seed ${seed} 得分 ${state.score} 没够第一档 ${level.stars[0]}`);
      assert.ok(state.lives > 0, '跟球机器人不该丢球');
    }
  });
}

test('挡板不接球时会漏光三条命并正常结束', () => {
  let state = startGame(555, 0);
  for (let i = 0; i < Math.floor(120 / STEP) && state.status === 'playing'; i += 1) {
    // 挡板钉在最左边，发球后不去接，迟早三条命全掉光。
    state = step(state, { paddleX: PADDLE_WIDTH / 2, move: 0, tap: state.phase === 'serve' }, STEP);
  }
  assert.equal(state.status, 'over');
  assert.equal(state.lives, 0);
});
