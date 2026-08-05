const DEFAULT_TIMEOUT_MS = 5_000;

export class LlmError extends Error {
  constructor(message, { code = 'provider_error', status = 502, cause } = {}) {
    super(message, { cause });
    this.name = 'LlmError';
    this.code = code;
    this.status = status;
  }
}

function timeoutMs() {
  const value = Number(process.env.DEEPSEEK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

export function createLlmClient({ fetchImpl = globalThis.fetch } = {}) {
  async function generate({ messages, tools, maxTokens = 384, temperature = 0.25, signal: callerSignal }) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new LlmError('DEEPSEEK_API_KEY is not configured.', { code: 'not_configured', status: 503 });
    const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    const limit = timeoutMs();
    const deadline = AbortSignal.timeout(limit);
    const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    let response;
    try {
      signal.throwIfAborted();
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ model, messages, tools, max_tokens: maxTokens, temperature }),
      });
    } catch (error) {
      if (callerSignal?.aborted) throw new LlmError('AI request cancelled.', { code: 'cancelled', status: 499, cause: error });
      if (deadline.aborted) throw new LlmError(`DeepSeek timed out after ${limit}ms.`, { code: 'timeout', status: 504, cause: error });
      throw new LlmError('Could not reach DeepSeek.', { cause: error });
    }
    if (!response.ok) throw new LlmError(`DeepSeek returned ${response.status}.`);
    let payload;
    try { payload = await response.json(); }
    catch (error) { throw new LlmError('DeepSeek returned invalid JSON.', { cause: error }); }
    const choice = payload.choices?.[0];
    if (!choice) throw new LlmError('DeepSeek returned no choice.');
    if (choice.finish_reason === 'length') throw new LlmError('DeepSeek response was truncated.');
    return { choice, model };
  }
  return { generate };
}
