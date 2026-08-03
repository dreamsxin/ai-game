import assert from 'node:assert/strict';
import test from 'node:test';
import { AiProviderError, parseAiMove, requestDeepSeekMove } from '../server/aiProvider.js';

function createBoard() {
  return Array.from({ length: 15 }, () => Array(15).fill(0));
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('parseAiMove reads place_gomoku_stone tool arguments', () => {
  const move = parseAiMove({
    content: '',
    tool_calls: [{
      type: 'function',
      function: { name: 'place_gomoku_stone', arguments: '{"row":7,"col":8}' },
    }],
  });
  assert.deepEqual(move, { row: 7, col: 8 });
});

test('parseAiMove falls back to fenced content JSON', () => {
  assert.deepEqual(parseAiMove({ content: '```json\n{"row": 5, "col": 6}\n```' }), { row: 5, col: 6 });
});

test('parseAiMove rejects pseudo JSON instead of reading reasoning content', () => {
  assert.throws(
    () => parseAiMove({ content: '{"row":..., "col":...}', reasoning_content: '{"row":7,"col":7}' }),
    error => error instanceof AiProviderError && /invalid JSON content/.test(error.message),
  );
});

test('requestDeepSeekMove sends tools and accepts a legal tool call', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse({
      choices: [{ message: {
        tool_calls: [{ function: { name: 'place_gomoku_stone', arguments: '{"row":7,"col":7}' } }],
      } }],
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('DEEPSEEK_API_KEY', originalKey);
  });

  const move = await requestDeepSeekMove({ board: createBoard(), difficulty: 2, reasoningDepth: 3 });
  assert.deepEqual(move, { row: 7, col: 7, provider: 'deepseek', model: 'deepseek-v4-flash' });
  assert.equal(requestBody.tools[0].function.name, 'place_gomoku_stone');
  assert.equal(requestBody.tool_choice, undefined);
  assert.equal(requestBody.response_format, undefined);
  assert.equal(requestBody.max_tokens, 512);
});

test('requestDeepSeekMove rejects an occupied position', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  globalThis.fetch = async () => jsonResponse({
    choices: [{ message: {
      tool_calls: [{ function: { name: 'place_gomoku_stone', arguments: '{"row":7,"col":7}' } }],
    } }],
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('DEEPSEEK_API_KEY', originalKey);
  });

  const board = createBoard();
  board[7][7] = 1;
  await assert.rejects(
    requestDeepSeekMove({ board }),
    error => error instanceof AiProviderError && /illegal move/.test(error.message),
  );
});

test('requestDeepSeekMove distinguishes caller cancellation', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('DEEPSEEK_API_KEY', originalKey);
  });

  const controller = new AbortController();
  const pending = requestDeepSeekMove({ board: createBoard() }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error instanceof AiProviderError && error.code === 'cancelled');
});

test('requestDeepSeekMove reports its configured timeout', async t => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalTimeout = process.env.DEEPSEEK_TIMEOUT_MS;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.DEEPSEEK_TIMEOUT_MS = '10';
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv('DEEPSEEK_API_KEY', originalKey);
    restoreEnv('DEEPSEEK_TIMEOUT_MS', originalTimeout);
  });

  await assert.rejects(
    requestDeepSeekMove({ board: createBoard() }),
    error => error instanceof AiProviderError && error.code === 'timeout' && error.status === 504,
  );
});
