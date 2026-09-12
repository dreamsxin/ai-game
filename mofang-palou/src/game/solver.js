// 有界宽搜。给提示用，也给测试用来确认打乱后的局面真能解开。
//
// 分支数是 6·order²：三条线族各 order² 条线，每条两个方向。
// 三阶 54，六阶 216 —— 六阶只搜得动一层，所以 par 不靠搜索得出（见 generator.js）。
import { AXES } from './rules.js';
import { canReach, cubeSignature, lineCells, shiftCell, shiftLine } from './cube.js';

/**
 * 动作全集。每条线取它的第 0 格当规范锚点，这样同一条线不会出现两个锚点。
 */
export function shiftActions(cube) {
  const actions = [];
  for (const axis of AXES) {
    const seen = new Set();
    for (let layer = 0; layer < cube.order; layer += 1) {
      for (let row = 0; row < cube.order; row += 1) {
        for (let col = 0; col < cube.order; col += 1) {
          const anchor = lineCells(cube, axis, { layer, col, row })[0];
          const key = `${anchor.layer},${anchor.col},${anchor.row}`;
          if (seen.has(key)) continue;
          seen.add(key);
          actions.push({ axis, anchor, dir: 1 });
          actions.push({ axis, anchor, dir: -1 });
        }
      }
    }
  }
  return actions;
}

/**
 * 推一次：砖阵、玩家、出口一起走。
 * 出口和玩家都长在砖上，只挪砖阵会让它们悬在空中，谜题也就退化成固定终点。
 */
export const applyShift = (pose, action) => ({
  cube: shiftLine(pose.cube, action.axis, action.anchor, action.dir),
  cell: shiftCell(pose.cube, pose.cell, action.axis, action.anchor, action.dir),
  exit: shiftCell(pose.cube, pose.exit, action.axis, action.anchor, action.dir),
});

/** 反向动作。可逆是「打乱反过来就是解法」这条构造的唯一前提。 */
export const invertAction = (action) => ({ ...action, dir: -action.dir });

/**
 * 逐层加深的宽搜。命中返回最短动作序列；预算或深度用尽返回 null ——
 * null 只代表「这个预算内没找到」，不代表无解，调用方必须按这个语义兜底。
 */
export function solve(cube, player, exit, { maxDepth = 2, maxStates = 40000 } = {}) {
  if (canReach(cube, player, exit)) return { shifts: 0, moves: [], visited: 1, exhausted: false };
  const actions = shiftActions(cube);
  const seen = new Set([cubeSignature(cube, player, exit)]);
  let frontier = [{ cube, cell: player, exit, moves: [] }];
  let visited = 1;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const next = [];
    for (const node of frontier) {
      for (const action of actions) {
        const stepped = applyShift(node, action);
        const signature = cubeSignature(stepped.cube, stepped.cell, stepped.exit);
        if (seen.has(signature)) continue;
        seen.add(signature);
        visited += 1;
        const moves = [...node.moves, action];
        if (canReach(stepped.cube, stepped.cell, stepped.exit)) {
          return { shifts: depth, moves, visited, exhausted: false };
        }
        if (visited >= maxStates) return { shifts: null, moves: null, visited, exhausted: true };
        next.push({ ...stepped, moves });
      }
    }
    if (next.length === 0) return { shifts: null, moves: null, visited, exhausted: false };
    frontier = next;
  }
  return { shifts: null, moves: null, visited, exhausted: true };
}

/** 回放一串动作，返回终局（砖阵、玩家、出口都是推完之后的）。 */
export function replay(cube, player, exit, moves) {
  let current = { cube, cell: player, exit };
  for (const action of moves) current = applyShift(current, action);
  return current;
}
