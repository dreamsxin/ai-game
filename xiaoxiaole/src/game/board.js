import { createRandom } from './random.js';
import { COLUMNS, ROWS } from './rules.js';
import { KINDS, tile } from './tiles.js';

export const key = (x, y) => `${x},${y}`;

export const inside = (board, x, y) => y >= 0 && y < board.length && x >= 0 && x < board[y].length;

export const at = (board, x, y) => (inside(board, x, y) ? board[y][x] : null);

export const cloneBoard = (board) => board.map((row) => [...row]);

export const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function swapCells(board, a, b) {
  const next = cloneBoard(board);
  next[a.y][a.x] = at(board, b.x, b.y);
  next[b.y][b.x] = at(board, a.x, a.y);
  return next;
}

// 横竖各扫一遍取 3 连以上的段，再把共用格子的段并成一组，L/T 形因此自然合并。
function findRuns(board) {
  const runs = [];
  const push = (cells, orientation) => {
    if (cells.length >= 3) runs.push({ kind: at(board, cells[0][0], cells[0][1]).kind, orientation, cells });
  };
  for (let y = 0; y < board.length; y += 1) {
    let start = 0;
    for (let x = 1; x <= board[y].length; x += 1) {
      const prev = at(board, x - 1, y);
      const cur = x < board[y].length ? at(board, x, y) : null;
      if (prev && cur && prev.kind === cur.kind) continue;
      if (prev) {
        const cells = [];
        for (let i = start; i < x; i += 1) cells.push([i, y]);
        push(cells, 'h');
      }
      start = x;
    }
  }
  const height = board.length;
  for (let x = 0; x < board[0].length; x += 1) {
    let start = 0;
    for (let y = 1; y <= height; y += 1) {
      const prev = at(board, x, y - 1);
      const cur = y < height ? at(board, x, y) : null;
      if (prev && cur && prev.kind === cur.kind) continue;
      if (prev) {
        const cells = [];
        for (let i = start; i < y; i += 1) cells.push([x, i]);
        push(cells, 'v');
      }
      start = y;
    }
  }
  return runs;
}

export function findMatches(board) {
  const runs = findRuns(board);
  if (!runs.length) return [];
  const byCell = new Map();
  runs.forEach((run, index) => {
    for (const [x, y] of run.cells) {
      const k = key(x, y);
      byCell.set(k, [...(byCell.get(k) ?? []), index]);
    }
  });

  const seen = new Set();
  const groups = [];
  runs.forEach((run, index) => {
    if (seen.has(index)) return;
    const stack = [index];
    const members = [];
    while (stack.length) {
      const current = stack.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      members.push(runs[current]);
      for (const [x, y] of runs[current].cells) {
        for (const neighbor of byCell.get(key(x, y))) {
          if (!seen.has(neighbor)) stack.push(neighbor);
        }
      }
    }
    const cells = [];
    const taken = new Set();
    for (const member of members) {
      for (const [x, y] of member.cells) {
        const k = key(x, y);
        if (taken.has(k)) continue;
        taken.add(k);
        cells.push([x, y]);
      }
    }
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const longest = members.reduce((best, m) => (m.cells.length > best.cells.length ? m : best));
    const orientations = new Set(members.map((m) => m.orientation));
    groups.push({
      kind: run.kind,
      cells,
      runs: members,
      runLength: longest.cells.length,
      orientation: longest.orientation,
      shape: orientations.size > 1 ? 'L' : 'line',
    });
  });
  return groups;
}

export const hasMatch = (board) => findMatches(board).length > 0;

// 特殊果实换到哪都能引爆，普通果实只有换出三连才算合法。
export function legalSwap(board, a, b) {
  if (!inside(board, a.x, a.y) || !inside(board, b.x, b.y) || !adjacent(a, b)) return false;
  const ta = at(board, a.x, a.y);
  const tb = at(board, b.x, b.y);
  if (!ta || !tb) return false;
  if (ta.special || tb.special) return true;
  return hasMatch(swapCells(board, a, b));
}

export function findMoves(board) {
  const moves = [];
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const b = { x: x + dx, y: y + dy };
        if (!inside(board, b.x, b.y)) continue;
        if (legalSwap(board, { x, y }, b)) moves.push({ a: { x, y }, b });
      }
    }
  }
  return moves;
}

// 特殊果实的波及范围：直线爆果扫整行整列，爆破果炸 3x3，彩虹果带走同色全场。
export function blastCells(board, x, y, special, kind) {
  const cells = [];
  if (special === 'row') {
    for (let i = 0; i < board[y].length; i += 1) cells.push({ x: i, y });
  } else if (special === 'col') {
    for (let i = 0; i < board.length; i += 1) cells.push({ x, y: i });
  } else if (special === 'bomb') {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (inside(board, x + dx, y + dy)) cells.push({ x: x + dx, y: y + dy });
      }
    }
  } else if (special === 'rainbow') {
    board.forEach((row, ry) => {
      row.forEach((t, rx) => {
        if (t && t.kind === kind) cells.push({ x: rx, y: ry });
      });
    });
  }
  return cells;
}

// 从若干起爆点向外滚雪球：踩到的特殊果实继续把自己的范围推进队列。
export function detonate(board, seeds, { rainbowKind } = {}) {
  const cleared = new Set();
  const cells = [];
  const specials = [];
  const queue = [...seeds];
  while (queue.length) {
    const spot = queue.shift();
    if (!inside(board, spot.x, spot.y)) continue;
    const k = key(spot.x, spot.y);
    if (cleared.has(k)) continue;
    const t = at(board, spot.x, spot.y);
    if (!t) continue;
    cleared.add(k);
    cells.push([spot.x, spot.y]);
    if (!t.special) continue;
    specials.push(t.special);
    const kind = t.special === 'rainbow' ? rainbowKind ?? t.kind : t.kind;
    for (const next of blastCells(board, spot.x, spot.y, t.special, kind)) queue.push(next);
  }
  cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { cells, specials };
}

export function clearCells(board, cells) {
  const next = cloneBoard(board);
  for (const [x, y] of cells) {
    if (inside(next, x, y)) next[y][x] = null;
  }
  return next;
}

// 每列把剩下的果实压到底部，空位留在列顶等补充。
export function collapse(board) {
  const next = cloneBoard(board);
  const drops = [];
  const columns = board[0].length;
  for (let x = 0; x < columns; x += 1) {
    let write = board.length - 1;
    for (let y = board.length - 1; y >= 0; y -= 1) {
      const t = next[y][x];
      if (!t) continue;
      if (write !== y) {
        next[write][x] = t;
        next[y][x] = null;
        drops.push({ x, from: y, to: write });
      }
      write -= 1;
    }
    for (let y = write; y >= 0; y -= 1) next[y][x] = null;
  }
  return { board: next, drops };
}

export function refill(board, randomState, kinds = KINDS) {
  const random = createRandom(randomState);
  const next = cloneBoard(board);
  const spawned = [];
  for (let y = 0; y < next.length; y += 1) {
    for (let x = 0; x < next[y].length; x += 1) {
      if (next[y][x]) continue;
      const kind = kinds[random.int(0, kinds.length - 1)];
      next[y][x] = tile(kind);
      spawned.push({ x, y, kind });
    }
  }
  return { board: next, randomState: random.save(), spawned };
}

// 开局逐格挑不会立刻凑成三连的果实，再确认至少有一步可走。
export function createBoard(randomState = 1, kinds = KINDS, columns = COLUMNS, rows = ROWS) {
  const random = createRandom(randomState);
  let board = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    board = Array.from({ length: rows }, () => Array.from({ length: columns }, () => null));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const banned = new Set();
        const left = at(board, x - 1, y);
        const left2 = at(board, x - 2, y);
        const up = at(board, x, y - 1);
        const up2 = at(board, x, y - 2);
        if (left && left2 && left.kind === left2.kind) banned.add(left.kind);
        if (up && up2 && up.kind === up2.kind) banned.add(up.kind);
        const pool = kinds.filter((kind) => !banned.has(kind));
        board[y][x] = tile(pool[random.int(0, pool.length - 1)]);
      }
    }
    if (!hasMatch(board) && findMoves(board).length > 0) break;
  }
  return { board, randomState: random.save() };
}

// 死局时原地打乱现有果实：先整盘洗牌，再把残留的三连逐个换掉，实在洗不出来才重新发牌。
export function shuffleBoard(board, randomState, kinds = KINDS) {
  const random = createRandom(randomState);
  const columns = board[0].length;
  const rows = board.length;
  const pool = board.flat();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let next = board.map((row, y) => row.map((_, x) => pool[y * columns + x]));
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const matches = findMatches(next);
    if (!matches.length && findMoves(next).length > 0) {
      return { board: next, randomState: random.save() };
    }
    const spot = matches.length
      ? matches[0].cells[random.int(0, matches[0].cells.length - 1)]
      : [random.int(0, columns - 1), random.int(0, rows - 1)];
    next = swapCells(
      next,
      { x: spot[0], y: spot[1] },
      { x: random.int(0, columns - 1), y: random.int(0, rows - 1) },
    );
  }
  return createBoard(random.save(), kinds, columns, rows);
}

// L/T 形的特殊果实落在两段的交点上，直线消除落在最长那段的中点。
export function groupOrigin(group) {
  if (group.shape === 'L') {
    const counts = new Map();
    for (const run of group.runs) {
      for (const [x, y] of run.cells) {
        const k = key(x, y);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    for (const [k, count] of counts) {
      if (count < 2) continue;
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    }
  }
  const longest = group.runs.reduce((best, run) => (run.cells.length > best.cells.length ? run : best));
  const [x, y] = longest.cells[Math.floor(longest.cells.length / 2)];
  return { x, y };
}
