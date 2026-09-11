// 一格瓦片就是一个世界单位，所有速度都是「格 / 秒」，数值集中在这里方便调手感。
export const GRAVITY = 46;
// 起跳后按住跳跃键时重力更小，松手就回到正常重力，这就是可变跳跃高度。
export const HOLD_GRAVITY = 26;
export const MAX_FALL = 26;

export const WALK_MAX = 6.2;
export const RUN_MAX = 9.2;
export const GROUND_ACCEL = 26;
export const AIR_ACCEL = 19;
export const FRICTION = 30;
// 反向输入时刹车比自然摩擦快，转身才跟手。
export const SKID_ACCEL = 46;

export const JUMP_SPEED = 15.4;
// 离地后仍允许起跳的宽容时间，以及落地前提前按跳的缓冲时间。
export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER = 0.12;
export const STOMP_BOUNCE = 12.6;
export const HIGH_BOUNCE = 15;

export const ENEMY_SPEED = 2.4;
export const TURTLE_SPEED = 3.1;
export const SHELL_SPEED = 13;
export const ITEM_SPEED = 3.4;
// 壳兽被踩扁后停在原地的秒数，之后自己站起来继续走。
export const SHELL_WAKE = 6;

export const HURT_INVULN = 1.8;
export const STAR_TIME = 8;
export const START_LIVES = 3;
export const LEVEL_TIME = 240;

export const SMALL_SIZE = { w: 0.72, h: 0.86 };
export const BIG_SIZE = { w: 0.78, h: 1.5 };

export const COIN_SCORE = 100;
export const BRICK_SCORE = 50;
export const POWER_SCORE = 1000;
export const TIME_BONUS = 50;
// 一次滞空里连续踩敌人的得分，踩到第六个以后固定 2000。
const STOMP_CHAIN = [100, 200, 400, 800, 1000, 2000];

export const sizeFor = (power) => (power === 'small' ? SMALL_SIZE : BIG_SIZE);

export const stompScore = (chain) => STOMP_CHAIN[Math.min(Math.max(chain, 1), STOMP_CHAIN.length) - 1];

export const timeBonus = (remain) => Math.max(0, Math.floor(remain)) * TIME_BONUS;

// 起跳初速固定，跳跃高度靠松手时机决定：一直按住约 4.5 格，点一下约 2.5 格。
export const jumpGravity = (vy, holding) => (holding && vy < 0 ? HOLD_GRAVITY : GRAVITY);

export const speedCap = (running) => (running ? RUN_MAX : WALK_MAX);

export const resultStars = (score) => {
  if (score >= 30000) return 3;
  if (score >= 18000) return 2;
  if (score >= 9000) return 1;
  return 0;
};
