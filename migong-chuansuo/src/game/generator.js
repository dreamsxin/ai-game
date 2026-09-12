// 关卡生成：先造一个「已解开」的迷宫，再反向打乱，因此可解性是构造出来的而不是碰出来的。
//
// 四条不变量：
// 1. 每层先随机 DFS 铺一棵生成树，层内任意两格必然连通；
// 2. 相邻层之间至少放一对对齐的跃迁垫，跨层也必然连通；
// 3. 打乱只用推移动作，而推移是可逆的：反着推回去必然回到已解开的局面；
// 4. 玩家在打乱时跟着砖走，所以反推同样会把它送回起点——保底解法长度就是打乱步数。
import { DIRECTIONS, WARP, levelRecipe } from './rules.js';
import { createRandom } from './random.js';
import {
  canReach,
  cloneBoard,
  createBoard,
  inBounds,
  openDoor,
  setTile,
  tileAt,
} from './grid.js';
import { applyShift, replay, shiftActions, solve } from './solver.js';

export const DEFAULT_RECIPE = {
  seed: 1,
  cols: 4,
  rows: 4,
  layers: 1,
  scramble: 3,
  loops: 0.2,
};

// 随机 DFS 生成树：出栈式回溯，走完保证全格连通且没有孤立房间。
function carveLayer(rng, board, layer) {
  const startCol = rng.int(0, board.cols - 1);
  const startRow = rng.int(0, board.rows - 1);
  const visited = new Set([`${startCol},${startRow}`]);
  const stack = [{ col: startCol, row: startRow }];
  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    // 每轮固定抽一次洗牌，分支里不再取随机数，序列才不会错位。
    const order = rng.shuffle([0, 1, 2, 3]);
    let advanced = false;
    for (const direction of order) {
      const { dc, dr } = DIRECTIONS[direction];
      const col = cell.col + dc;
      const row = cell.row + dr;
      if (!inBounds(board, col, row) || visited.has(`${col},${row}`)) continue;
      openDoor(board, layer, cell.col, cell.row, direction);
      visited.add(`${col},${row}`);
      stack.push({ col, row });
      advanced = true;
      break;
    }
    if (!advanced) stack.pop();
  }
}

// 额外开门只会增加连通度，不可能破坏不变量 1，所以可以随便加。
function addLoops(rng, board, layer, chance) {
  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      // 只朝东和南开，避免同一堵墙被判两次。
      for (const direction of [1, 2]) {
        if (rng.chance(chance)) openDoor(board, layer, col, row, direction);
      }
    }
  }
}

// 每对相邻层共用一个坐标的垫子，对齐是解开状态的一部分，推歪了就断链。
function placeWarps(rng, board) {
  const warps = [];
  for (let layer = 0; layer + 1 < board.layers; layer += 1) {
    const col = rng.int(0, board.cols - 1);
    const row = rng.int(0, board.rows - 1);
    setTile(board, layer, col, row, tileAt(board, layer, col, row) | WARP);
    setTile(board, layer + 1, col, row, tileAt(board, layer + 1, col, row) | WARP);
    warps.push({ lower: layer, col, row });
  }
  return warps;
}

const CORNERS = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 1, row: 1 },
  { col: 0, row: 1 },
];

function buildSolved(rng, recipe) {
  const board = createBoard(recipe.cols, recipe.rows, recipe.layers);
  for (let layer = 0; layer < recipe.layers; layer += 1) {
    carveLayer(rng, board, layer);
    addLoops(rng, board, layer, recipe.loops);
  }
  const warps = placeWarps(rng, board);
  // 起点和出口取对角，保证解法必须横穿整张图。
  const pick = rng.int(0, 3);
  const near = CORNERS[pick];
  const far = CORNERS[(pick + 2) % 4];
  const toCell = (corner, layer) => ({
    layer,
    col: corner.col === 0 ? 0 : board.cols - 1,
    row: corner.row === 0 ? 0 : board.rows - 1,
  });
  return {
    board,
    warps,
    start: toCell(near, 0),
    exit: toCell(far, recipe.layers - 1),
  };
}

// 打乱要把出口一起带着走：出口长在砖上，跟玩家一样会被推移带位移。
// 于是「解开态的出口」和「初始态的出口」是两个不同的格子——前者是关卡设计时的对角，
// 后者才是玩家一开始看到的那道门。两个都得留着，体检时要分开用。
function scrambleBoard(rng, board, start, exit, count) {
  const actions = shiftActions(board);
  let current = { board, cell: start, exit };
  const moves = [];
  for (let guard = 0; guard < count * 80 && moves.length < count; guard += 1) {
    const action = rng.pick(actions);
    const last = moves[moves.length - 1];
    // 连续动同一条线等于自我抵消，打乱步数会名不副实。
    if (last && last.layer === action.layer && last.axis === action.axis && last.index === action.index) {
      continue;
    }
    current = applyShift(current, action);
    moves.push(action);
  }
  return { board: current.board, player: current.cell, exit: current.exit, moves };
}

// 打乱序列反过来、方向取反，就是一条保底解法。
const invertMoves = (moves) => moves.map((move) => ({ ...move, dir: -move.dir })).reverse();

function buildLevel(recipe) {
  const rng = createRandom(recipe.seed);
  const solved = buildSolved(rng, recipe);
  const scrambled = scrambleBoard(rng, solved.board, solved.start, solved.exit, recipe.scramble);
  const solution = invertMoves(scrambled.moves);
  return {
    seed: recipe.seed,
    name: recipe.name ?? null,
    cols: recipe.cols,
    rows: recipe.rows,
    layers: recipe.layers,
    board: scrambled.board,
    solvedBoard: solved.board,
    start: scrambled.player,
    solvedStart: solved.start,
    // exit 是玩家开局看到的那道门；solvedExit 是把打乱推回去之后它该在的位置。
    exit: scrambled.exit,
    solvedExit: solved.exit,
    warps: solved.warps,
    scramble: scrambled.moves.length,
    solution,
    par: solution.length,
  };
}

// 体检：解开态必须通、初始态必须不通、保底解法必须真的能通。
// 注意三条各用哪个出口：解开态用 solvedExit，初始态和保底解法用 exit（保底解法会把它推回去）。
export function validateLevel(level) {
  const issues = [];
  if (!canReach(level.solvedBoard, level.solvedStart, level.solvedExit)) {
    issues.push('解开态里出口不可达');
  }
  if (level.scramble < 1) issues.push('打乱步数为零');
  if (canReach(level.board, level.start, level.exit)) issues.push('初始态已经通关');
  const end = replay(level.board, level.start, level.exit, level.solution);
  if (!canReach(end.board, end.cell, end.exit)) issues.push('保底解法走不到出口');
  return { ok: issues.length === 0, issues };
}

/**
 * 生成一关。失败只会来自「打乱后碰巧已经通关」这类情况，换 seed 重试即可。
 * par 用有界宽搜校正：搜到更短解就用它，搜不到就沿用保底解法长度。
 */
export function generateLevel(overrides = {}, maxAttempts = 24) {
  const base = { ...DEFAULT_RECIPE, ...overrides };
  const failures = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const recipe = { ...base, seed: (base.seed + attempt) >>> 0 };
    const level = buildLevel(recipe);
    const report = validateLevel(level);
    if (!report.ok) {
      failures.push({ seed: recipe.seed, issues: report.issues });
      continue;
    }
    // 动作分支数随层数和边长线性涨，深度不压下来单关生成就要几十毫秒。
    // 大盘（后面几章的 6×6×4、7×7×4）分支上百，只查「一步是不是就够了」；
    // 搜不到只会让 par 退回保底解法长度，那本身就是一条真能走通的解，代价可接受。
    const branching = 2 * level.layers * (level.cols + level.rows);
    const maxDepth = branching > 60 ? 1 : branching > 30 ? 2 : 3;
    const search = solve(level.board, level.start, level.exit, {
      maxDepth: Math.min(level.scramble, maxDepth),
      maxStates: 20000,
    });
    const par = search.shifts ?? level.scramble;
    return {
      level: { ...level, par, optimal: search.shifts },
      recipe,
      report,
      attempts: attempt + 1,
      failures,
    };
  }
  return { level: null, recipe: base, report: null, attempts: maxAttempts, failures };
}

// 按关卡表取配方，seed 把同一关变成无限张不同的图。
export const generateCampaignLevel = (index, seed) => {
  const recipe = levelRecipe(index);
  return generateLevel({ ...recipe, seed });
};

export function levelMetrics(level) {
  const cells = level.cols * level.rows * level.layers;
  let doors = 0;
  let warps = 0;
  for (const layer of level.board.tiles) {
    for (const tile of layer) {
      for (const direction of DIRECTIONS) if (tile & direction.bit) doors += 1;
      if (tile & WARP) warps += 1;
    }
  }
  return { cells, doors, warps, doorsPerCell: doors / cells, par: level.par, scramble: level.scramble };
}

export const cloneLevelBoard = (level) => cloneBoard(level.board);
