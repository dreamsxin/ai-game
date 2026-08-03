import { getAiMove } from './game';

export async function requestAiMove(board, level) {
  try {
    const response = await fetch('/api/mcp/gomoku/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  } catch (error) {
    console.warn('MCP AI unavailable, using the local engine.', error);
  }

  return getAiMove(board, level.depth);
}
