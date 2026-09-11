// 数值与判定集中在这里，模拟层只负责按这些规则推进状态。
// 坐标以「格」为单位：场地宽 COLUMNS 格、高 FIELD_ROWS 格，砖块只占上面 GRID_ROWS 行。
export const COLUMNS = 7;
export const GRID_ROWS = 10;
export const FIELD_ROWS = 13;

export const BALL_RADIUS = 0.16;
export const BALL_SPEED = 16;
// 一串弹珠按这个间隔一颗颗射出去，拖成一条流。
export const FIRE_INTERVAL = 0.085;
export const LAUNCH_Y = 12.6;
export const FLOOR_Y = FIELD_ROWS;

export const STARTING_BALLS = 1;
export const START_ROWS = 3;

// 瞄准方向至少离水平线这么多弧度，避免打出永远回不来的水平球。
export const MIN_AIM_ANGLE = 0.2;
// 撞砖反弹后强制保留的最小竖直分量，防止弹珠贴着砖缝横向磨。
export const MIN_VERTICAL_RATIO = 0.12;
// 一回合最多飞这么久，超时后所有弹珠被拉向地面，回合一定会结束。
export const TURN_LIMIT = 14;
export const PULL_DOWN_SPEED = 6;

export const HIT_SCORE = 5;
export const BREAK_SCORE = 25;
export const BOMB_SCORE = 40;
export const PICKUP_SCORE = 15;
// 一回合里砸掉的砖越多，这回合后面的得分倍率越高。
export const COMBO_STEP = 0.05;
export const MAX_COMBO_MULTIPLIER = 2;
export const MAX_COMBO_BRICKS = 20;

// 每 STAGE_TURNS 回合进一个阶段，砖块血量与炸弹出现率跟着涨。
export const STAGE_TURNS = 10;

export const stageOf = (turn) => Math.floor(Math.max(0, turn - 1) / STAGE_TURNS) + 1;

export const comboMultiplier = (destroyed) =>
  Math.min(MAX_COMBO_MULTIPLIER, 1 + Math.min(Math.max(0, destroyed), MAX_COMBO_BRICKS) * COMBO_STEP);

export const hitScore = (destroyed = 0) => Math.floor(HIT_SCORE * comboMultiplier(destroyed));

export const breakScore = (kind = 'brick', destroyed = 0) =>
  Math.floor((kind === 'bomb' ? BOMB_SCORE : BREAK_SCORE) * comboMultiplier(destroyed));

export const pickupScore = (destroyed = 0) => Math.floor(PICKUP_SCORE * comboMultiplier(destroyed));

// 新砖块的血量跟着回合走：弹珠数大约每回合 +1，血量也同步涨，难度才不会脱节。
export function brickHp(turn, roll = 0) {
  const base = 1 + Math.floor((turn - 1) * 0.9);
  return Math.max(1, base + roll);
}

// 炸弹出现率随阶段提高，但封在 35%，不然场面全是连环爆。
export const bombChance = (turn) => Math.min(0.35, 0.12 + (stageOf(turn) - 1) * 0.05);
