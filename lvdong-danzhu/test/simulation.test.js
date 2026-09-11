import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_RADIUS, COLUMNS, GRID_ROWS, LIVES, PADDLE_Y, beatPeriod } from '../src/game/rules.js';
import { marble } from '../src/game/marbles.js';
import { countMarbles } from '../src/game/grid.js';
import {
  EMPTY_INPUT,
  STEP,
  chooseColor,
  createGame,
  cycleColor,
  launch,
  marblesLeft,
  nextLevel,
  startGame,
  step,
  togglePause,
} from '../src/game/simulation.js';

const TAP = { paddleX: null, move: 0, tap: true };

const blank = () => Array.from({ length: GRID_ROWS }, () => Array.from({ length: COLUMNS }, () => null));

// 造一个可控局面：墙自己摆，球停在指定位置往上打。
const rigged = (grid, { color = 'rose', y = 1.35, vy = -9, wavesLeft = 1 } = {}) => {
  const base = startGame(1, 0);
  return {
    ...base,
    grid,
    wavesLeft,
    phase: 'play',
    paddleColor: color,
    beatsLeft: 999,
    ball: { x: 4.5, y, vx: 0, vy, color },
  };
};

test('开局停在待发球状态，球贴着挡板', () => {
  const game = createGame(42);
  assert.equal(game.status, 'ready');
  assert.equal(game.phase, 'serve');
  assert.equal(game.lives, LIVES);
  assert.equal(game.ball.x, game.paddle.x);
  assert.ok(Math.abs(game.ball.y - (PADDLE_Y - BALL_RADIUS - 0.02)) < 1e-9);
  assert.equal(game.ball.vx, 0);
  assert.equal(game.ball.vy, 0);
  assert.equal(marblesLeft(game), game.level.startRows * COLUMNS);
});

test('非 playing 状态不推进', () => {
  const game = createGame(42);
  assert.equal(step(game, TAP, STEP), game, 'ready 时交给 UI 决定何时开始');
  const paused = togglePause(startGame(42));
  assert.equal(step(paused, TAP, STEP), paused);
});

test('点一下发球，速度取关卡设定', () => {
  const game = startGame(7);
  const flying = step(game, TAP, STEP);
  assert.equal(flying.phase, 'play');
  assert.ok(flying.ball.vy < 0);
  assert.ok(Math.abs(Math.hypot(flying.ball.vx, flying.ball.vy) - game.level.speed) < 1e-9);
  assert.equal(launch(flying), flying, '已经在飞的球不会重复发射');
});

test('待发球时球跟着挡板走', () => {
  const game = startGame(7);
  const moved = step(game, { paddleX: 2.5, move: 0, tap: false }, STEP);
  assert.equal(moved.paddle.x, 2.5);
  assert.equal(moved.ball.x, 2.5);
  assert.equal(moved.phase, 'serve');
});

test('飞行中点一下换上膛颜色，不影响正在飞的球', () => {
  const state = rigged(blank(), { y: 8, vy: -9 });
  const next = step(state, TAP, STEP);
  assert.equal(next.paddleColor, state.colors[1]);
  assert.equal(next.ball.color, 'rose', '换色只对下一次接球生效');
  assert.equal(cycleColor(next).colorIndex, 2 % state.colors.length);
  assert.equal(chooseColor(state, -1).colorIndex, state.colors.length - 1, '负数索引绕回末尾');
});

test('同色三连整组消掉，球穿过去，断了支撑的弹珠跟着掉', () => {
  const grid = blank();
  for (const col of [3, 4, 5]) grid[0][col] = marble('rose');
  grid[1][3] = marble('mint');
  const next = step(rigged(grid), EMPTY_INPUT, STEP);
  assert.equal(countMarbles(next.grid), 0, '三颗同色加一颗悬空全清');
  assert.equal(next.chain, 1);
  assert.equal(next.dropped, 1);
  assert.equal(next.cleared, 4);
  assert.ok(next.score > 0);
  assert.equal(next.lastClear.count, 3);
  assert.equal(next.lastClear.dropped, 1);
  assert.ok(next.ball.vy < 0, '整组消掉后球继续往上钻');
});

test('同色但凑不满三颗只崩一颗，球照常反弹', () => {
  const grid = blank();
  grid[0][4] = marble('rose');
  grid[0][3] = marble('rose');
  const next = step(rigged(grid), EMPTY_INPUT, STEP);
  assert.equal(countMarbles(next.grid), 1);
  assert.equal(next.chain, 0, '不成组不算连消');
  assert.ok(next.ball.vy > 0, '被弹回来了');
});

test('异色要砸两下：先裂后碎', () => {
  const grid = blank();
  grid[0][4] = marble('azure');
  const first = step(rigged(grid), EMPTY_INPUT, STEP);
  assert.equal(first.grid[0][4].damage, 1);
  assert.equal(first.cracked, 1);
  assert.ok(first.score > 0, '砸裂也给一点分');

  const second = step({ ...first, ball: { ...first.ball, y: 1.35, vy: -9 } }, EMPTY_INPUT, STEP);
  assert.equal(second.grid[0][4], null, '第二下砸碎');
  assert.equal(second.cleared, 1);
});

test('踩着拍子接球攒律动，踩空归零', () => {
  const base = startGame(3);
  const onBeatState = {
    ...base,
    phase: 'play',
    beatTimer: 0,
    beatsLeft: 999,
    ball: { x: 4.5, y: PADDLE_Y - BALL_RADIUS - 0.02, vx: 0, vy: 8, color: base.paddleColor },
  };
  const struck = step(onBeatState, EMPTY_INPUT, STEP);
  assert.equal(struck.combo, 1);
  assert.equal(struck.bestCombo, 1);

  const period = beatPeriod(base.level.bpm);
  const offBeat = { ...onBeatState, combo: 5, bestCombo: 5, beatTimer: period / 2 };
  const missed = step(offBeat, EMPTY_INPUT, STEP);
  assert.equal(missed.combo, 0, '踩在两拍正中间就断了');
  assert.equal(missed.bestCombo, 5, '历史最高保留');
});

test('每 descendBeats 拍挤进一行，波次用完就不再下压', () => {
  const base = { ...startGame(11), phase: 'play', ball: { x: 4.5, y: 8, vx: 0, vy: -0.001, color: 'rose' } };
  const period = beatPeriod(base.level.bpm);
  let state = { ...base, beatsLeft: 1, wavesLeft: 2 };
  const before = marblesLeft(state);
  state = step(state, EMPTY_INPUT, period);
  assert.equal(marblesLeft(state), before + COLUMNS, '整行挤进来');
  assert.equal(state.wavesLeft, 1);
  assert.equal(state.beatsLeft, base.level.descendBeats, '下压计时重置');

  let drained = { ...state, beatsLeft: 1, wavesLeft: 0 };
  const stable = marblesLeft(drained);
  drained = step(drained, EMPTY_INPUT, period);
  assert.equal(marblesLeft(drained), stable, '最后一波之后只剩清场');
});

test('弹珠墙压过底线就输', () => {
  const grid = blank();
  grid[GRID_ROWS - 1][2] = marble('rose');
  const state = { ...rigged(grid, { y: 8, vy: -0.001 }), beatsLeft: 1, wavesLeft: 3 };
  const next = step(state, EMPTY_INPUT, beatPeriod(state.level.bpm));
  assert.equal(next.status, 'over');
  assert.equal(next.stars, 0);
  assert.ok(next.effects.some((e) => e.type === 'over' && e.reason === 'overflow'));
});

test('漏球扣命回到待发球，命用完才算输', () => {
  const grid = blank();
  const falling = { ...rigged(grid, { y: 15.8, vy: 12 }), lives: 2 };
  const dropped = step(falling, EMPTY_INPUT, 0.2);
  assert.equal(dropped.lives, 1);
  assert.equal(dropped.phase, 'serve');
  assert.equal(dropped.status, 'playing');

  const last = step({ ...falling, lives: 1 }, EMPTY_INPUT, 0.2);
  assert.equal(last.status, 'over');
  assert.ok(last.effects.some((e) => e.type === 'over' && e.reason === 'lives'));
});

test('最后一波清空后过关并结算星级', () => {
  const grid = blank();
  for (const col of [3, 4, 5]) grid[0][col] = marble('rose');
  const state = { ...rigged(grid, { wavesLeft: 0 }), score: 4000 };
  const next = step(state, EMPTY_INPUT, STEP);
  assert.equal(next.status, 'won');
  assert.ok(next.stars >= 1);
  assert.ok(next.effects.some((e) => e.type === 'won'));
});

test('还有波次没下来时清空也不算过关', () => {
  const grid = blank();
  for (const col of [3, 4, 5]) grid[0][col] = marble('rose');
  const next = step(rigged(grid, { wavesLeft: 2 }), EMPTY_INPUT, STEP);
  assert.equal(next.status, 'playing');
});

test('同 seed 同输入逐字段一致，换关会换墙', () => {
  const inputs = Array.from({ length: 400 }, (_, i) => ({
    paddleX: 2 + Math.sin(i / 9) * 2.5,
    move: 0,
    tap: i % 97 === 0,
  }));
  const run = () => {
    let state = startGame(2024, 2);
    for (const input of inputs) state = step(state, input, STEP);
    return state;
  };
  assert.deepEqual(run(), run());
  const first = startGame(5, 0);
  assert.notEqual(nextLevel(first).level.id, first.level.id);
});
