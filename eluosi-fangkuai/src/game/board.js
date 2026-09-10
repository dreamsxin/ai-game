import { pieceCells } from './pieces.js';

export const COLUMNS = 10;
export const ROWS = 20;

export const createBoard = (columns = COLUMNS, rows = ROWS) =>
  Array.from({ length: rows }, () => Array.from({ length: columns }, () => null));

export const cloneBoard = (board) => board.map((row) => [...row]);

// 出生区在可见区之上，所以 y < 0 视为空而不是越界。
export function collides(board, type, rotation, x, y) {
  const columns = board[0].length;
  for (const [cx, cy] of pieceCells(type, rotation)) {
    const px = x + cx;
    const py = y + cy;
    if (px < 0 || px >= columns) return true;
    if (py >= board.length) return true;
    if (py >= 0 && board[py][px]) return true;
  }
  return false;
}

export const canPlace = (board, type, rotation, x, y) => !collides(board, type, rotation, x, y);

export function lockPiece(board, type, rotation, x, y) {
  const next = cloneBoard(board);
  for (const [cx, cy] of pieceCells(type, rotation)) {
    const py = y + cy;
    const px = x + cx;
    if (py >= 0 && py < next.length && px >= 0 && px < next[0].length) next[py][px] = type;
  }
  return next;
}

// 锁定后若还有格子留在可见区之上，说明堆到顶了。
export const overflows = (type, rotation, y) =>
  pieceCells(type, rotation).every(([, cy]) => y + cy < 0);

export function clearLines(board) {
  const columns = board[0].length;
  const cleared = [];
  const kept = [];
  board.forEach((row, index) => {
    if (row.every((cell) => cell)) cleared.push(index);
    else kept.push([...row]);
  });
  if (!cleared.length) return { board, cleared };
  const empty = Array.from({ length: cleared.length }, () =>
    Array.from({ length: columns }, () => null));
  return { board: [...empty, ...kept], cleared };
}

// 硬降落点：一直下探到再下一格会撞为止。
export function dropDistance(board, type, rotation, x, y) {
  let distance = 0;
  while (!collides(board, type, rotation, x, y + distance + 1)) distance += 1;
  return distance;
}

export const stackHeight = (board) => {
  const index = board.findIndex((row) => row.some((cell) => cell));
  return index === -1 ? 0 : board.length - index;
};
