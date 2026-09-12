// 一座塔的程序生成。可解性是**构造出来的**，不是搜出来的：
//
// 1. 先在 N×N×N 上随机深度优先挖一棵生成树 —— 任意两格必然连通，出口一定可达，
//    这就是「解开态」；
// 2. 按 loops 概率再开一些额外的门，让路不止一条，免得每关都是独木桥；
// 3. 从解开态开始随机推 scramble 次，砖阵、起点、出口一起被推乱，得到初始态；
// 4. 把打乱序列反过来、方向取反，就是一条保底解法 —— 它必然把三样一起推回解开态。
//
// 所以「有解」不依赖任何搜索预算。六阶分支数 216，搜索只搜得动一层，
// 全靠这条构造顶着。
import { DIRECTIONS, cellKey, towerRecipe } from './rules.js';
import { createRandom } from './random.js';
import { canReach, createCube, floodFrom, inCube, openDoor, tileAt } from './cube.js';
import { applyShift, invertAction, replay, shiftActions } from './solver.js';

/** 随机深度优先挖生成树。六个方向都走，所以挖出来的是一张三维连通图。 */
function carveCube(rng, cube) {
  const order = cube.order;
  const visited = new Set();
  const start = { layer: 0, col: rng.int(0, order - 1), row: rng.int(0, order - 1) };
  const key = ({ layer, col, row }) => `${layer},${col},${row}`;
  const stack = [start];
  visited.add(key(start));
  while (stack.length > 0) {
    const cell = stack[stack.length - 1];
    const options = [];
    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      const { dc, dr, dl } = DIRECTIONS[direction];
      const to = { layer: cell.layer + dl, col: cell.col + dc, row: cell.row + dr };
      if (!inCube(cube, to.layer, to.col, to.row)) continue;
      if (visited.has(key(to))) continue;
      options.push({ direction, to });
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const picked = rng.pick(options);
    openDoor(cube, cell.layer, cell.col, cell.row, picked.direction);
    visited.add(key(picked.to));
    stack.push(picked.to);
  }
}

/** 额外开门：给生成树加环，让路不止一条，免得每座塔都是独木桥。 */
function addLoops(rng, cube, ratio) {
  for (let layer = 0; layer < cube.order; layer += 1) {
    for (let row = 0; row < cube.order; row += 1) {
      for (let col = 0; col < cube.order; col += 1) {
        for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
          if (!rng.chance(ratio)) continue;
          if ((tileAt(cube, layer, col, row) & DIRECTIONS[direction].bit) !== 0) continue;
          openDoor(cube, layer, col, row, direction);
        }
      }
    }
  }
}

/**
 * 从解开态往回打乱。**只推砖阵，不带起点和出口** ——
 * 早先的写法是把起点出口一起打乱，结果它们经常被推离底层／顶层，
 * 只能靠换 seed 重生成整座塔去碰，命中率八成上下还得重试好几轮。
 * 改成先打乱、后放两头，这两条约束就变成构造保证的，一次都不用碰运气。
 */
function scrambleCube(rng, cube, count) {
  const actions = shiftActions(cube);
  let pose = { cube, cell: null, exit: null };
  const moves = [];
  for (let guard = 0; guard < count * 80 && moves.length < count; guard += 1) {
    const action = rng.pick(actions);
    const last = moves[moves.length - 1];
    // 连着动同一条线等于自我抵消，打乱步数会名不副实。
    if (last && last.axis === action.axis
      && last.anchor.layer === action.anchor.layer
      && last.anchor.col === action.anchor.col
      && last.anchor.row === action.anchor.row) {
      continue;
    }
    pose = applyShift(pose, action);
    moves.push(action);
  }
  return { cube: pose.cube, moves };
}

const spread = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

const cellsOnLayer = (cube, layer) => {
  const cells = [];
  for (let row = 0; row < cube.order; row += 1) {
    for (let col = 0; col < cube.order; col += 1) cells.push({ layer, col, row });
  }
  return cells;
};

/**
 * 在**打乱之后**的塔里放起点和出口：起点必须在底层、出口必须在顶层，
 * 而且两者此刻**不能连通** —— 否则开局就已经通关了。
 *
 * 一次洪泛就能拿到某个起点的整个可达集，所以「顶层里哪些格子还走不到」是一次算完的，
 * 不用逐个候选去试。挑平面上离起点最远的那个，爬起来才有穿过整座塔的感觉。
 */
function placeEnds(rng, cube) {
  const last = cube.order - 1;
  const corners = [
    { col: 0, row: 0 },
    { col: last, row: 0 },
    { col: last, row: last },
    { col: 0, row: last },
  ];
  const starts = [
    ...rng.shuffle(corners.map((corner) => ({ layer: 0, col: corner.col, row: corner.row }))),
    ...cellsOnLayer(cube, 0),
  ];
  for (const start of starts) {
    const reach = floodFrom(cube, start).distance;
    const options = cellsOnLayer(cube, last).filter((cell) => !reach.has(cellKey(cell)));
    if (options.length === 0) continue;
    options.sort((a, b) => spread(b, start) - spread(a, start));
    return { start, exit: options[0] };
  }
  return null;
}

const invertMoves = (moves) => moves.map(invertAction).reverse();

/**
 * 造一座塔。返回 null 只有一种原因：打乱之后底层到顶层**处处都通**，
 * 找不到一对不连通的两头。换个 seed 就好。
 */
export function buildTower(recipe) {
  const rng = createRandom(recipe.seed);
  const solvedCube = createCube(recipe.order);
  carveCube(rng, solvedCube);
  addLoops(rng, solvedCube, recipe.loops);
  const scrambled = scrambleCube(rng, solvedCube, recipe.scramble);
  const ends = placeEnds(rng, scrambled.cube);
  if (!ends) return null;
  const solution = invertMoves(scrambled.moves);
  // 保底解法把砖阵推回解开态，同时把两头也带回去。解开态是挖通的，
  // 任意两格必然连通 —— 所以「解开态里出口可达」不需要额外挑位置，是白送的。
  const back = replay(scrambled.cube, ends.start, ends.exit, solution);
  return {
    seed: recipe.seed,
    index: recipe.index,
    order: recipe.order,
    cube: scrambled.cube,
    solvedCube,
    start: ends.start,
    exit: ends.exit,
    solvedStart: back.cell,
    solvedExit: back.exit,
    scramble: scrambled.moves.length,
    solution,
    par: solution.length,
  };
}


/**
 * 体检。现在这几条基本都是构造保证的，留着是为了**万一构造被改坏能立刻炸出来**，
 * 而不是靠它筛掉坏塔。三条各用哪个出口不能混：
 * 解开态用 solvedExit，初始态和保底解法用 exit（解法会把它推回去）。
 */
export function validateTower(tower) {
  const issues = [];
  if (!tower) return { ok: false, issues: ['打乱后底层到顶层处处都通，放不下两头'] };
  if (!canReach(tower.solvedCube, tower.solvedStart, tower.solvedExit)) {
    issues.push('解开态里出口不可达');
  }
  if (tower.scramble < 1) issues.push('打乱步数为零');
  if (tower.start.layer !== 0) issues.push('起点不在底层');
  if (tower.exit.layer !== tower.order - 1) issues.push('出口不在顶层');
  if (canReach(tower.cube, tower.start, tower.exit)) issues.push('初始态已经通关');
  const end = replay(tower.cube, tower.start, tower.exit, tower.solution);
  if (!canReach(end.cube, end.cell, end.exit)) issues.push('保底解法走不到出口');
  return { ok: issues.length === 0, issues };
}

/**
 * 重试用的 seed。第 0 次原样用传进来的那个，重试则散列跳走 ——
 * 早先是 seed + attempt，结果相邻的两个 seed 会撞车：99 第一次没过就落到 100，
 * 于是 99 和 100 开出同一座塔。「换个 seed 换一座塔」这条不能有例外。
 */
const attemptSeed = (seed, attempt) => {
  if (attempt === 0) return (seed >>> 0) || 1;
  return (Math.imul((seed >>> 0) ^ Math.imul(attempt, 0x85ebca6b), 0x9e3779b1) >>> 0) || 1;
};

/**
 * 生成第 index 座塔。
 *
 * par 直接取保底解法长度，**不跑搜索**：六阶分支数 6·36=216，宽搜只搜得动一层，
 * 为了一个更紧的 par 让每座塔多花几百毫秒不值得 —— 无尽模式要的是接得上。
 */
export function generateTower(index, seed, maxAttempts = 12) {
  const base = towerRecipe(index);
  const failures = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const recipe = { ...base, seed: attemptSeed(seed, attempt) };
    const tower = buildTower(recipe);
    const report = validateTower(tower);
    if (report.ok) return { tower, recipe, report, attempts: attempt + 1, failures };
    failures.push({ seed: recipe.seed, issues: report.issues });
  }
  return { tower: null, recipe: null, report: null, attempts: maxAttempts, failures };
}




