import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../src/game/board.js';

const fillRow = (board, y, skip = []) => {
  board[y] = board[y].map((_, x) => (skip.includes(x) ? null : 'I'));
  return board;
};

test('棋盘默认 10 列 20 行且全空', () => {
  const board = createBoard();
  assert.equal(board.length, ROWS);
  assert.equal(board[0].length, COLUMNS);
  assert.ok(board.every((row) => row.every((cell) => cell === null)));
});

test('越界和已有方块都算碰撞，出生区之上不算', () => {
  const board = createBoard();
  assert.equal(collides(board, 'O', 0, -1, 0), true, '左侧越界');
  assert.equal(collides(board, 'O', 0, COLUMNS - 1, 0), true, '右侧越界');
  assert.equal(collides(board, 'O', 0, 0, ROWS - 1), true, '底部越界');
  assert.equal(collides(board, 'O', 0, 0, -2), false, '出生区之上应可放置');
  board[5][0] = 'T';
  assert.equal(collides(board, 'O', 0, 0, 4), true, '压到已有方块');
});

test('锁定只写入可见区内的格子', () => {
  const locked = lockPiece(createBoard(), 'O', 0, 0, -1);
  assert.equal(locked[0][0], 'O');
  assert.equal(locked[0][1], 'O');
  assert.equal(stackHeight(locked), ROWS);
});

test('满行被清掉，顶部补上同样数量的空行', () => {
  let board = createBoard();
  board = fillRow(board, ROWS - 1);
  board = fillRow(board, ROWS - 2);
  board[ROWS - 3][3] = 'T';
  const { board: next, cleared } = clearLines(board);
  assert.deepEqual(cleared, [ROWS - 2, ROWS - 1]);
  assert.equal(next.length, ROWS);
  assert.equal(next[ROWS - 1][3], 'T', '未满的行应整体下移');
  assert.ok(next[0].every((cell) => cell === null));
});

test('没有满行时原样返回', () => {
  const board = fillRow(createBoard(), ROWS - 1, [4]);
  const { board: next, cleared } = clearLines(board);
  assert.equal(cleared.length, 0);
  assert.equal(next, board);
});

test('硬降距离一直探到落地为止', () => {
  const board = createBoard();
  assert.equal(dropDistance(board, 'O', 0, 0, 0), ROWS - 2);
  board[ROWS - 1][0] = 'I';
  board[ROWS - 1][1] = 'I';
  assert.equal(dropDistance(board, 'O', 0, 0, 0), ROWS - 3);
});

test('全部格子留在可见区之上才算顶出', () => {
  assert.equal(overflows('O', 0, -2), true);
  assert.equal(overflows('O', 0, -1), false);
  assert.equal(stackHeight(createBoard()), 0);
});
