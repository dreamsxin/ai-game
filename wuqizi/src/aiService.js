import { analyzeMoveSituation, getAiMove } from './game.js';

export async function requestAiMove(board, level, { signal, recentComments = [] } = {}) {
  try {
    signal?.throwIfAborted();
    const response = await fetch('/api/mcp/gomoku/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        board,
        difficulty: level.id,
        reasoningDepth: level.depth,
        recentComments,
      }),
    });
    if (!response.ok) throw new Error(`MCP gateway failed: ${response.status}`);
    const move = await response.json();
    if (Number.isInteger(move.row) && Number.isInteger(move.col) && board[move.row]?.[move.col] === 0) {
      return move;
    }
    throw new Error('MCP gateway returned an illegal move.');
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('MCP AI unavailable, using the local engine.', error);
  }

  signal?.throwIfAborted();
  const move = await getAiMove(board, level.depth);
  const situation = analyzeMoveSituation(board, move);
  return { ...move, provider: 'local', situation, comment: '' };
}

export async function requestChatMessage(input, { signal } = {}) {
  signal?.throwIfAborted();
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = new Error(`Chat request failed: ${response.status}`);
    error.code = (await response.json().catch(() => null))?.code;
    throw error;
  }
  const result = await response.json();
  if (typeof result.message !== 'string' || !result.message.trim()) throw new Error('Chat response was empty.');
  return result;
}
