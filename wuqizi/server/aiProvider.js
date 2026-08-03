const SIZE = 15;
const DEFAULT_TIMEOUT_MS = 5_000;
const MOVE_TOOL_NAME = 'place_gomoku_stone';

const moveTool = {
  type: 'function',
  function: {
    name: MOVE_TOOL_NAME,
    description: '选择 AI 白棋下一步的合法落子位置。',
    parameters: {
      type: 'object',
      properties: {
        row: { type: 'integer', minimum: 0, maximum: SIZE - 1, description: '落子的行坐标。' },
        col: { type: 'integer', minimum: 0, maximum: SIZE - 1, description: '落子的列坐标。' },
      },
      required: ['row', 'col'],
      additionalProperties: false,
    },
  },
};

export class AiProviderError extends Error {
  constructor(message, { code = 'provider_error', status = 502, cause } = {}) {
    super(message, { cause });
    this.name = 'AiProviderError';
    this.code = code;
    this.status = status;
  }
}

function serializeBoard(board) {
  return board.map((row, index) => `${String(index).padStart(2, '0')}: ${row.map(cell => cell === 1 ? 'X' : cell === 2 ? 'O' : '.').join('')}`).join('\n');
}

function normalizeMove(value) {
  return { row: Number(value?.row), col: Number(value?.col) };
}

function parseJsonMove(value, source) {
  try {
    return normalizeMove(typeof value === 'string' ? JSON.parse(value) : value);
  } catch (error) {
    throw new AiProviderError(`DeepSeek returned invalid ${source}.`, { cause: error });
  }
}

function parseContentMove(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const objectText = fenced.match(/\{[\s\S]*?\}/)?.[0];
  if (!objectText) throw new AiProviderError('DeepSeek response did not contain a move.');
  return parseJsonMove(objectText, 'JSON content');
}

export function parseAiMove(message) {
  const toolCall = message?.tool_calls?.find(call => call?.function?.name === MOVE_TOOL_NAME);
  if (toolCall) return parseJsonMove(toolCall.function.arguments, 'tool arguments');
  if (typeof message?.content === 'string' && message.content.trim()) return parseContentMove(message.content);
  throw new AiProviderError('DeepSeek did not return a move or call the move tool.');
}

function validateBoard(board) {
  return Array.isArray(board) && board.length === SIZE && board.every(row =>
    Array.isArray(row) && row.length === SIZE && row.every(cell => [0, 1, 2].includes(cell))
  );
}

export function isLegalMove(board, move) {
  return validateBoard(board) && Number.isInteger(move?.row) && Number.isInteger(move?.col) &&
    move.row >= 0 && move.row < SIZE && move.col >= 0 && move.col < SIZE && board[move.row][move.col] === 0;
}

function getTimeoutMs() {
  const configured = Number(process.env.DEEPSEEK_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

export async function requestDeepSeekMove({ board, difficulty = 0, reasoningDepth = 1 }, { signal: callerSignal } = {}) {
  if (!validateBoard(board)) {
    throw new AiProviderError('Invalid 15x15 board.', { code: 'invalid_input', status: 400 });
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new AiProviderError('DEEPSEEK_API_KEY is not configured.', { code: 'not_configured', status: 503 });
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const timeoutMs = getTimeoutMs();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
  let response;

  try {
    signal.throwIfAborted();
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model,
        temperature: Math.max(0.05, 0.35 - difficulty * 0.08),
        max_tokens: 512,
        messages: [
          {
            role: 'system',
            content: `你是五子棋引擎。棋盘为15x15，X是玩家黑棋，O是你的白棋，.为空位。你必须调用 ${MOVE_TOOL_NAME} 选择一个空位。优先取胜，其次阻止玩家立即取胜；不要用普通文本回答。`,
          },
          {
            role: 'user',
            content: `难度等级：${difficulty + 1}；目标推演深度：${reasoningDepth}层。请给出白棋下一步。\n${serializeBoard(board)}`,
          },
        ],
        tools: [moveTool],
      }),
    });
  } catch (error) {
    if (callerSignal?.aborted) {
      throw new AiProviderError('AI request was cancelled.', { code: 'cancelled', status: 499, cause: error });
    }
    if (timeoutSignal.aborted) {
      throw new AiProviderError(`DeepSeek timed out after ${timeoutMs}ms.`, { code: 'timeout', status: 504, cause: error });
    }
    throw new AiProviderError('Could not reach DeepSeek.', { cause: error });
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new AiProviderError(`DeepSeek returned ${response.status}: ${detail}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new AiProviderError('DeepSeek returned an invalid response.', { cause: error });
  }

  const choice = payload.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new AiProviderError('DeepSeek response was truncated before returning a complete move.');
  }
  const move = parseAiMove(choice?.message);
  if (!isLegalMove(board, move)) throw new AiProviderError('DeepSeek returned an illegal move.');
  return { ...move, provider: 'deepseek', model };
}
