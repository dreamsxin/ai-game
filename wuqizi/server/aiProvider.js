const SIZE = 15;

function serializeBoard(board) {
  return board.map((row, index) => `${String(index).padStart(2, '0')}: ${row.map(cell => cell === 1 ? 'X' : cell === 2 ? 'O' : '.').join('')}`).join('\n');
}

function parseMove(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const objectText = fenced.match(/\{[\s\S]*?\}/)?.[0];
  if (!objectText) throw new Error('AI response did not contain a JSON move.');
  const value = JSON.parse(objectText);
  return { row: Number(value.row), col: Number(value.col) };
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

export async function requestDeepSeekMove({ board, difficulty = 0, reasoningDepth = 1 }) {
  if (!validateBoard(board)) throw new Error('Invalid 15x15 board.');
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured.');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      temperature: Math.max(0.05, 0.35 - difficulty * 0.08),
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是五子棋引擎。棋盘为15x15，X是玩家黑棋，O是你的白棋，.为空位。你必须选择一个空位，只返回JSON对象 {"row":整数,"col":整数}，坐标从0开始。优先取胜，其次阻止玩家立即取胜。',
        },
        {
          role: 'user',
          content: `难度等级：${difficulty + 1}；目标推演深度：${reasoningDepth}层。请给出白棋下一步。\n${serializeBoard(board)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`DeepSeek returned ${response.status}: ${detail}`);
  }
  const payload = await response.json();
  const message = payload.choices?.[0]?.message;
  const text = message?.content || message?.reasoning_content;
  const move = parseMove(text || '');
  if (!isLegalMove(board, move)) throw new Error('DeepSeek returned an illegal move.');
  return { ...move, provider: 'deepseek', model };
}
