import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_LENGTH } from '../src/game/track.js';
import { MAGNET_SECONDS, laneX } from '../src/game/rules.js';
import { STEP, createGame, step, togglePause } from '../src/game/simulation.js';

// nextChunk 推到极远处，syncTrack 就不会再往手工场景里塞生成内容。
const scenario = (overrides = {}) => ({
  ...createGame(1),
  status: 'playing',
  obstacles: [],
  coins: [],
  powerups: [],
  nextChunk: 1_000_000,
  ...overrides,
});

const obstacle = (kind, lane, z, low, high, depth) => ({
  id: `${kind}-${lane}-${z}`,
  kind,
  lane,
  z,
  low,
  high,
  depth,
});

const CRATE = (lane, z) => obstacle('crate', lane, z, 0, 1.15, 1.2);
const BARRIER = (lane, z) => obstacle('barrier', lane, z, 1.15, 3.2, 0.6);
const WALL = (lane, z) => obstacle('wall', lane, z, 0, 3.2, 1);

// 在距离障碍 2.6 米时按下指定动作，模拟玩家看到障碍后的正常反应。
const reactAt = (state, targetZ, action) => {
  let next = state;
  let acted = false;
  for (let index = 0; index < 900 && next.status === 'playing'; index += 1) {
    let input = {};
    if (!acted && targetZ - next.distance <= 2.6) {
      input = { [action]: true };
      acted = true;
    }
    next = step(next, input, STEP);
    if (next.distance > targetZ + 8) break;
  }
  return next;
};

const coast = (state, untilZ) => {
  let next = state;
  for (let index = 0; index < 900 && next.status === 'playing' && next.distance < untilZ; index += 1) {
    next = step(next, {}, STEP);
  }
  return next;
};

test('same seed and same inputs stay bit-identical', () => {
  let left = { ...createGame(88), status: 'playing' };
  let right = { ...createGame(88), status: 'playing' };
  for (let index = 0; index < 240; index += 1) {
    const input = {
      left: index % 41 === 0,
      right: index % 29 === 0,
      jump: index % 17 === 0,
      slide: index % 23 === 0,
    };
    left = step(left, input);
    right = step(right, input);
  }
  assert.deepEqual(left, right);
});

test('ready 和 paused 状态下模拟完全静止', () => {
  const ready = createGame(5);
  assert.equal(ready.status, 'ready');
  assert.equal(step(ready, { jump: true }), ready);
  const paused = togglePause({ ...ready, status: 'playing' });
  assert.equal(paused.status, 'paused');
  assert.equal(step(paused, { jump: true }), paused);
  assert.equal(togglePause(paused).status, 'playing');
});

test('a crate ends the run unless the player jumps', () => {
  const crate = CRATE(1, 40);
  const crashed = coast(scenario({ obstacles: [crate] }), 60);
  assert.equal(crashed.status, 'over', '直接撞木箱应该结束本局');
  assert.equal(crashed.effects.some((effect) => effect.type === 'crash'), true);

  const cleared = reactAt(scenario({ obstacles: [crate] }), 40, 'jump');
  assert.equal(cleared.status, 'playing', `起跳后应越过木箱，实际在 ${cleared.distance} 米结束`);
  assert.ok(cleared.distance > 46);
});

test('a low barrier only lets a sliding runner through', () => {
  const barrier = BARRIER(1, 40);
  assert.equal(coast(scenario({ obstacles: [barrier] }), 60).status, 'over');
  assert.equal(reactAt(scenario({ obstacles: [barrier] }), 40, 'jump').status, 'over', '跳跃反而会撞上横杆');
  assert.equal(reactAt(scenario({ obstacles: [barrier] }), 40, 'slide').status, 'playing');
});

test('a wall can only be answered with a lane change', () => {
  const wall = WALL(1, 40);
  assert.equal(reactAt(scenario({ obstacles: [wall] }), 40, 'jump').status, 'over');
  assert.equal(reactAt(scenario({ obstacles: [wall] }), 40, 'slide').status, 'over');
  const dodged = reactAt(scenario({ obstacles: [wall] }), 40, 'left');
  assert.equal(dodged.status, 'playing');
  assert.equal(dodged.lane, 0);
  assert.equal(dodged.x, laneX(0));
});

test('coin runs build the combo multiplier', () => {
  const coins = [0, 1, 2, 3, 4, 5].map((index) => ({
    id: `c${index}`,
    lane: 1,
    x: laneX(1),
    z: 12 + index * 1.6,
  }));
  const collected = coast(scenario({ coins }), 30);
  assert.equal(collected.coinsCollected, coins.length);
  assert.equal(collected.streak, coins.length);
  // 前四枚是 1 倍，第五、第六枚进入 2 倍。
  assert.equal(collected.coinPoints, 12 * 4 + 12 * 2 * 2);
  assert.equal(collected.coins.length, 0);
  assert.ok(collected.score > collected.coinPoints);
});

test('磁吸会把邻道金币吸过来，没有磁吸则吃不到', () => {
  const coin = { id: 'far', lane: 0, x: laneX(0), z: 14 };
  const missed = coast(scenario({ coins: [coin] }), 26);
  assert.equal(missed.coinsCollected, 0, '没有磁吸时不该吃到隔一条道的金币');

  const pulled = coast(scenario({ coins: [coin], magnet: MAGNET_SECONDS }), 26);
  assert.equal(pulled.coinsCollected, 1);
  assert.ok(pulled.magnet < MAGNET_SECONDS, '磁吸时长应随时间递减');
});

test('a shield eats one impact and breaks the obstacle', () => {
  const survived = coast(scenario({ obstacles: [WALL(1, 40)], shield: 1 }), 42);
  assert.equal(survived.status, 'playing');
  assert.equal(survived.shield, 0);
  assert.equal(survived.obstacles.length, 0, '被护盾撞碎的障碍应从场上移除');
  assert.ok(survived.invulnerable > 0, '刚吃下撞击时应处于无敌帧');

  const doomed = coast(scenario({ obstacles: [WALL(1, 40), WALL(1, 80)], shield: 1 }), 100);
  assert.equal(doomed.status, 'over', '护盾只挡一次，第二面墙仍会致死');
});

test('picking up a powerup grants exactly its effect', () => {
  const magnet = coast(
    scenario({ powerups: [{ id: 'm', kind: 'magnet', lane: 1, x: laneX(1), z: 14 }] }),
    26,
  );
  assert.ok(magnet.magnet > 0);
  assert.equal(magnet.powerups.length, 0);

  const shield = coast(
    scenario({ powerups: [{ id: 's', kind: 'shield', lane: 1, x: laneX(1), z: 14 }] }),
    26,
  );
  assert.equal(shield.shield, 1);
});

test('the track streams forever and prunes what is behind', () => {
  let state = { ...createGame(404), status: 'playing' };
  const startChunk = state.nextChunk;
  let peakObstacles = 0;
  for (let index = 0; index < 3600; index += 1) {
    // 每步把无敌帧续上，这个用例只关心跑道的生成与回收，不关心撞不撞。
    state = step({ ...state, invulnerable: 10 }, {}, STEP);
    peakObstacles = Math.max(peakObstacles, state.obstacles.length);
  }
  assert.equal(state.status, 'playing');
  assert.ok(state.nextChunk > startChunk, '跑了这么远却没有生成新 chunk');
  assert.ok(state.nextChunk * CHUNK_LENGTH >= state.distance, '生成进度落后于玩家');
  assert.ok(state.obstacles.length > 0, '前方应始终有障碍');
  assert.ok(peakObstacles < 120, `身后实体没有回收，峰值 ${peakObstacles}`);
  for (const item of state.obstacles) {
    assert.ok(item.z + item.depth > state.distance - 30, `${item.id} 早该被回收`);
  }
});

test('game over freezes the state and awards stars', () => {
  const finished = coast(scenario({ obstacles: [WALL(1, 40)] }), 60);
  assert.equal(finished.status, 'over');
  assert.ok(finished.stars >= 1 && finished.stars <= 3);
  assert.equal(step(finished, { jump: true }), finished, '结束后再输入不应改变状态');
});



