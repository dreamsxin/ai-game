import assert from 'node:assert/strict';
import test from 'node:test';
import { AI, HUMAN, analyzeMoveSituation, createBoard } from '../src/game.js';

function line(board, player, row, columns) {
  columns.forEach(col => { board[row][col] = player; });
  return board;
}

test('analyzeMoveSituation ignores a routine opening move', () => {
  assert.equal(analyzeMoveSituation(createBoard(), { row: 7, col: 7 }), null);
});

test('analyzeMoveSituation detects an AI winning move', () => {
  const board = line(createBoard(), AI, 7, [3, 4, 5, 6]);
  assert.equal(analyzeMoveSituation(board, { row: 7, col: 7 }), 'win');
});

test('analyzeMoveSituation detects blocking a human winning move', () => {
  const board = line(createBoard(), HUMAN, 7, [3, 4, 5, 6]);
  assert.equal(analyzeMoveSituation(board, { row: 7, col: 7 }), 'block-win');
});

test('analyzeMoveSituation detects forming an open three', () => {
  const board = line(createBoard(), AI, 7, [6, 7]);
  assert.equal(analyzeMoveSituation(board, { row: 7, col: 8 }), 'attack-three');
});

test('analyzeMoveSituation detects blocking a human four', () => {
  const board = line(createBoard(), HUMAN, 7, [5, 6, 7]);
  assert.equal(analyzeMoveSituation(board, { row: 7, col: 8 }), 'block-four');
});

test('analyzeMoveSituation detects blocking a human open three', () => {
  const board = line(createBoard(), HUMAN, 7, [6, 7]);
  assert.equal(analyzeMoveSituation(board, { row: 7, col: 8 }), 'block-three');
});

test('analyzeMoveSituation detects forming a four', () => {
  const board = line(createBoard(), AI, 7, [5, 6, 7]);
  assert.equal(analyzeMoveSituation(board, { row: 7, col: 8 }), 'attack-four');
});
