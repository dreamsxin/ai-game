import { generateChunk, CHUNK_LENGTH } from './track.js';
import {
  COIN_HEIGHT,
  COIN_RADIUS,
  COIN_SCORE,
  COMBO_GRACE_METERS,
  DISTANCE_SCORE,
  GRAVITY,
  INVULNERABLE_SECONDS,
  JUMP_SPEED,
  LANE_SWITCH_SPEED,
  MAGNET_PULL_SPEED,
  MAGNET_RADIUS,
  MAGNET_SECONDS,
  OBSTACLE_HALF_WIDTH,
  PLAYER_HALF_DEPTH,
  PLAYER_HALF_WIDTH,
  SHIELD_MAX_CHARGES,
  SLIDE_SECONDS,
  clampLane,
  clears,
  comboMultiplier,
  laneX,
  playerHeight,
  resultStars,
  speedAt,
} from './rules.js';

export const STEP = 1 / 60;
// 视野前方保留的跑道长度，以及身后多久回收实体。
export const VIEW_AHEAD = 150;
export const PRUNE_BEHIND = 24;
export const CENTER_LANE = 1;

const EMPTY_INPUT = { left: false, right: false, jump: false, slide: false };

export function createGame(seed = 1) {
  const base = {
    seed,
    status: 'ready',
    elapsed: 0,
    distance: 0,
    speed: speedAt(0),
    lane: CENTER_LANE,
    x: laneX(CENTER_LANE),
    y: 0,
    vy: 0,
    grounded: true,
    sliding: false,
    slideTimer: 0,
    pendingSlide: false,
    obstacles: [],
    coins: [],
    powerups: [],
    nextChunk: 0,
    coinsCollected: 0,
    coinPoints: 0,
    streak: 0,
    bestStreak: 0,
    lastCoinDistance: 0,
    magnet: 0,
    shield: 0,
    invulnerable: 0,
    score: 0,
    stars: 0,
    effects: [],
  };
  return syncTrack(base);
}

// 按需生成前方 chunk 并回收身后实体，跑道因此是真正无尽的。
function syncTrack(state) {
  const obstacles = [];
  const coins = [];
  const powerups = [];
  let nextChunk = state.nextChunk;
  while (nextChunk * CHUNK_LENGTH < state.distance + VIEW_AHEAD) {
    const chunk = generateChunk(state.seed, nextChunk);
    for (const row of chunk.rows) obstacles.push(...row.obstacles);
    for (const coin of chunk.coins) coins.push({ ...coin, x: laneX(coin.lane) });
    for (const powerup of chunk.powerups) powerups.push({ ...powerup, x: laneX(powerup.lane) });
    nextChunk += 1;
  }
  const cutoff = state.distance - PRUNE_BEHIND;
  const keptObstacles = state.obstacles.filter((item) => item.z + item.depth > cutoff);
  const keptCoins = state.coins.filter((item) => item.z > cutoff);
  const keptPowerups = state.powerups.filter((item) => item.z > cutoff);
  if (
    nextChunk === state.nextChunk
    && keptObstacles.length === state.obstacles.length
    && keptCoins.length === state.coins.length
    && keptPowerups.length === state.powerups.length
  ) {
    return state;
  }
  return {
    ...state,
    nextChunk,
    obstacles: obstacles.length ? [...keptObstacles, ...obstacles] : keptObstacles,
    coins: coins.length ? [...keptCoins, ...coins] : keptCoins,
    powerups: powerups.length ? [...keptPowerups, ...powerups] : keptPowerups,
  };
}

export function startGame(seed) {
  return { ...createGame(seed), status: 'playing' };
}

export function togglePause(state) {
  if (state.status === 'playing') return { ...state, status: 'paused' };
  if (state.status === 'paused') return { ...state, status: 'playing' };
  return state;
}

const overlaps = (min, max, otherMin, otherMax) => min < otherMax && max > otherMin;

// 跑者的碰撞盒用连续的 x，因此变道途中被侧面刮到也会判定命中。
const hitsObstacle = (obstacle, distance, x, y, sliding) => {
  if (!overlaps(distance - PLAYER_HALF_DEPTH, distance + PLAYER_HALF_DEPTH, obstacle.z, obstacle.z + obstacle.depth)) {
    return false;
  }
  if (Math.abs(x - laneX(obstacle.lane)) >= PLAYER_HALF_WIDTH + OBSTACLE_HALF_WIDTH) return false;
  return !clears(obstacle.kind, y, sliding);
};

const reachesPickup = (pickup, distance, x, y) => {
  const dz = pickup.z - distance;
  const dx = pickup.x - x;
  const dy = COIN_HEIGHT - (y + playerHeight(false) / 2);
  return dz * dz + dx * dx + dy * dy <= (COIN_RADIUS + PLAYER_HALF_WIDTH) ** 2;
};

const applyPowerup = (state, kind) => {
  if (kind === 'magnet') return { magnet: MAGNET_SECONDS };
  return { shield: Math.min(SHIELD_MAX_CHARGES, state.shield + 1) };
};

export function step(state, input = EMPTY_INPUT, dt = STEP) {
  if (state.status !== 'playing') return state;
  const effects = [];
  let { lane, x, y, vy, grounded, sliding, slideTimer, pendingSlide } = state;

  if (input.left) lane = clampLane(lane - 1);
  if (input.right) lane = clampLane(lane + 1);
  // 撞到边线的那次输入不算变道，所以按实际结果发事件，而不是按有没有按键。
  if (lane !== state.lane) effects.push({ type: 'lane', from: state.lane, to: lane });

  if (input.jump && grounded) {
    vy = JUMP_SPEED;
    grounded = false;
    sliding = false;
    slideTimer = 0;
    pendingSlide = false;
    effects.push({ type: 'jump', x, y });
  }
  if (input.slide) {
    if (grounded) {
      sliding = true;
      slideTimer = SLIDE_SECONDS;
      effects.push({ type: 'slide', x, y });
    } else {
      // 空中下滑：立刻砸向地面并预约落地滑铲，是跑酷手感的关键补偿。
      vy = Math.min(vy, -JUMP_SPEED * 0.9);
      pendingSlide = true;
    }
  }

  if (!grounded) {
    vy -= GRAVITY * dt;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      vy = 0;
      grounded = true;
      effects.push({ type: 'land', x, y });
      if (pendingSlide) {
        sliding = true;
        slideTimer = SLIDE_SECONDS;
        pendingSlide = false;
      }
    }
  }
  if (sliding) {
    slideTimer -= dt;
    if (slideTimer <= 0) {
      sliding = false;
      slideTimer = 0;
    }
  }

  const targetX = laneX(lane);
  const drift = LANE_SWITCH_SPEED * dt;
  x = Math.abs(targetX - x) <= drift ? targetX : x + Math.sign(targetX - x) * drift;

  const speed = speedAt(state.distance);
  const distance = state.distance + speed * dt;
  const magnet = Math.max(0, state.magnet - dt);
  const invulnerable = Math.max(0, state.invulnerable - dt);
  // APPEND_STEP_TAIL
  let streak = state.streak;
  let coinsCollected = state.coinsCollected;
  let coinPoints = state.coinPoints;
  let lastCoinDistance = state.lastCoinDistance;
  if (distance - lastCoinDistance > COMBO_GRACE_METERS) streak = 0;

  const coins = [];
  for (const coin of state.coins) {
    let live = coin;
    if (magnet > 0) {
      const dz = distance - coin.z;
      const dx = x - coin.x;
      const range = Math.sqrt(dx * dx + dz * dz);
      if (range < MAGNET_RADIUS && range > 0.001) {
        const pull = Math.min(range, MAGNET_PULL_SPEED * dt);
        live = { ...coin, x: coin.x + (dx / range) * pull, z: coin.z + (dz / range) * pull };
      }
    }
    if (reachesPickup(live, distance, x, y)) {
      streak += 1;
      coinsCollected += 1;
      coinPoints += COIN_SCORE * comboMultiplier(streak);
      lastCoinDistance = distance;
      effects.push({ type: 'coin', x: live.x, z: live.z, streak });
      continue;
    }
    coins.push(live);
  }

  let shield = state.shield;
  let magnetSeconds = magnet;
  const powerups = [];
  for (const powerup of state.powerups) {
    if (reachesPickup(powerup, distance, x, y)) {
      const gained = applyPowerup({ ...state, shield }, powerup.kind);
      if (gained.magnet !== undefined) magnetSeconds = gained.magnet;
      if (gained.shield !== undefined) shield = gained.shield;
      effects.push({ type: 'powerup', kind: powerup.kind, x: powerup.x, z: powerup.z });
      continue;
    }
    powerups.push(powerup);
  }
  // APPEND_STEP_END
  let status = state.status;
  let guard = invulnerable;
  const obstacles = [];
  for (const obstacle of state.obstacles) {
    if (status === 'playing' && hitsObstacle(obstacle, distance, x, y, sliding)) {
      if (guard > 0) {
        obstacles.push(obstacle);
        continue;
      }
      if (shield > 0) {
        // 护盾撞碎障碍并给一段无敌时间，避免同一排连续判定两次。
        shield -= 1;
        guard = INVULNERABLE_SECONDS;
        effects.push({ type: 'shield', x, z: obstacle.z });
        continue;
      }
      status = 'over';
      effects.push({ type: 'crash', kind: obstacle.kind, x, z: obstacle.z });
    }
    obstacles.push(obstacle);
  }

  const score = Math.floor(distance * DISTANCE_SCORE) + coinPoints;
  const next = {
    ...state,
    status,
    elapsed: state.elapsed + dt,
    distance,
    speed,
    lane,
    x,
    y,
    vy,
    grounded,
    sliding,
    slideTimer,
    pendingSlide,
    obstacles,
    coins,
    powerups,
    coinsCollected,
    coinPoints,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    lastCoinDistance,
    magnet: magnetSeconds,
    shield,
    invulnerable: guard,
    score,
    stars: status === 'over' ? resultStars(score) : state.stars,
    effects,
  };
  return status === 'playing' ? syncTrack(next) : next;
}





