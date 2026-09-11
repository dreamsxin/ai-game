// 跑道尺寸、跑者体积、动作物理、障碍判定与计分的唯一真源。
export const LANE_COUNT = 3;
export const LANE_WIDTH = 2.4;
export const laneX = (lane) => (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
export const clampLane = (lane) => Math.max(0, Math.min(LANE_COUNT - 1, lane));

export const START_SPEED = 9;
export const MAX_SPEED = 27;
export const SPEED_RAMP = 0.22;
// 平方根曲线：起步立刻有推背感，后期增速放缓，避免几秒就顶到上限。
export const speedAt = (distance) =>
  Math.min(MAX_SPEED, START_SPEED + Math.sqrt(Math.max(distance, 0)) * SPEED_RAMP);

export const GRAVITY = 36;
export const JUMP_SPEED = 11.2;
export const SLIDE_SECONDS = 0.55;
export const LANE_SWITCH_SECONDS = 0.13;
export const LANE_SWITCH_SPEED = LANE_WIDTH / LANE_SWITCH_SECONDS;
export const INVULNERABLE_SECONDS = 1.1;

export const PLAYER_HALF_WIDTH = 0.45;
export const PLAYER_HALF_DEPTH = 0.45;
export const PLAYER_STAND_HEIGHT = 1.7;
export const PLAYER_SLIDE_HEIGHT = 0.8;
export const playerHeight = (sliding) => (sliding ? PLAYER_SLIDE_HEIGHT : PLAYER_STAND_HEIGHT);

export const OBSTACLE_HALF_WIDTH = LANE_WIDTH / 2 - 0.12;

// low/high 是障碍在竖直方向占据的区间，跳跃与滑铲共用同一条重叠判定。
export const OBSTACLES = {
  crate: { low: 0, high: 1.15, depth: 1.2, clearedBy: 'jump' },
  barrier: { low: 1.15, high: 3.2, depth: 0.6, clearedBy: 'slide' },
  wall: { low: 0, high: 3.2, depth: 1, clearedBy: 'lane' },
  pit: { low: -4, high: 0.02, depth: 2.6, clearedBy: 'jump' },
};
export const OBSTACLE_KINDS = Object.keys(OBSTACLES);

// 竖直区间不重叠即通过；wall 的区间覆盖全部动作，只能靠变道。
export const clears = (kind, y, sliding) => {
  const obstacle = OBSTACLES[kind];
  const bottom = y;
  const top = y + playerHeight(sliding);
  return top <= obstacle.low || bottom >= obstacle.high;
};

export const COIN_RADIUS = 0.9;
export const COIN_HEIGHT = 1;
export const DISTANCE_SCORE = 1;
export const COIN_SCORE = 12;
export const COMBO_STEP = 5;
export const MAX_COMBO_MULTIPLIER = 4;
export const COMBO_GRACE_METERS = 26;
export const comboMultiplier = (streak) =>
  Math.min(MAX_COMBO_MULTIPLIER, 1 + Math.floor(Math.max(streak, 0) / COMBO_STEP));

export const MAGNET_SECONDS = 7;
export const MAGNET_RADIUS = 3.4;
export const MAGNET_PULL_SPEED = 9;
export const SHIELD_MAX_CHARGES = 2;
export const POWERUPS = { magnet: '磁吸', shield: '护盾' };

export const TWO_STAR_SCORE = 1500;
export const THREE_STAR_SCORE = 4000;
export const resultStars = (score) => {
  if (score >= THREE_STAR_SCORE) return 3;
  if (score >= TWO_STAR_SCORE) return 2;
  return 1;
};

