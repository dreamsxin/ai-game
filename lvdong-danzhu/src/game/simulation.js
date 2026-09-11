import {
  ARMOR,
  BALL_RADIUS,
  COLUMNS,
  LIVES,
  MATCH_MIN,
  PADDLE_KEY_SPEED,
  PADDLE_Y,
  beatPeriod,
  clearScore,
  crackScore,
  dropScore,
  onBeat,
  starsFor,
} from './rules.js';
import { hasNextLevel, levelAt, levelColors } from './levels.js';
import {
  at,
  clearCells,
  createGrid,
  damageCell,
  descend,
  floating,
  groupAt,
  isEmpty,
  spawnRow,
} from './grid.js';
import { advanceBall, clampPaddle } from './physics.js';

export const STEP = 1 / 60;

export const EMPTY_INPUT = { paddleX: null, move: 0, tap: false };

// 发球角度固定 0.35 弧度，朝场地宽的一侧打出去，保证同 seed 同输入完全可复现。
const LAUNCH_ANGLE = 0.35;

const servedBall = (paddle, color) => ({
  x: paddle.x,
  y: PADDLE_Y - BALL_RADIUS - 0.02,
  vx: 0,
  vy: 0,
  color,
});

export function createGame(seed = 1, levelIndex = 0) {
  const level = levelAt(levelIndex);
  const colors = levelColors(level);
  const { grid, randomState } = createGrid(seed + level.id * 7919, colors, level.startRows);
  const paddle = { x: COLUMNS / 2 };
  return {
    seed,
    levelIndex,
    level,
    colors,
    status: 'ready',
    phase: 'serve',
    grid,
    randomState,
    paddle,
    colorIndex: 0,
    paddleColor: colors[0],
    ball: servedBall(paddle, colors[0]),
    lives: LIVES,
    wavesLeft: level.waves,
    beat: 0,
    beatTimer: 0,
    beatsLeft: level.descendBeats,
    chain: 0,
    bestChain: 0,
    combo: 0,
    bestCombo: 0,
    score: 0,
    cleared: 0,
    dropped: 0,
    cracked: 0,
    stars: 0,
    elapsed: 0,
    lastClear: null,
    effects: [],
  };
}

export const startGame = (seed = 1, levelIndex = 0) => ({
  ...createGame(seed, levelIndex),
  status: 'playing',
});

export const retryLevel = (state) => startGame(state.seed + 1, state.levelIndex);

export const nextLevel = (state) =>
  startGame(state.seed + 1, hasNextLevel(state.levelIndex) ? state.levelIndex + 1 : state.levelIndex);

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

// 换上膛的颜色：只影响下一次挡板接球，所以要提前想好这一趟打什么色。
export function chooseColor(state, index) {
  const colorIndex = ((index % state.colors.length) + state.colors.length) % state.colors.length;
  const paddleColor = state.colors[colorIndex];
  const ball = state.phase === 'serve' ? { ...state.ball, color: paddleColor } : state.ball;
  return { ...state, colorIndex, paddleColor, ball };
}

export const cycleColor = (state) => chooseColor(state, state.colorIndex + 1);

export function launch(state) {
  if (state.phase !== 'serve') return state;
  const dir = state.paddle.x <= COLUMNS / 2 ? 1 : -1;
  const speed = state.level.speed;
  return {
    ...state,
    phase: 'play',
    ball: {
      ...servedBall(state.paddle, state.paddleColor),
      vx: Math.sin(LAUNCH_ANGLE * dir) * speed,
      vy: -Math.cos(LAUNCH_ANGLE) * speed,
    },
    effects: [...state.effects, { type: 'launch' }],
  };
}

// 挡板：触屏给绝对位置，键盘给方向，两者都夹在场地内。
function movePaddle(state, input, dt) {
  let x = state.paddle.x;
  if (typeof input.paddleX === 'number') x = input.paddleX;
  if (input.move) x += input.move * PADDLE_KEY_SPEED * dt;
  return { ...state, paddle: { x: clampPaddle(x) } };
}

// 节拍时钟：每 descendBeats 拍挤进一行新弹珠，最后一波之后只剩清场。
function tickBeat(state, dt) {
  const period = beatPeriod(state.level.bpm);
  let { beat, beatTimer, beatsLeft, wavesLeft, grid, randomState } = state;
  const effects = [...state.effects];
  let overflow = 0;
  beatTimer += dt;
  while (beatTimer >= period) {
    beatTimer -= period;
    beat += 1;
    beatsLeft -= 1;
    effects.push({ type: 'beat', beat });
    if (beatsLeft > 0) continue;
    beatsLeft = state.level.descendBeats;
    if (wavesLeft <= 0) continue;
    const spawned = spawnRow(randomState, state.colors);
    const pushed = descend(grid, spawned.row);
    grid = pushed.grid;
    randomState = spawned.randomState;
    overflow += pushed.overflow;
    wavesLeft -= 1;
    effects.push({ type: 'descend', wavesLeft });
  }
  const next = { ...state, beat, beatTimer, beatsLeft, wavesLeft, grid, randomState, effects };
  if (overflow > 0) {
    return { ...next, status: 'over', stars: 0, effects: [...effects, { type: 'over', reason: 'overflow' }] };
  }
  return next;
}

// 一次飞行结算：把撞击交给闭包处理，弹珠墙、分数和特效都在这里累积。
function flyBall(state, dt) {
  const period = beatPeriod(state.level.bpm);
  let grid = state.grid;
  let score = state.score;
  let cleared = state.cleared;
  let dropped = state.dropped;
  let cracked = state.cracked;
  let chain = state.chain;
  let bestChain = state.bestChain;
  let combo = state.combo;
  let bestCombo = state.bestCombo;
  let lastClear = null;
  const effects = [...state.effects];

  // 消除后重新检查支撑：挂不到天花板的整片弹珠会掉下来另算分。
  const dropLoose = () => {
    const loose = floating(grid);
    if (!loose.length) return 0;
    grid = clearCells(grid, loose);
    dropped += loose.length;
    cleared += loose.length;
    const gained = dropScore(loose.length, combo);
    score += gained;
    effects.push({ type: 'drop', cells: loose, gained });
    return loose.length;
  };

  const world = {
    occupied: (col, row) => Boolean(at(grid, col, row)),
    paddle: () => {
      chain = 0;
      const struck = onBeat(state.beatTimer, period);
      combo = struck ? combo + 1 : 0;
      bestCombo = Math.max(bestCombo, combo);
      effects.push({ type: 'paddle', onBeat: struck, combo });
      return state.paddleColor;
    },
    hit: (col, row, ball) => {
      const cell = at(grid, col, row);
      if (!cell) return { pass: true };
      if (cell.color === ball.color) {
        const group = groupAt(grid, col, row);
        // 同色成组：整组消掉，球穿过去继续连消。
        if (group.length >= MATCH_MIN) {
          grid = clearCells(grid, group);
          chain += 1;
          bestChain = Math.max(bestChain, chain);
          const gained = clearScore(group.length, chain, combo);
          score += gained;
          cleared += group.length;
          effects.push({ type: 'clear', cells: group, color: cell.color, chain, gained });
          const loose = dropLoose();
          lastClear = { count: group.length, chain, combo, gained, dropped: loose, color: cell.color };
          return { pass: true };
        }
        // 同色但凑不满三颗：只崩掉这一颗，球照常反弹。
        grid = clearCells(grid, [{ col, row }]);
        cleared += 1;
        score += clearScore(1, 1, combo);
        effects.push({ type: 'pop', col, row, color: cell.color });
        dropLoose();
        return { pass: false };
      }
      // 异色：砸裂，累计到 ARMOR 次才碎，用来给同色组开路。
      if (cell.damage + 1 >= ARMOR) {
        grid = clearCells(grid, [{ col, row }]);
        cleared += 1;
        score += clearScore(1, 1, combo);
        effects.push({ type: 'break', col, row, color: cell.color });
        dropLoose();
      } else {
        grid = damageCell(grid, col, row).grid;
        cracked += 1;
        score += crackScore(combo);
        effects.push({ type: 'crack', col, row, color: cell.color });
      }
      return { pass: false };
    },
  };

  const flight = advanceBall(state.ball, state.paddle, dt, world);
  return {
    ...state,
    grid,
    ball: flight.ball,
    score,
    cleared,
    dropped,
    cracked,
    chain,
    bestChain,
    combo,
    bestCombo,
    lastClear,
    effects,
    lost: flight.lost,
  };
}

// 掉球：扣一颗命，还有命就回到待发球状态，律动和连消都归零。
function loseBall(state) {
  const lives = state.lives - 1;
  const base = {
    ...state,
    lives,
    chain: 0,
    combo: 0,
    effects: [...state.effects, { type: 'lost', lives }],
  };
  if (lives <= 0) {
    return { ...base, status: 'over', stars: 0, effects: [...base.effects, { type: 'over', reason: 'lives' }] };
  }
  return { ...base, phase: 'serve', ball: servedBall(base.paddle, base.paddleColor) };
}

function settle(state) {
  if (state.status !== 'playing') return state;
  if (state.wavesLeft > 0 || !isEmpty(state.grid)) return state;
  const stars = starsFor(state.score, state.level.stars);
  return { ...state, status: 'won', stars, effects: [...state.effects, { type: 'won', stars }] };
}

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing') return state;
  let next = { ...state, elapsed: state.elapsed + dt, effects: [], lastClear: null, lost: false };
  next = movePaddle(next, input, dt);
  next = tickBeat(next, dt);
  if (next.status !== 'playing') return next;

  // 待发球时球贴在挡板上跟着走，点一下才出手；飞行中点一下换上膛颜色。
  if (next.phase === 'serve') {
    next = { ...next, ball: { ...servedBall(next.paddle, next.paddleColor) } };
    if (input.tap) next = launch(next);
    return settle(next);
  }
  if (input.tap) next = cycleColor(next);

  next = flyBall(next, dt);
  if (next.lost) next = loseBall(next);
  return settle(next);
}

export const isServing = (state) => state.phase === 'serve';

export const marblesLeft = (state) => state.grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

