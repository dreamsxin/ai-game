import {
  COLUMNS,
  ROWS,
  clearLines,
  collides,
  createBoard,
  dropDistance,
  lockPiece,
  overflows,
  stackHeight,
} from './board.js';
import { QUEUE_SIZE, createQueue, takeNext } from './bag.js';
import { kickOffsets, normalizeRotation, spawnPosition } from './pieces.js';
import {
  LOCK_DELAY,
  MAX_LOCK_RESETS,
  REPEAT_DELAY,
  REPEAT_RATE,
  SOFT_DROP_FACTOR,
  comboScore,
  dropScore,
  gravityInterval,
  isDifficultClear,
  levelFor,
  lineScore,
  resultStars,
} from './rules.js';

export const STEP = 1 / 60;

export const EMPTY_INPUT = {
  left: false,
  right: false,
  rotateCW: false,
  rotateCCW: false,
  hardDrop: false,
  hold: false,
  held: { left: false, right: false, softDrop: false },
};

export function createGame(seed = 1) {
  const { queue, randomState } = createQueue(seed, QUEUE_SIZE + 1);
  const board = createBoard(COLUMNS, ROWS);
  const spawned = takeNext(queue, randomState, QUEUE_SIZE);
  return withGhost({
    seed,
    status: 'ready',
    board,
    active: newPiece(spawned.type),
    queue: spawned.queue,
    randomState: spawned.randomState,
    hold: null,
    holdUsed: false,
    ghostY: 0,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,
    repeatDir: 0,
    repeatTimer: 0,
    lines: 0,
    level: 1,
    score: 0,
    combo: 0,
    backToBack: false,
    lastClear: null,
    lastAction: null,
    elapsed: 0,
    pieces: 0,
    stars: 0,
    effects: [],
  });
}

export const startGame = (seed) => ({ ...createGame(seed), status: 'playing' });

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

const newPiece = (type) => ({ type, rotation: 0, ...spawnPosition(type, COLUMNS) });

// 幽灵落点每次状态变化后重算，渲染层直接用，不再自己推演。
function withGhost(state) {
  if (!state.active) return { ...state, ghostY: 0 };
  const { type, rotation, x, y } = state.active;
  return { ...state, ghostY: y + dropDistance(state.board, type, rotation, x, y) };
}

const occupied = (board, x, y) => {
  if (x < 0 || x >= board[0].length || y >= board.length) return true;
  if (y < 0) return false;
  return Boolean(board[y][x]);
};

// T-spin 用三角判定：T 的四角至少三个被占，且落地前最后一次操作是旋转。
function detectTSpin(board, active, lastAction) {
  if (!active || active.type !== 'T' || lastAction !== 'rotate') return false;
  const { x, y } = active;
  const corners = [[x, y], [x + 2, y], [x, y + 2], [x + 2, y + 2]];
  return corners.filter(([cx, cy]) => occupied(board, cx, cy)).length >= 3;
}
const isGrounded = (state) => {
  const { type, rotation, x, y } = state.active;
  return collides(state.board, type, rotation, x, y + 1);
};

// 贴地时的移动和旋转会重置锁定延时，但重置次数有上限，防止无限拖延。
function touchLock(state, moved) {
  if (!moved || !isGrounded(state) || state.lockResets >= MAX_LOCK_RESETS) return state;
  return { ...state, lockTimer: 0, lockResets: state.lockResets + 1 };
}

function shift(state, dx) {
  const { type, rotation, x, y } = state.active;
  if (collides(state.board, type, rotation, x + dx, y)) return state;
  const moved = {
    ...state,
    active: { ...state.active, x: x + dx },
    lastAction: 'move',
    effects: [...state.effects, { type: 'move', dx }],
  };
  return touchLock(moved, true);
}

function rotate(state, direction) {
  const { type, rotation, x, y } = state.active;
  const target = normalizeRotation(type, rotation + direction);
  for (const [dx, dy] of kickOffsets(type, rotation, target)) {
    if (collides(state.board, type, target, x + dx, y + dy)) continue;
    const turned = {
      ...state,
      active: { type, rotation: target, x: x + dx, y: y + dy },
      lastAction: 'rotate',
      // 踢墙转和原地转手感差很多，反馈层要分得开，所以把偏移量记成一个标记。
      effects: [...state.effects, { type: 'rotate', kicked: dx !== 0 || dy !== 0 }],
    };
    return touchLock(turned, true);
  }
  return state;
}


// 换手只允许一次，换回来的方块从出生点重新开始。
function swapHold(state) {
  if (state.holdUsed) return state;
  const current = state.active.type;
  if (state.hold) {
    return {
      ...state,
      active: newPiece(state.hold),
      hold: current,
      holdUsed: true,
      gravityTimer: 0,
      lockTimer: 0,
      lockResets: 0,
      lastAction: 'hold',
      effects: [...state.effects, { type: 'hold', piece: current }],
    };
  }
  const taken = takeNext(state.queue, state.randomState, QUEUE_SIZE);
  return {
    ...state,
    active: newPiece(taken.type),
    queue: taken.queue,
    randomState: taken.randomState,
    hold: current,
    holdUsed: true,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    lastAction: 'hold',
    effects: [...state.effects, { type: 'hold', piece: current }],
  };
}

function lockDown(state) {
  const { type, rotation, x, y } = state.active;
  const tspin = detectTSpin(state.board, state.active, state.lastAction);
  const topOut = overflows(type, rotation, y);
  const filled = lockPiece(state.board, type, rotation, x, y);
  const { board, cleared } = clearLines(filled);
  const count = cleared.length;
  const lines = state.lines + count;
  const combo = count > 0 ? state.combo + 1 : 0;
  const gained = lineScore(count, state.level, { tspin, backToBack: state.backToBack })
    + (count > 0 ? comboScore(combo - 1, state.level) : 0);
  const effects = [...state.effects, { type: 'lock', piece: type, rows: cleared }];
  if (count > 0) effects.push({ type: 'clear', count, rows: cleared, tspin, combo });
  // 速度等级只在锁定这一刻会变，涨了就报一声——不然玩家只看见下落突然变快。
  const level = levelFor(lines);
  if (level > state.level) effects.push({ type: 'level', level });


  const taken = takeNext(state.queue, state.randomState, QUEUE_SIZE);
  const active = newPiece(taken.type);
  const blocked = collides(board, active.type, active.rotation, active.x, active.y);
  const score = state.score + gained;
  return {
    ...state,
    board,
    active,
    queue: taken.queue,
    randomState: taken.randomState,
    holdUsed: false,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,
    lines,
    level,

    score,
    combo,
    backToBack: count > 0 ? isDifficultClear(count, tspin) : state.backToBack,
    lastClear: count > 0 ? { count, tspin, combo } : null,
    lastAction: null,
    pieces: state.pieces + 1,
    status: topOut || blocked ? 'over' : state.status,
    stars: topOut || blocked ? resultStars(score) : state.stars,
    effects: topOut || blocked ? [...effects, { type: 'topout' }] : effects,
  };
}
// 横移：点按走一格，长按经过 REPEAT_DELAY 后按 REPEAT_RATE 连续走。
function applyShift(state, input, dt) {
  let next = state;
  let dir = state.repeatDir;
  let timer = state.repeatTimer;
  if (input.left) {
    next = shift(next, -1);
    dir = -1;
    timer = REPEAT_DELAY;
  }
  if (input.right) {
    next = shift(next, 1);
    dir = 1;
    timer = REPEAT_DELAY;
  }
  const held = dir < 0 ? input.held.left : dir > 0 ? input.held.right : false;
  if (!held) return { ...next, repeatDir: 0, repeatTimer: 0 };
  timer -= dt;
  while (timer <= 0) {
    next = shift(next, dir);
    timer += REPEAT_RATE;
  }
  return { ...next, repeatDir: dir, repeatTimer: timer };
}

function applyGravity(state, input, dt) {
  const soft = input.held.softDrop;
  const interval = gravityInterval(state.level);
  let timer = state.gravityTimer + dt * (soft ? SOFT_DROP_FACTOR : 1);
  let next = state;
  let cells = 0;
  while (timer >= interval) {
    timer -= interval;
    const { type, rotation, x, y } = next.active;
    if (collides(next.board, type, rotation, x, y + 1)) {
      timer = 0;
      break;
    }
    next = { ...next, active: { ...next.active, y: y + 1 }, lastAction: 'move' };
    cells += 1;
  }
  const score = soft ? next.score + dropScore(cells, false) : next.score;
  return { ...next, gravityTimer: timer, score };
}

function applyHardDrop(state) {
  const { type, rotation, x, y } = state.active;
  const cells = dropDistance(state.board, type, rotation, x, y);
  const dropped = {
    ...state,
    active: { ...state.active, y: y + cells },
    score: state.score + dropScore(cells, true),
    lastAction: cells > 0 ? 'move' : state.lastAction,
    effects: [...state.effects, { type: 'hardDrop', cells, column: x }],
  };
  return lockDown(dropped);
}

// 贴地后延时锁定，给玩家最后调整的时间。
function applyLockDelay(state, dt) {
  if (!isGrounded(state)) return { ...state, grounded: false, lockTimer: 0, lockResets: 0 };
  const lockTimer = state.lockTimer + dt;
  if (lockTimer < LOCK_DELAY) return { ...state, grounded: true, lockTimer };
  return lockDown({ ...state, grounded: true, lockTimer });
}

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing' || !state.active) return state;
  let next = { ...state, elapsed: state.elapsed + dt, effects: [], lastClear: null };
  if (input.hold) next = swapHold(next);
  if (input.rotateCW) next = rotate(next, 1);
  if (input.rotateCCW) next = rotate(next, -1);
  next = applyShift(next, input, dt);
  next = input.hardDrop ? applyHardDrop(next) : applyLockDelay(applyGravity(next, input, dt), dt);
  return withGhost(next);
}

export const boardHeight = (state) => stackHeight(state.board);


