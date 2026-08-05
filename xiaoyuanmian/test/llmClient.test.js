import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlmClient, LlmError } from '../server/llmClient.js';

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('llm client sends tools and returns the first choice', async t => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  let body;
  const client = createLlmClient({ fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [] } }] }));
  } });
  t.after(() => restoreEnv('DEEPSEEK_API_KEY', previousKey));
  const result = await client.generate({ messages: [], tools: [{ type: 'function' }] });
  assert.equal(result.model, 'deepseek-v4-flash');
  assert.equal(body.tools.length, 1);
});

test('llm client reports missing configuration', async t => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  t.after(() => restoreEnv('DEEPSEEK_API_KEY', previousKey));
  await assert.rejects(
    createLlmClient().generate({ messages: [] }),
    error => error instanceof LlmError && error.code === 'not_configured',
  );
});
