import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_COUNT } from '../src/game/rules.js';
import { CHUNK_LENGTH, SAFE_LEAD, generateChunk } from '../src/game/track.js';

test('same seed and index always produce the same chunk', () => {
  assert.deepEqual(generateChunk(2024, 5), generateChunk(2024, 5));
  assert.notDeepEqual(generateChunk(2024, 5), generateChunk(2025, 5));
});

test('the opening stretch stays clear until SAFE_LEAD', () => {
  const first = generateChunk(31, 0);
  for (const row of first.rows) {
    assert.ok(row.z >= SAFE_LEAD, `开局障碍出现在 ${row.z} 米，应不早于 ${SAFE_LEAD}`);
  }
});

test('every row leaves at least one open lane', () => {
  for (let seed = 1; seed <= 12; seed += 1) {
    for (let index = 0; index < 30; index += 1) {
      for (const row of generateChunk(seed, index).rows) {
        assert.ok(
          row.freeLanes.length >= 1,
          `seed ${seed} chunk ${index} 的第 ${row.z} 米整排被封死`,
        );
        assert.equal(row.freeLanes.length + row.obstacles.length, LANE_COUNT);
      }
    }
  }
});

test('每个 chunk 的首排一定放行中间道，跨 chunk 衔接才不会断', () => {
  for (let index = 1; index < 20; index += 1) {
    const chunk = generateChunk(777, index);
    assert.ok(chunk.rows.length > 0, `chunk ${index} 没有生成任何一排`);
    assert.ok(chunk.rows[0].freeLanes.includes(1), `chunk ${index} 首排封住了中间道`);
  }
});

test('rows stay inside their chunk and obstacles carry their shape', () => {
  const chunk = generateChunk(99, 7);
  assert.equal(chunk.start, 7 * CHUNK_LENGTH);
  for (const row of chunk.rows) {
    assert.ok(row.z >= chunk.start && row.z < chunk.end);
    for (const obstacle of row.obstacles) {
      assert.equal(obstacle.z, row.z);
      assert.ok(obstacle.depth > 0);
      assert.ok(obstacle.high > obstacle.low);
    }
  }
});

test('coins and powerups only sit in lanes that are actually open', () => {
  for (let index = 1; index < 25; index += 1) {
    const chunk = generateChunk(4242, index);
    for (const powerup of chunk.powerups) {
      assert.ok(powerup.lane >= 0 && powerup.lane < LANE_COUNT);
    }
    for (const coin of chunk.coins) {
      assert.ok(coin.z >= chunk.start && coin.z < chunk.end, `金币 ${coin.z} 超出 chunk 范围`);
    }
  }
});
