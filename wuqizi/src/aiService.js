import { getAiMove } from './game.js';

export async function requestAiMove(board, level, { signal } = {}) {
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
  return getAiMove(board, level.depth);
}
