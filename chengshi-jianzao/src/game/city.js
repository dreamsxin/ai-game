// 城市网格：地形、建筑占位、路网连通。这一层只管「摆得下吗、连得上吗」，不算钱也不算人。
import {
  DEMOLISH_COST,
  EMPTY,
  NEIGHBOURS,
  ROAD,
  TERRAIN_FOREST,
  TERRAIN_GRASS,
  TERRAIN_WATER,
  buildingOf,
  isBuildable,
  terrainCost,
} from './rules.js';

export function createCity(cols, rows, terrain = null) {
  const size = cols * rows;
  return {
    cols,
    rows,
    terrain: terrain ? Int8Array.from(terrain) : new Int8Array(size),
    build: new Array(size).fill(EMPTY),
    // 城门：地图边缘的一格路，路网必须连回这里才算通车。
    entrance: 0,
  };
}

export const indexOf = (city, col, row) => row * city.cols + col;
export const colOf = (city, index) => index % city.cols;
export const rowOf = (city, index) => Math.floor(index / city.cols);
export const inBounds = (city, col, row) =>
  col >= 0 && col < city.cols && row >= 0 && row < city.rows;

// 越界当水面处理：判定代码就不用到处写边界分支。
export const terrainAt = (city, col, row) =>
  (inBounds(city, col, row) ? city.terrain[indexOf(city, col, row)] : TERRAIN_WATER);
export const buildAt = (city, col, row) =>
  (inBounds(city, col, row) ? city.build[indexOf(city, col, row)] : EMPTY);

export const cloneCity = (city) => ({
  ...city,
  terrain: Int8Array.from(city.terrain),
  build: city.build.slice(),
});

/** 判断能否落一栋，同时算出这一格的实际花费（林地要加清场费）。 */
export function canPlace(city, col, row, id) {
  const building = buildingOf(id);
  if (!building) return { ok: false, reason: '没有选中建筑', cost: 0 };
  if (!inBounds(city, col, row)) return { ok: false, reason: '超出地界', cost: 0 };
  const terrain = terrainAt(city, col, row);
  if (!isBuildable(terrain)) return { ok: false, reason: '水面上盖不了东西', cost: 0 };
  const cost = building.cost + terrainCost(terrain);
  const current = buildAt(city, col, row);
  if (current === id) return { ok: false, reason: `这里已经是${building.name}`, cost };
  if (current !== EMPTY) {
    return { ok: false, reason: `先拆掉${buildingOf(current).name}`, cost };
  }
  return { ok: true, reason: '', cost };
}

/** 落一栋，顺手把林地变成平地。调用方负责先过 canPlace 和钱。 */
export function place(city, col, row, id) {
  const next = cloneCity(city);
  const index = indexOf(city, col, row);
  next.build[index] = id;
  if (next.terrain[index] === TERRAIN_FOREST) next.terrain[index] = TERRAIN_GRASS;
  return next;
}

export function canDemolish(city, col, row) {
  if (!inBounds(city, col, row)) return { ok: false, reason: '超出地界', cost: 0 };
  const index = indexOf(city, col, row);
  if (city.build[index] === EMPTY) return { ok: false, reason: '这里是空地', cost: 0 };
  if (index === city.entrance) return { ok: false, reason: '城门口的路不能拆', cost: 0 };
  return { ok: true, reason: '', cost: DEMOLISH_COST };
}

export function demolish(city, col, row) {
  const next = cloneCity(city);
  next.build[indexOf(city, col, row)] = EMPTY;
  return next;
}

/**
 * 从城门开始 BFS 整张路网，返回每格是否是「通车的路」。
 * 断头路照样是路，但连不回城门就不供服务——这是路网存在感的来源。
 */
export function roadReach(city) {
  const reach = new Uint8Array(city.cols * city.rows);
  if (city.build[city.entrance] !== ROAD) return reach;
  const queue = [city.entrance];
  reach[city.entrance] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const col = colOf(city, index);
    const row = rowOf(city, index);
    for (const step of NEIGHBOURS) {
      const nc = col + step.dc;
      const nr = row + step.dr;
      if (!inBounds(city, nc, nr)) continue;
      const next = indexOf(city, nc, nr);
      if (reach[next] || city.build[next] !== ROAD) continue;
      reach[next] = 1;
      queue.push(next);
    }
  }
  return reach;
}

/** 建筑贴着任意一格通车的路就算接入市政；路自己看它有没有连回城门。 */
export function isServiced(city, reach, col, row) {
  const id = buildAt(city, col, row);
  const building = buildingOf(id);
  if (!building) return false;
  if (building.isRoad) return reach[indexOf(city, col, row)] === 1;
  if (!building.needsRoad) return true;
  return NEIGHBOURS.some((step) => {
    const nc = col + step.dc;
    const nr = row + step.dr;
    return inBounds(city, nc, nr)
      && city.build[indexOf(city, nc, nr)] === ROAD
      && reach[indexOf(city, nc, nr)] === 1;
  });
}

/** 遍历所有已建格，测试和统计都靠它，避免到处手写双层循环。 */
export function* builtCells(city) {
  for (let index = 0; index < city.build.length; index += 1) {
    if (city.build[index] === EMPTY) continue;
    yield { index, col: colOf(city, index), row: rowOf(city, index), id: city.build[index] };
  }
}
