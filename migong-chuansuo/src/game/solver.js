// 有界宽搜求最短推移次数。用于给关卡标 par，也用于测试确认打乱后的局面真能解开。
import { AXIS_COL, AXIS_ROW } from './rules.js';
import { boardSignature, canReach, shiftCell, shiftLine } from './grid.js';

// 动作全集：每层的每一行、每一列，各两个方向。
export function shiftActions(board) {
  const actions = [];
  for (let layer = 0; layer < board.layers; layer += 1) {
    for (let row = 0; row < board.rows; row += 1) {
      actions.push({ layer, axis: AXIS_ROW, index: row, dir: 1 });
      actions.push({ layer, axis: AXIS_ROW, index: row, dir: -1 });
    }
    for (let col = 0; col < board.cols; col += 1) {
      actions.push({ layer, axis: AXIS_COL, index: col, dir: 1 });
      actions.push({ layer, axis: AXIS_COL, index: col, dir: -1 });
    }
  }
  return actions;
}

export const applyShift = (board, cell, action) => ({
  board: shiftLine(board, action.layer, action.axis, action.index, action.dir),
  cell: shiftCell(board, cell, action.layer, action.axis, action.index, action.dir),
});

/**
 * 逐层加深的宽搜。命中就返回最短动作序列；预算或深度用尽返回 null——
 * null 只代表「这个预算内没找到」，不代表无解，调用方必须按这个语义兜底。
 */
export function solve(board, player, exit, { maxDepth = 3, maxStates = 60000 } = {}) {
  if (canReach(board, player, exit)) return { shifts: 0, moves: [], visited: 1, exhausted: false };
  const actions = shiftActions(board);
  const seen = new Set([boardSignature(board, player)]);
  let frontier = [{ board, cell: player, moves: [] }];
  let visited = 1;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const next = [];
    for (const node of frontier) {
      for (const action of actions) {
        const stepped = applyShift(node.board, node.cell, action);
        const signature = boardSignature(stepped.board, stepped.cell);
        if (seen.has(signature)) continue;
        seen.add(signature);
        visited += 1;
        const moves = [...node.moves, action];
        if (canReach(stepped.board, stepped.cell, exit)) {
          return { shifts: depth, moves, visited, exhausted: false };
        }
        if (visited >= maxStates) return { shifts: null, moves: null, visited, exhausted: true };
        next.push({ board: stepped.board, cell: stepped.cell, moves });
      }
    }
    if (next.length === 0) return { shifts: null, moves: null, visited, exhausted: false };
    frontier = next;
  }
  return { shifts: null, moves: null, visited, exhausted: true };
}

// 回放一串动作，返回终局。测试用它验证解法真的成立。
export function replay(board, player, moves) {
  let current = { board, cell: player };
  for (const action of moves) current = applyShift(current.board, current.cell, action);
  return current;
}
