import { generateChunk } from './track.js';
import { LANE_COUNT, LANE_SWITCH_SECONDS, speedAt } from './rules.js';

const lanesWithin = (lane, reach) => {
  const lanes = [];
  for (let candidate = 0; candidate < LANE_COUNT; candidate += 1) {
    if (Math.abs(candidate - lane) <= reach) lanes.push(candidate);
  }
  return lanes;
};

// 两排之间能完成几次变道，取决于当前速度下的可用时间。
export const switchesBetween = (fromZ, toZ) => {
  const seconds = Math.max(0, toZ - fromZ) / speedAt(fromZ);
  return Math.floor(seconds / LANE_SWITCH_SECONDS);
};

// 逐排推进可达车道集合；任何一排推空就说明这段跑道是死局。
export function validateTrack(rows, { startLane = (LANE_COUNT - 1) / 2, startZ = 0 } = {}) {
  let reachable = new Set([startLane]);
  let previousZ = startZ;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.freeLanes.length === 0) {
      return { ok: false, failedRow: index, reason: 'row-fully-blocked' };
    }
    const reach = switchesBetween(previousZ, row.z);
    const next = new Set();
    for (const lane of reachable) {
      for (const candidate of lanesWithin(lane, reach)) {
        if (row.freeLanes.includes(candidate)) next.add(candidate);
      }
    }
    if (next.size === 0) {
      return { ok: false, failedRow: index, reason: 'row-unreachable' };
    }
    reachable = next;
    previousZ = row.z;
  }
  return { ok: true, reachable: [...reachable].sort((a, b) => a - b) };
}

// 批量体检：把连续若干 chunk 拼成一条跑道整体验证，并给出密度指标。
export function auditSeed(seed, chunkCount = 40) {
  const rows = [];
  let coins = 0;
  let powerups = 0;
  let obstacles = 0;
  let end = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = generateChunk(seed, index);
    rows.push(...chunk.rows);
    coins += chunk.coins.length;
    powerups += chunk.powerups.length;
    for (const row of chunk.rows) obstacles += row.obstacles.length;
    end = chunk.end;
  }
  const verdict = validateTrack(rows);
  return {
    seed,
    chunkCount,
    length: end,
    rows: rows.length,
    obstacles,
    coins,
    powerups,
    obstaclesPerHundredMeters: end === 0 ? 0 : (obstacles / end) * 100,
    ...verdict,
  };
}

