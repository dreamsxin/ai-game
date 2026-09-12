import {
  BALL_RADIUS,
  BALL_SPEED,
  COLUMNS,
  FIRE_INTERVAL,
  LAUNCH_Y,
  START_ROWS,
  STARTING_BALLS,
  TURN_LIMIT,
  breakScore,
  hitScore,
  pickupScore,
  stageOf,
} from './rules.js';
import { DEFAULT_AIM, aimAt, nudgeAim } from './aim.js';
import { at, createGrid, descend, hitCell, spawnRow } from './grid.js';
import { advanceBalls } from './physics.js';

export const STEP = 1 / 60;

export const EMPTY_INPUT = { aimAt: null, nudge: 0, fire: false };

// 键盘微调的角速度，弧度每秒。
export const AIM_RATE = 1.3;

export function createGame(seed = 1) {
  const { grid, randomState } = createGrid(seed, START_ROWS);
  return {
    seed,
    status: 'ready',
    phase: 'aim',
    grid,
    randomState,
    turn: 1,
    stage: 1,
    launcher: { x: COLUMNS / 2 },
    aim: { ...DEFAULT_AIM },
    balls: [],
    queued: 0,
    fireTimer: 0,
    ballCount: STARTING_BALLS,
    nextLauncherX: null,
    turnElapsed: 0,
    turnDestroyed: 0,
    turnPickups: 0,
    score: 0,
    destroyed: 0,
    pickups: 0,
    bestCombo: 0,
    elapsed: 0,
    lastTurn: null,
    effects: [],
  };
}

export const startGame = (seed = 1) => ({ ...createGame(seed), status: 'playing' });

export const restart = (state) => startGame(state.seed + 1);

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

// 只在瞄准阶段能改方向：手指点哪指哪，键盘按住左右微调。
export function updateAim(state, input, dt) {
  if (state.phase !== 'aim') return state;
  let aim = state.aim;
  if (input.aimAt) aim = aimAt(state.launcher, input.aimAt);
  if (input.nudge) aim = nudgeAim(aim, input.nudge * AIM_RATE * dt);
  return aim === state.aim ? state : { ...state, aim };
}

// 开火：这一回合射出的弹珠数在按下的瞬间锁定，之后吃到的加珠算下一回合。
export function fire(state) {
  if (state.phase !== 'aim' || state.status !== 'playing') return state;
  return {
    ...state,
    phase: 'fire',
    queued: state.ballCount,
    fireTimer: 0,
    balls: [],
    nextLauncherX: null,
    turnElapsed: 0,
    turnDestroyed: 0,
    turnPickups: 0,
    effects: [...state.effects, { type: 'fire', balls: state.ballCount, aim: { ...state.aim } }],
  };
}

// 按间隔把排队的弹珠一颗颗放出去，形成一条弹珠流。
function releaseBalls(state, dt) {
  if (state.queued <= 0) return { ...state, fireTimer: Math.max(0, state.fireTimer - dt) };
  let { queued, fireTimer } = state;
  const balls = [...state.balls];
  const effects = [...state.effects];
  fireTimer -= dt;
  while (queued > 0 && fireTimer <= 0) {
    balls.push({
      x: state.launcher.x,
      y: LAUNCH_Y - BALL_RADIUS - 0.02,
      vx: state.aim.x * BALL_SPEED,
      vy: state.aim.y * BALL_SPEED,
    });
    queued -= 1;
    fireTimer += FIRE_INTERVAL;
    // 一颗颗出膛的「哒哒哒」是这类玩法的招牌节奏，得让反馈层听得见。
    effects.push({ type: 'launch', remaining: queued });
  }
  return { ...state, balls, queued, fireTimer, effects };
}

// 一帧的碰撞结算：砖块掉血、拆砖连爆、吃加珠都在这里累计。
function collide(state, dt) {
  let grid = state.grid;
  let score = state.score;
  let destroyed = state.destroyed;
  let pickups = state.pickups;
  let turnDestroyed = state.turnDestroyed;
  let turnPickups = state.turnPickups;
  let ballCount = state.ballCount;
  const effects = [...state.effects];

  const world = {
    occupied: (col, row) => Boolean(at(grid, col, row)),
    hit: (col, row) => {
      const result = hitCell(grid, col, row);
      grid = result.grid;
      if (result.pickup) {
        ballCount += 1;
        pickups += 1;
        turnPickups += 1;
        score += pickupScore(turnDestroyed);
        effects.push({ type: 'pickup', col, row, balls: ballCount });
        return { pass: true };
      }
      score += hitScore(turnDestroyed);
      if (!result.broken.length) {
        effects.push({ type: 'hit', col, row });
        return { pass: false };
      }
      // 炸弹连爆会一次带走一片，分数按拆掉的每一块单独算。
      for (const cell of result.broken) {
        if (cell.kind === 'plus') {
          ballCount += 1;
          pickups += 1;
          turnPickups += 1;
          score += pickupScore(turnDestroyed);
          continue;
        }
        score += breakScore(cell.kind, turnDestroyed);
        destroyed += 1;
        turnDestroyed += 1;
      }
      effects.push({ type: 'break', cells: result.broken, chain: result.broken.length });
      return { pass: false };
    },
  };

  const pull = state.turnElapsed > TURN_LIMIT;
  const flight = advanceBalls(state.balls, dt, world, { pull });
  // 第一颗落地的弹珠决定下回合的发射位置，这是这类玩法的招牌手感。
  const nextLauncherX = state.nextLauncherX ?? (flight.landed.length ? flight.landed[0].x : null);
  if (flight.landed.length) effects.push({ type: 'land', count: flight.landed.length });

  return {
    ...state,
    grid,
    balls: flight.balls,
    score,
    destroyed,
    pickups,
    turnDestroyed,
    turnPickups,
    ballCount,
    nextLauncherX,
    bestCombo: Math.max(state.bestCombo, turnDestroyed),
    effects,
  };
}

// 全部弹珠回收后收束这一回合：挪发射点、下压一行新砖、判断有没有压过底线。
function endTurn(state) {
  const launcher = { x: state.nextLauncherX ?? state.launcher.x };
  const turn = state.turn + 1;
  const spawned = spawnRow(state.randomState, turn);
  const pushed = descend(state.grid, spawned.row);
  const lastTurn = {
    turn: state.turn,
    destroyed: state.turnDestroyed,
    pickups: state.turnPickups,
    balls: state.ballCount,
  };
  const settled = {
    ...state,
    phase: 'aim',
    launcher,
    grid: pushed.grid,
    randomState: spawned.randomState,
    turn,
    stage: stageOf(turn),
    balls: [],
    queued: 0,
    fireTimer: 0,
    nextLauncherX: null,
    lastTurn,
    effects: [...state.effects, { type: 'descend', turn }],
  };
  if (pushed.overflow > 0) {
    return { ...settled, status: 'over', effects: [...settled.effects, { type: 'over', reason: 'overflow' }] };
  }
  return settled;
}

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing') return state;
  let next = { ...state, elapsed: state.elapsed + dt, effects: [], lastTurn: null };

  // 瞄准阶段收方向；按下开火后同一帧就放出第一颗，手感上没有空档。
  if (next.phase === 'aim') {
    next = updateAim(next, input, dt);
    if (!input.fire) return next;
    next = fire(next);
  }

  next = { ...next, turnElapsed: next.turnElapsed + dt };
  next = releaseBalls(next, dt);
  next = collide(next, dt);
  if (next.queued <= 0 && next.balls.length === 0) return endTurn(next);
  return next;
}

export const isAiming = (state) => state.phase === 'aim';

export const ballsInFlight = (state) => state.balls.length + state.queued;

export const bricksLeft = (state) =>
  state.grid.reduce((sum, row) => sum + row.filter((cell) => cell && cell.kind !== 'plus').length, 0);

