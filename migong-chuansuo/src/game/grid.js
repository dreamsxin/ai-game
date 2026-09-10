// 纯网格代数：砖块整数数组的推移与连通性判定，不含任何游戏流程。
import { DIRECTIONS, OPPOSITE, WARP, AXIS_ROW, cellKey } from './rules.js';

export const createBoard = (cols, rows, layers) => ({
  cols,
  rows,
  layers,
  tiles: Array.from({ length: layers }, () => new Array(cols * rows).fill(0)),
});

export const cloneBoard = (board) => ({
  cols: board.cols,
  rows: board.rows,
  layers: board.layers,
  tiles: board.tiles.map((layer) => layer.slice()),
});

export const inBounds = (board, col, row) =>
  col >= 0 && col < board.cols && row >= 0 && row < board.rows;

export const tileAt = (board, layer, col, row) => board.tiles[layer][row * board.cols + col];

export const setTile = (board, layer, col, row, tile) => {
  board.tiles[layer][row * board.cols + col] = tile;
};

// 双向开门：门必须成对出现，否则连通性判定会把单边门当成墙。
export function openDoor(board, layer, col, row, direction) {
  const { bit, dc, dr } = DIRECTIONS[direction];
  const nc = col + dc;
  const nr = row + dr;
  if (!inBounds(board, nc, nr)) return false;
  setTile(board, layer, col, row, tileAt(board, layer, col, row) | bit);
  const back = DIRECTIONS[OPPOSITE[direction]].bit;
  setTile(board, layer, nc, nr, tileAt(board, layer, nc, nr) | back);
  return true;
}

export const lineLength = (board, axis) => (axis === AXIS_ROW ? board.cols : board.rows);

// 一次推移只动一层的一整行或一整列，越界的那块从对面回来。
export function shiftLine(board, layer, axis, index, dir) {
  const next = cloneBoard(board);
  const length = lineLength(board, axis);
  const step = ((dir % length) + length) % length;
  if (step === 0) return next;
  const target = next.tiles[layer];
  const source = board.tiles[layer];
  for (let position = 0; position < length; position += 1) {
    const moved = (position + step) % length;
    const from = axis === AXIS_ROW ? index * board.cols + position : position * board.cols + index;
    const to = axis === AXIS_ROW ? index * board.cols + moved : moved * board.cols + index;
    target[to] = source[from];
  }
  return next;
}

// 站在被推的行列上就跟着砖一起走，这是 warpshift 里唯一的「免费位移」。
export function shiftCell(board, cell, layer, axis, index, dir) {
  if (cell.layer !== layer) return cell;
  const onLine = axis === AXIS_ROW ? cell.row === index : cell.col === index;
  if (!onLine) return cell;
  const length = lineLength(board, axis);
  const step = ((dir % length) + length) % length;
  if (axis === AXIS_ROW) return { ...cell, col: (cell.col + step) % length };
  return { ...cell, row: (cell.row + step) % length };
}

// 邻接要两边同时开门；跃迁垫也要上下两层同时是垫子才接得上。
export function connectedNeighbours(board, cell) {
  const tile = tileAt(board, cell.layer, cell.col, cell.row);
  const found = [];
  for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
    const { bit, dc, dr } = DIRECTIONS[direction];
    if ((tile & bit) === 0) continue;
    const col = cell.col + dc;
    const row = cell.row + dr;
    if (!inBounds(board, col, row)) continue;
    if ((tileAt(board, cell.layer, col, row) & DIRECTIONS[OPPOSITE[direction]].bit) === 0) continue;
    found.push({ layer: cell.layer, col, row });
  }
  if ((tile & WARP) !== 0) {
    for (const delta of [-1, 1]) {
      const layer = cell.layer + delta;
      if (layer < 0 || layer >= board.layers) continue;
      if ((tileAt(board, layer, cell.col, cell.row) & WARP) === 0) continue;
      found.push({ layer, col: cell.col, row: cell.row });
    }
  }
  return found;
}

// BFS 一次跑完，既给可达集合也给前驱表，走位和高亮共用同一份结果。
export function floodFrom(board, origin) {
  const distance = new Map([[cellKey(origin), 0]]);
  const previous = new Map();
  const queue = [origin];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    const base = distance.get(cellKey(cell));
    for (const next of connectedNeighbours(board, cell)) {
      const key = cellKey(next);
      if (distance.has(key)) continue;
      distance.set(key, base + 1);
      previous.set(key, cell);
      queue.push(next);
    }
  }
  return { distance, previous };
}

export const reachableFrom = (board, origin) => floodFrom(board, origin).distance;

export const canReach = (board, origin, goal) =>
  floodFrom(board, origin).distance.has(cellKey(goal));

// 返回含起点和终点的完整路径，走不到就是 null。
export function pathBetween(board, origin, goal) {
  const { distance, previous } = floodFrom(board, origin);
  if (!distance.has(cellKey(goal))) return null;
  const path = [goal];
  let cursor = goal;
  while (!(cursor.layer === origin.layer && cursor.col === origin.col && cursor.row === origin.row)) {
    cursor = previous.get(cellKey(cursor));
    path.push(cursor);
  }
  return path.reverse();
}

// 解算器的状态指纹：砖面加站位，同一局面只展开一次。
export const boardSignature = (board, cell) =>
  `${board.tiles.map((layer) => layer.join(',')).join('|')}#${cellKey(cell)}`;
