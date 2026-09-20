// 一格瓦片就是一个世界单位，所有速度都是「格 / 秒」，数值集中在这里方便调手感。
export const GRAVITY = 44;
// 按住跳跃键时重力更小，松手回到正常重力，这就是可变跳跃高度。
export const HOLD_GRAVITY = 27;
export const MAX_FALL = 26;

export const MOVE_MAX = 6.6;
export const GROUND_ACCEL = 42;
export const AIR_ACCEL = 24;
export const FRICTION = 44;

export const JUMP_SPEED = 15.2;
export const COYOTE_TIME = 0.09;
export const JUMP_BUFFER = 0.12;

export const STAND_SIZE = { w: 0.7, h: 1.5 };
// 蹲下不只是变矮：站着的弹道从胸口出，蹲着从膝盖出，能躲掉半数平射弹。
export const PRONE_SIZE = { w: 0.86, h: 0.72 };

export const START_LIVES = 3;
export const RESPAWN_INVULN = 1.8;
export const DEATH_TIME = 1.2;
export const CLEAR_TIME = 2;

// —— 弹药经济：这游戏的全部设计都挂在这三个数上 ——
// 弹匣装满 30 发，自动连发四五秒就能泼光。装填只补到 RELOAD_FILL 发，而且很慢，
// 所以「退到安全距离慢慢装」的输出只有贴身压枪的一小半：
// 弹匣要想一直是满的，只能靠命中回弹。
export const AMMO_MAX = 30;
export const RELOAD_FILL = 5;
export const RELOAD_TIME = 2.2;
// 蹲下停火时装填快一倍——这是唯一的「主动喘气」手段，等于横版射击里的找掩体。
export const PRONE_RELOAD_BOOST = 2;

// 打中敌人回 1 发，打中 Boss 弱点回 2 发；打在装甲上一发不回。
export const REFUND_HIT = 1;
export const REFUND_WEAK = 2;

export const BULLET_LIFE = 1.4;
export const ENEMY_BULLET_SPEED = 13;
// 敌人和 Boss 只在玩家附近这么多格内活动，远处保持静止。
export const AWAKE_RANGE = 24;
export const BOSS_RANGE = 17;

export const KILL_SCORE = 120;
export const WEAK_SCORE = 40;
export const BOSS_SCORE = 4000;
export const PICKUP_SCORE = 300;
export const TIME_BONUS = 30;

// 连续命中不落空的音阶与加分：连得越久回弹越值钱，这是「贴身压枪」的正反馈。
const CHAIN_BONUS = [0, 10, 20, 30, 40, 60];

export const sizeFor = (prone) => (prone ? PRONE_SIZE : STAND_SIZE);

export const chainBonus = (chain) =>
  CHAIN_BONUS[Math.min(Math.max(chain, 1), CHAIN_BONUS.length) - 1];

export const jumpGravity = (vy, holding) => (holding && vy < 0 ? HOLD_GRAVITY : GRAVITY);

export const timeBonus = (remain) => Math.max(0, Math.floor(remain)) * TIME_BONUS;

// 装填速度：蹲着停火时快 3 倍多，站着边打边装是慢的那一档。
export const reloadRate = (prone) => (prone ? PRONE_RELOAD_BOOST : 1) / RELOAD_TIME;

// 回弹发数。装甲（weak=false 的 Boss 部位）一发不回，这是「打错位置等于白打」的唯一表达。
export const refundFor = (kind) => {
  if (kind === 'weak') return REFUND_WEAK;
  if (kind === 'armor') return 0;
  return REFUND_HIT;
};

export const resultStars = (score) => {
  if (score >= 42000) return 3;
  if (score >= 26000) return 2;
  if (score >= 12000) return 1;
  return 0;
};
