import { createRandom } from './random.js';
import { LANE_COUNT, OBSTACLES } from './rules.js';

// 一段跑道的长度；关卡由无限多个相同长度的 chunk 拼接而成。
export const CHUNK_LENGTH = 30;
// 障碍排落在固定网格上再抖动，这样跨 chunk 的间距也有下界，永远够一次变道。
export const ROW_SPACING = 10;
export const ROW_JITTER = 1.2;
export const ROW_GAP_MIN = ROW_SPACING - ROW_JITTER * 2;
export const ROWS_PER_CHUNK = CHUNK_LENGTH / ROW_SPACING;
// 开局留出的空跑距离，让玩家先适应速度再遇到第一排障碍。
export const SAFE_LEAD = 26;
export const CENTER_LANE = (LANE_COUNT - 1) / 2;

const HARD_KINDS = [
  { value: 'crate', weight: 4 },
  { value: 'barrier', weight: 3 },
  { value: 'wall', weight: 2 },
  { value: 'pit', weight: 2 },
];
const EASY_KINDS = [
  { value: 'crate', weight: 5 },
  { value: 'barrier', weight: 3 },
  { value: 'pit', weight: 1 },
];

const lanesWithin = (lane, reach) => {
  const lanes = [];
  for (let candidate = 0; candidate < LANE_COUNT; candidate += 1) {
    if (Math.abs(candidate - lane) <= reach) lanes.push(candidate);
  }
  return lanes;
};

// 难度只影响「同时封几条道」和 wall 的出现权重，行间距始终保证一次变道来得及。
const difficultyAt = (index) => Math.min(1, index / 22);

const chooseFreeLane = (random, previousFree, index) => {
  // chunk 的第一排固定放行中间道，保证跨 chunk 的衔接一定可走。
  if (index === 0) return CENTER_LANE;
  return random.pick(lanesWithin(previousFree, 1));
};

const buildRow = (random, z, freeLane, difficulty, chunkIndex, rowIndex) => {
  const others = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) if (lane !== freeLane) others.push(lane);
  const blockedLanes = random.chance(0.2 + difficulty * 0.5)
    ? others
    : [random.pick(others)];
  const kinds = difficulty > 0.35 ? HARD_KINDS : EASY_KINDS;
  const cells = new Array(LANE_COUNT).fill(null);
  const obstacles = [];
  for (const lane of blockedLanes) {
    const kind = random.weighted(kinds);
    const shape = OBSTACLES[kind];
    cells[lane] = kind;
    obstacles.push({
      id: `${chunkIndex}:o${rowIndex}:${lane}`,
      kind,
      lane,
      z,
      low: shape.low,
      high: shape.high,
      depth: shape.depth,
    });
  }
  const freeLanes = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) if (!cells[lane]) freeLanes.push(lane);
  return { z, cells, freeLanes, obstacles };
};

const buildCoinRun = (random, chunkIndex, rowIndex, lane, fromZ, toZ) => {
  const coins = [];
  const count = random.int(3, 6);
  const spacing = 1.6;
  const last = toZ - 2.4;
  const first = Math.max(fromZ + 1.5, last - (count - 1) * spacing);
  if (last <= first) return coins;
  const step = (last - first) / Math.max(1, count - 1);
  for (let index = 0; index < count; index += 1) {
    coins.push({ id: `${chunkIndex}:c${rowIndex}:${index}`, lane, z: first + step * index });
  }
  return coins;
};

// 同一个 seed 和 chunkIndex 永远生成同一段跑道，因此无需缓存也能重放。
export function generateChunk(seed, chunkIndex) {
  const random = createRandom(seed + chunkIndex * 7919 + 1);
  const start = chunkIndex * CHUNK_LENGTH;
  const end = start + CHUNK_LENGTH;
  const difficulty = difficultyAt(chunkIndex);
  const rows = [];
  const coins = [];
  const powerups = [];
  let previousZ = start;
  let previousFree = CENTER_LANE;
  let rowIndex = 0;
  for (let slot = 0; slot < ROWS_PER_CHUNK; slot += 1) {
    const z = start + ROW_SPACING / 2 + slot * ROW_SPACING + random.range(-ROW_JITTER, ROW_JITTER);
    // 开局那段留白，落在 SAFE_LEAD 之前的排直接丢掉。
    if (z < SAFE_LEAD) continue;
    const freeLane = chooseFreeLane(random, previousFree, rowIndex);
    const row = buildRow(random, z, freeLane, difficulty, chunkIndex, rowIndex);
    rows.push(row);
    if (random.chance(0.75)) {
      coins.push(...buildCoinRun(random, chunkIndex, rowIndex, freeLane, previousZ, z));
    }
    previousFree = freeLane;
    previousZ = z + row.obstacles.reduce((depth, obstacle) => Math.max(depth, obstacle.depth), 1);
    rowIndex += 1;
  }
  if (chunkIndex > 0 && random.chance(0.24) && rows.length > 0) {
    const host = rows[rows.length - 1];
    powerups.push({
      id: `${chunkIndex}:p0`,
      kind: random.chance(0.5) ? 'magnet' : 'shield',
      lane: host.freeLanes[0],
      z: host.z - 3.2,
    });
  }
  return { index: chunkIndex, start, end, difficulty, rows, coins, powerups };
}


