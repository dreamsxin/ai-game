import {
  CLEAR_TIME,
  FALL_TIME,
  REJECT_TIME,
  SHUFFLE_TIME,
  SWAP_TIME,
  clearScore,
  starsFor,
} from './rules.js';
import { specialFor, tile } from './tiles.js';
import { hasNextLevel, levelAt, levelKinds } from './levels.js';
import {
  adjacent,
  at,
  clearCells,
  collapse,
  createBoard,
  detonate,
  findMatches,
  findMoves,
  groupOrigin,
  key,
  legalSwap,
  refill,
  shuffleBoard,
  swapCells,
} from './board.js';

export const STEP = 1 / 60;

export const EMPTY_INPUT = { tap: null, swipe: null };

export function createGame(seed = 1, levelIndex = 0) {
  const level = levelAt(levelIndex);
  const kinds = levelKinds(level);
  const { board, randomState } = createBoard(seed + level.id * 7919, kinds);
  return {
    seed,
    levelIndex,
    level,
    kinds,
    status: 'ready',
    phase: 'idle',
    timer: 0,
    board,
    randomState,
    selected: null,
    swap: null,
    pending: null,
    clearing: [],
    moves: level.moves,
    score: 0,
    chain: 0,
    bestChain: 0,
    cleared: 0,
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

// 交换特殊果实可以不成三连就引爆，所以起爆点由消除组和被换的两格共同决定。
function planClear(board, pair = []) {
  const groups = findMatches(board);
  const seeds = [];
  for (const group of groups) {
    for (const [x, y] of group.cells) seeds.push({ x, y });
  }
  let rainbowKind;
  const rainbows = pair.filter((spot) => at(board, spot.x, spot.y)?.special === 'rainbow');
  for (const spot of pair) {
    const t = at(board, spot.x, spot.y);
    if (!t?.special) continue;
    seeds.push(spot);
    if (t.special !== 'rainbow') continue;
    const other = pair.find((p) => p !== spot);
    const partner = other ? at(board, other.x, other.y) : null;
    rainbowKind = partner && !partner.special ? partner.kind : t.kind;
  }
  // 两颗彩虹果换在一起直接清空整盘。
  if (rainbows.length === 2) {
    board.forEach((row, y) => row.forEach((t, x) => t && seeds.push({ x, y })));
  }
  if (!seeds.length) return null;
  const { cells, specials } = detonate(board, seeds, { rainbowKind });
  const spawns = groups.map((group) => spawnFor(group, pair)).filter(Boolean);
  return { groups, cells, specials, spawns };
}

function spawnFor(group, pair) {
  const special = specialFor(group);
  if (!special) return null;
  const cellKeys = new Set(group.cells.map(([x, y]) => key(x, y)));
  const hit = pair.find((spot) => cellKeys.has(key(spot.x, spot.y)));
  const origin = hit ? { x: hit.x, y: hit.y } : groupOrigin(group);
  return { ...origin, kind: group.kind, special };
}

function beginClear(state, plan) {
  const chain = state.chain + 1;
  const gained = clearScore(plan.cells.length, chain, plan.specials);
  return {
    ...state,
    phase: 'clear',
    timer: CLEAR_TIME,
    pending: plan,
    clearing: plan.cells,
    chain,
    bestChain: Math.max(state.bestChain, chain),
    score: state.score + gained,
    cleared: state.cleared + plan.cells.length,
    lastClear: { count: plan.cells.length, chain, gained, specials: plan.specials, spawns: plan.spawns },
    effects: [...state.effects, { type: 'clear', cells: plan.cells, chain, specials: plan.specials }],
  };
}

// 消除动画结束：真正抹掉果实、放下新生成的特殊果实，再压实补充。
function applyClear(state) {
  const plan = state.pending;
  const board = clearCells(state.board, plan.cells);
  for (const spawn of plan.spawns) board[spawn.y][spawn.x] = tile(spawn.kind, spawn.special);
  const dropped = collapse(board);
  const filled = refill(dropped.board, state.randomState, state.kinds);
  return {
    ...state,
    board: filled.board,
    randomState: filled.randomState,
    pending: null,
    clearing: [],
    phase: 'fall',
    timer: FALL_TIME,
    effects: [...state.effects, { type: 'fall', drops: dropped.drops, spawned: filled.spawned }],
  };
}

function settle(state) {
  const next = { ...state, phase: 'idle', chain: 0 };
  if (next.score >= next.level.target) {
    const stars = starsFor(next.score, next.level.stars);
    return { ...next, status: 'won', stars, selected: null, effects: [...next.effects, { type: 'won', stars }] };
  }
  if (next.moves <= 0) {
    return { ...next, status: 'over', stars: 0, selected: null, effects: [...next.effects, { type: 'over' }] };
  }
  if (findMoves(next.board).length === 0) {
    return { ...next, phase: 'shuffle', timer: SHUFFLE_TIME, effects: [...next.effects, { type: 'shuffle' }] };
  }
  return next;
}

function resolve(state) {
  const plan = planClear(state.board);
  if (plan) return beginClear(state, plan);
  return settle(state);
}

function applySwap(state) {
  const { a, b } = state.swap;
  const board = swapCells(state.board, a, b);
  const plan = planClear(board, [a, b]);
  const swapped = { ...state, board, swap: null };
  if (!plan) return settle(swapped);
  return beginClear(swapped, plan);
}

function applyShuffle(state) {
  const shuffled = shuffleBoard(state.board, state.randomState, state.kinds);
  return settle({
    ...state,
    board: shuffled.board,
    randomState: shuffled.randomState,
    effects: [...state.effects, { type: 'shuffled' }],
  });
}

export function attemptSwap(state, a, b) {
  if (!at(state.board, a.x, a.y) || !at(state.board, b.x, b.y)) return { ...state, selected: null };
  if (!adjacent(a, b)) return { ...state, selected: { ...a } };
  if (!legalSwap(state.board, a, b)) {
    return {
      ...state,
      selected: null,
      phase: 'reject',
      timer: REJECT_TIME,
      swap: { a, b, rejected: true },
      effects: [...state.effects, { type: 'reject', a, b }],
    };
  }
  return {
    ...state,
    selected: null,
    phase: 'swap',
    timer: SWAP_TIME,
    swap: { a, b, rejected: false },
    moves: state.moves - 1,
    chain: 0,
    effects: [...state.effects, { type: 'swap', a, b }],
  };
}

// 空闲期才收输入：拖动直接换位，点选则第一下选中、第二下换位。
function applyIdle(state, input) {
  if (input.swipe) {
    const { from, dir } = input.swipe;
    return attemptSwap(state, from, { x: from.x + dir.dx, y: from.y + dir.dy });
  }
  if (!input.tap) return state;
  const tap = input.tap;
  if (!at(state.board, tap.x, tap.y)) return state;
  if (!state.selected) return { ...state, selected: { ...tap } };
  if (state.selected.x === tap.x && state.selected.y === tap.y) return { ...state, selected: null };
  if (!adjacent(state.selected, tap)) return { ...state, selected: { ...tap } };
  return attemptSwap(state, state.selected, tap);
}

const advance = (state, dt, done) => {
  const timer = state.timer - dt;
  if (timer > 0) return { ...state, timer };
  return done({ ...state, timer: 0 });
};

function applyPhase(state, input, dt) {
  switch (state.phase) {
    case 'idle':
      return applyIdle(state, input);
    case 'swap':
      return advance(state, dt, applySwap);
    case 'reject':
      return advance(state, dt, (s) => ({ ...s, phase: 'idle', swap: null }));
    case 'clear':
      return advance(state, dt, applyClear);
    case 'fall':
      return advance(state, dt, resolve);
    case 'shuffle':
      return advance(state, dt, applyShuffle);
    default:
      return state;
  }
}

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing') return state;
  const base = { ...state, elapsed: state.elapsed + dt, effects: [], lastClear: null };
  return applyPhase(base, input, dt);
}

export const isBusy = (state) => state.phase !== 'idle';

export const legalMoves = (state) => findMoves(state.board);
