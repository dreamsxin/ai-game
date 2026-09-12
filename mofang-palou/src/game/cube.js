// 三维砖阵：N×N×N 的魔方塔。全是纯函数，入参出参都是普通对象，不碰 DOM 也不碰 three。
//
// 一层是一个长度 N*N 的数组，下标 row*N+col；整座塔是 N 个这样的层。
// 一块砖是六位门掩码（见 rules.js）。两块砖相邻要**两头同时开门**才通 ——
// 上下方向也一样，所以楼层之间不需要额外的「垫子」概念，就是普通的门。
//
// 一条重要的不对称：**推移会绕回，连通不会绕回**。
// 推一整行，掉出边界的砖从对面进来；但走位时最边上那块砖的外侧门是墙，
// 走不到对面去。这条不对称是有意的：绕回让「推」有回旋余地，不绕回让「路」看得懂。
import { DIRECTIONS, OPPOSITE, AXIS_COL, AXIS_PILLAR, AXIS_ROW, cellKey } from './rules.js';

export function createCube(order) {
  const size = order * order;
  return {
    order,
    tiles: Array.from({ length: order }, () => new Array(size).fill(0)),
  };
}

export const cloneCube = (cube) => ({
  order: cube.order,
  tiles: cube.tiles.map((layer) => layer.slice()),
});

const indexOf = (cube, col, row) => row * cube.order + col;

export const inFloor = (cube, col, row) =>
  col >= 0 && col < cube.order && row >= 0 && row < cube.order;

export const inCube = (cube, layer, col, row) =>
  layer >= 0 && layer < cube.order && inFloor(cube, col, row);

export const tileAt = (cube, layer, col, row) =>
  inCube(cube, layer, col, row) ? cube.tiles[layer][indexOf(cube, col, row)] : 0;

export function setTile(cube, layer, col, row, tile) {
  if (!inCube(cube, layer, col, row)) return cube;
  cube.tiles[layer][indexOf(cube, col, row)] = tile;
  return cube;
}

/** 开一扇门就得开两扇：这一格朝某个方向，对面那格朝回来。只开一半等于没开。 */
export function openDoor(cube, layer, col, row, direction) {
  const { bit, dc, dr, dl } = DIRECTIONS[direction];
  const toLayer = layer + dl;
  const toCol = col + dc;
  const toRow = row + dr;
  if (!inCube(cube, layer, col, row) || !inCube(cube, toLayer, toCol, toRow)) return false;
  setTile(cube, layer, col, row, tileAt(cube, layer, col, row) | bit);
  const back = DIRECTIONS[OPPOSITE[direction]].bit;
  setTile(cube, toLayer, toCol, toRow, tileAt(cube, toLayer, toCol, toRow) | back);
  return true;
}

/** 这一格能直接走到哪几格。六个方向都查，要两头同时开门，且不越界（连通不绕回）。 */
export function connectedNeighbours(cube, cell) {
  const tile = tileAt(cube, cell.layer, cell.col, cell.row);
  const found = [];
  for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
    const { bit, dc, dr, dl } = DIRECTIONS[direction];
    if ((tile & bit) === 0) continue;
    const layer = cell.layer + dl;
    const col = cell.col + dc;
    const row = cell.row + dr;
    if (!inCube(cube, layer, col, row)) continue;
    if ((tileAt(cube, layer, col, row) & DIRECTIONS[OPPOSITE[direction]].bit) === 0) continue;
    found.push({ layer, col, row });
  }
  return found;
}

/** 从一格洪泛整张图。distance 是 cellKey → 步数，previous 用来回溯路径。 */
export function floodFrom(cube, origin) {
  const distance = new Map([[cellKey(origin), 0]]);
  const previous = new Map();
  let frontier = [origin];
  while (frontier.length > 0) {
    const next = [];
    for (const cell of frontier) {
      const step = distance.get(cellKey(cell)) + 1;
      for (const neighbour of connectedNeighbours(cube, cell)) {
        const key = cellKey(neighbour);
        if (distance.has(key)) continue;
        distance.set(key, step);
        previous.set(key, cell);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return { distance, previous };
}

export const canReach = (cube, from, to) =>
  floodFrom(cube, from).distance.has(cellKey(to));

/** 最短路径，含起点和终点；走不到返回 null。 */
export function pathBetween(cube, from, to) {
  const { distance, previous } = floodFrom(cube, from);
  if (!distance.has(cellKey(to))) return null;
  const path = [to];
  let cursor = to;
  while (cellKey(cursor) !== cellKey(from)) {
    cursor = previous.get(cellKey(cursor));
    path.push(cursor);
  }
  return path.reverse();
}

// ── 推移 ────────────────────────────────────────────────────────────────
// 一条线由「锚点格 + 轴」确定：线上的格子跟锚点共享另外两维。
// 三条线族在魔方里长度都是 order，所以下面的绕回都用同一个模。

/** 这一格在不在这条线上。 */
export function onLine(axis, anchor, cell) {
  if (axis === AXIS_ROW) return cell.layer === anchor.layer && cell.row === anchor.row;
  if (axis === AXIS_COL) return cell.layer === anchor.layer && cell.col === anchor.col;
  return cell.col === anchor.col && cell.row === anchor.row;
}

/** 线上的格子，按推移方向排好序。第 i 个的坐标就是沿轴走 i 步。 */
export function lineCells(cube, axis, anchor) {
  const cells = [];
  for (let step = 0; step < cube.order; step += 1) {
    if (axis === AXIS_ROW) cells.push({ layer: anchor.layer, col: step, row: anchor.row });
    else if (axis === AXIS_COL) cells.push({ layer: anchor.layer, col: anchor.col, row: step });
    else cells.push({ layer: step, col: anchor.col, row: anchor.row });
  }
  return cells;
}

/** 这一格沿轴的下标：行看 col，列看 row，柱看 layer。 */
export const stepOf = (axis, cell) =>
  axis === AXIS_ROW ? cell.col : axis === AXIS_COL ? cell.row : cell.layer;

/** 把沿轴的下标写回去，得到一个新格子。 */
export const withStep = (axis, cell, step) =>
  axis === AXIS_ROW
    ? { ...cell, col: step }
    : axis === AXIS_COL
      ? { ...cell, row: step }
      : { ...cell, layer: step };

const wrap = (value, length) => ((value % length) + length) % length;

/**
 * 推一整条线，返回新塔（原塔不动）。掉出去的砖从对面绕回来。
 * 砖只平移，六位门掩码原样带着走 —— 推移不是旋转，门朝向不变。
 */
export function shiftLine(cube, axis, anchor, dir) {
  const next = cloneCube(cube);
  const cells = lineCells(cube, axis, anchor);
  const carried = cells.map((cell) => tileAt(cube, cell.layer, cell.col, cell.row));
  for (let step = 0; step < cells.length; step += 1) {
    const target = cells[wrap(step + dir, cells.length)];
    setTile(next, target.layer, target.col, target.row, carried[step]);
  }
  return next;
}

/**
 * 一个格子被这次推移带到哪。不在线上就原样返回。
 * 玩家、出口都长在砖上，所以两者都走这一个函数，不存在两套位移逻辑。
 */
export function shiftCell(cube, cell, axis, anchor, dir) {
  if (!cell || !onLine(axis, anchor, cell)) return cell;
  return withStep(axis, cell, wrap(stepOf(axis, cell) + dir, cube.order));
}

/**
 * 局面指纹：砖面 + 玩家 + 出口。三样都要进 ——
 * 玩家和出口都会跟着推移走，少任何一维都会把不同局面当成同一个剪掉。
 */
export const cubeSignature = (cube, player, exit) =>
  `${cube.tiles.map((layer) => layer.join(',')).join('|')}#${cellKey(player)}>${cellKey(exit)}`;


