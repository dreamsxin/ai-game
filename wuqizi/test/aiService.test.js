import assert from 'node:assert/strict';
import test from 'node:test';
import { requestAiMove } from '../src/aiService.js';
import { createBoard } from '../src/game.js';

const level = { id: 0, depth: 1 };

test('requestAiMove returns a legal local move after an HTTP failure', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 504 });
  t.after(() => { globalThis.fetch = originalFetch; });

  const board = createBoard();
  board[7][7] = 1;
  const move = await requestAiMove(board, level);
  assert.equal(Number.isInteger(move.row), true);
  assert.equal(Number.isInteger(move.col), true);
  assert.equal(board[move.row][move.col], 0);
});

test('requestAiMove does not run the local engine after cancellation', async t => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}');
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestAiMove(createBoard(), level, { signal: controller.signal }),
    error => error.name === 'AbortError',
  );
  assert.equal(fetchCalled, false);
});
