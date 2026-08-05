import assert from 'node:assert/strict';
import test from 'node:test';
import { requestAiMove, requestChatMessage } from '../src/aiService.js';
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
  assert.equal(move.provider, 'local');
});

test('requestAiMove sends recent automatic comments', async t => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ row: 7, col: 7, comment: '' }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await requestAiMove(createBoard(), level, { recentComments: ['这条三连开始有威胁了。'] });
  assert.deepEqual(requestBody.recentComments, ['这条三连开始有威胁了。']);
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

test('requestChatMessage returns an assistant response', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    return new Response(JSON.stringify({ message: '我会先守住中心。' }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await requestChatMessage({ message: '你在想什么？', board: createBoard() });
  assert.equal(result.message, '我会先守住中心。');
});

test('requestChatMessage preserves cancellation', async t => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestChatMessage({ message: '你好', board: createBoard() }, { signal: controller.signal }),
    error => error.name === 'AbortError',
  );
  assert.equal(called, false);
});
