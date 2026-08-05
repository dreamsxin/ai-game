export const SIZE = 15;
export const EMPTY = 0;
export const HUMAN = 1;
export const AI = 2;

export const LEVELS = [
  { id: 0, name: '入门', subtitle: '试探者', depth: 1, threshold: 0, win: 30 },
  { id: 1, name: '进阶', subtitle: '思考者', depth: 2, threshold: 100, win: 45 },
  { id: 2, name: '高手', subtitle: '博弈者', depth: 3, threshold: 260, win: 70 },
  { id: 3, name: '大师', subtitle: '守擂人', depth: 4, threshold: 520, win: 100 },
];

export const createBoard = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));

const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function checkWin(board, row, col, player) {
  if (row == null || col == null) return false;
  return directions.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r][c] === player) {
        count++; r += dr * sign; c += dc * sign;
      }
    }
    return count >= 5;
  });
}

export function analyzeMoveSituation(board, move, player = AI, opponent = player === AI ? HUMAN : AI) {
  if (!Array.isArray(board) || !isOnBoard(move?.row, move?.col) || board[move.row][move.col] !== EMPTY) return null;
  const copy = board.map(row => [...row]);
  copy[move.row][move.col] = player;

  if (checkWin(copy, move.row, move.col, player)) return 'win';
  const opponentWinning = threatMoves(board, opponent, 5);
  if (opponentWinning.includes(`${move.row},${move.col}`)) return 'block-win';

  const ownThreat = lineThreatLevel(copy, move.row, move.col, player);
  if (ownThreat >= 4) return 'attack-four';
  const opponentFour = threatMoves(board, opponent, 4);
  if (opponentFour.includes(`${move.row},${move.col}`)) return 'block-four';
  if (ownThreat >= 3) return 'attack-three';
  const opponentThree = threatMoves(board, opponent, 3);
  if (opponentThree.includes(`${move.row},${move.col}`)) return 'block-three';
  return null;
}

function isOnBoard(row, col) {
  return Number.isInteger(row) && row >= 0 && row < SIZE && Number.isInteger(col) && col >= 0 && col < SIZE;
}

function lineThreatLevel(board, row, col, player) {
  let best = 0;
  for (const [dr, dc] of directions) {
    let count = 1;
    let open = 0;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (isOnBoard(r, c) && board[r][c] === player) {
        count++; r += dr * sign; c += dc * sign;
      }
      if (isOnBoard(r, c) && board[r][c] === EMPTY) open++;
    }
    if (count >= 5) best = Math.max(best, 5);
    else if (count === 4) best = Math.max(best, 4);
    else if (count === 3 && open === 2) best = Math.max(best, 3);
  }
  return best;
}

function threatMoves(board, player, minimumLevel) {
  const result = [];
  for (let row = 0; row < SIZE; row++) for (let col = 0; col < SIZE; col++) {
    if (board[row][col] !== EMPTY) continue;
    const copy = board.map(line => [...line]);
    copy[row][col] = player;
    const level = checkWin(copy, row, col, player) ? 5 : lineThreatLevel(copy, row, col, player);
    if (level >= minimumLevel) result.push(`${row},${col}`);
  }
  return result;
}

function lineScore(count, open) {
  if (count >= 5) return 1_000_000;
  if (count === 4 && open === 2) return 100_000;
  if (count === 4 && open === 1) return 15_000;
  if (count === 3 && open === 2) return 8_000;
  if (count === 3 && open === 1) return 800;
  if (count === 2 && open === 2) return 300;
  if (count === 2 && open === 1) return 40;
  return count * (open + 1);
}

function evaluatePlayer(board, player) {
  let total = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== player) continue;
    for (const [dr, dc] of directions) {
      const pr = r - dr, pc = c - dc;
      if (pr >= 0 && pr < SIZE && pc >= 0 && pc < SIZE && board[pr][pc] === player) continue;
      let count = 0, rr = r, cc = c;
      while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === player) {
        count++; rr += dr; cc += dc;
      }
      let open = 0;
      if (pr >= 0 && pr < SIZE && pc >= 0 && pc < SIZE && board[pr][pc] === EMPTY) open++;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === EMPTY) open++;
      total += lineScore(count, open);
    }
  }
  return total;
}

function evaluate(board) {
  return evaluatePlayer(board, AI) - evaluatePlayer(board, HUMAN) * 1.08;
}

function candidates(board, limit = 10) {
  const result = [];
  let hasStone = false;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] !== EMPTY) hasStone = true;
  if (!hasStone) return [{ row: 7, col: 7, priority: 0 }];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== EMPTY) continue;
    let nearby = false;
    for (let dr = -2; dr <= 2 && !nearby; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] !== EMPTY) { nearby = true; break; }
    }
    if (!nearby) continue;
    board[r][c] = AI; const attack = evaluatePlayer(board, AI); board[r][c] = HUMAN;
    const defend = evaluatePlayer(board, HUMAN); board[r][c] = EMPTY;
    result.push({ row: r, col: c, priority: attack + defend * 1.12 });
  }
  return result.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

function minimax(board, depth, alpha, beta, maximizing, last) {
  if (last && checkWin(board, last.row, last.col, last.player)) return last.player === AI ? 2_000_000 + depth : -2_000_000 - depth;
  if (depth === 0) return evaluate(board);
  const moves = candidates(board, depth >= 3 ? 7 : 9);
  if (!moves.length) return 0;
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      board[move.row][move.col] = AI;
      best = Math.max(best, minimax(board, depth - 1, alpha, beta, false, { ...move, player: AI }));
      board[move.row][move.col] = EMPTY; alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    board[move.row][move.col] = HUMAN;
    best = Math.min(best, minimax(board, depth - 1, alpha, beta, true, { ...move, player: HUMAN }));
    board[move.row][move.col] = EMPTY; beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export async function getAiMove(board, depth) {
  const available = candidates(board, depth >= 3 ? 8 : 11);
  for (const player of [AI, HUMAN]) {
    const winning = available.find(m => {
      board[m.row][m.col] = player;
      const win = checkWin(board, m.row, m.col, player);
      board[m.row][m.col] = EMPTY;
      return win;
    });
    if (winning) return winning;
  }
  let bestMove = available[0], bestScore = -Infinity;
  for (const move of available) {
    board[move.row][move.col] = AI;
    const score = minimax(board, Math.max(0, depth - 1), -Infinity, Infinity, false, { ...move, player: AI });
    board[move.row][move.col] = EMPTY;
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }
  return bestMove;
}
