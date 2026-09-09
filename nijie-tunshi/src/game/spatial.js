import { LEVEL } from './level.js';

// 均匀网格空间索引。目的不是降低单次查询的渐进复杂度，而是把每步中
// 真正昂贵的逐对象工作（遮挡射线采样、障碍推出）限制在玩家邻域内。
// 当前每步开销约为 O(n × 阻挡物 × 12)，扩展到程序生成地图后会成为瓶颈。
//
// 查询结果一律按对象在原数组中的下标升序返回，保证确定性——
// 模拟依赖固定顺序，桶的遍历顺序不能泄漏到结果里。

export const SPATIAL_CELL_SIZE = 4;

export function createSpatialIndex(objects, level = LEVEL, cellSize = SPATIAL_CELL_SIZE) {
  const { minX, maxX, minZ, maxZ } = level.bounds;
  const cols = Math.max(1, Math.ceil((maxX - minX) / cellSize));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));
  const buckets = new Map();
  const index = { cols, rows, cellSize, minX, minZ, buckets, objects };
  for (let slot = 0; slot < objects.length; slot += 1) {
    const object = objects[slot];
    if (!object.active) continue;
    const key = bucketKey(index, object.x, object.z);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(slot);
    else buckets.set(key, [slot]);
  }
  return index;
}

const clampCol = (index, col) => Math.max(0, Math.min(index.cols - 1, col));
const clampRow = (index, row) => Math.max(0, Math.min(index.rows - 1, row));

function bucketKey(index, x, z) {
  const col = clampCol(index, Math.floor((x - index.minX) / index.cellSize));
  const row = clampRow(index, Math.floor((z - index.minZ) / index.cellSize));
  return col + index.cols * row;
}

// 返回可能落在半径内的对象下标。宁可多给（桶是方形，边角会多覆盖），
// 也不能漏——调用方仍会做精确距离判定。
export function queryRadius(index, x, z, radius) {
  const minCol = clampCol(index, Math.floor((x - radius - index.minX) / index.cellSize));
  const maxCol = clampCol(index, Math.floor((x + radius - index.minX) / index.cellSize));
  const minRow = clampRow(index, Math.floor((z - radius - index.minZ) / index.cellSize));
  const maxRow = clampRow(index, Math.floor((z + radius - index.minZ) / index.cellSize));
  const found = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const bucket = index.buckets.get(col + index.cols * row);
      if (bucket) found.push(...bucket);
    }
  }
  // 桶的收集顺序取决于遍历方向，必须排序回原下标序才能保持确定性
  return found.sort((left, right) => left - right);
}

export const queryObjects = (index, x, z, radius) => queryRadius(index, x, z, radius)
  .map((slot) => index.objects[slot]);
