// 数值与判定集中在这里，模拟层只按这些规则推进状态。
// 坐标单位是「格」：竞技场宽 ARENA_COLS 格、高 ARENA_ROWS 格，渲染层再换算成像素。
export const TEAM_ALLY = 'ally';
export const TEAM_ENEMY = 'enemy';
export const TEAM_SIZE = 3;

// 视口在竞技场外留出的空白格数，避免边墙贴着屏幕边缘。
export const ARENA_PAD = 0.4;

export const UNIT_RADIUS = 0.42;
export const MAX_HEALTH = 100;
export const MOVE_SPEED = 5.4;
// 端稳瞄准时脚步会慢下来，换枪口稳定，这是「移动 vs 精度」的取舍。
export const FOCUS_MOVE_SCALE = 0.55;
export const ACCEL = 34;

// 瞄准有惯性：枪口每秒最多转这么多弧度，端稳时更慢但更好压枪。
export const TURN_RATE = 9;
export const FOCUS_TURN_RATE = 5;

export const FIRE_INTERVAL = 0.12;
export const BULLET_SPEED = 34;
export const BULLET_RANGE = 22;
export const MAG_SIZE = 25;
export const RELOAD_TIME = 1.6;
export const BASE_DAMAGE = 17;
// 超过 FALLOFF_START 格伤害开始衰减，到 FALLOFF_END 格只剩 FALLOFF_MIN。
export const FALLOFF_START = 9;
export const FALLOFF_END = 18;
export const FALLOFF_MIN = 0.55;

// 散布：站定最准，移动加惩罚，每开一枪抬一点，松手会压回去。
export const SPREAD_MIN = 0.012;
export const SPREAD_MOVE = 0.085;
export const SPREAD_PER_SHOT = 0.014;
export const SPREAD_MAX = 0.16;
export const SPREAD_RECOVER = 0.28;
export const FOCUS_SPREAD_SCALE = 0.35;
export const FOCUS_CHARGE_TIME = 0.45;

// 瞄准辅助：视线内、辅助锥内的敌人会被软锁，枪口被额外拉过去一点。
export const ASSIST_RANGE = 13;
export const ASSIST_CONE = 0.32;
export const ASSIST_PULL = 5.5;
export const LOCK_CONE = 0.085;

export const RESPAWN_DELAY = 3;
export const SCORE_LIMIT = 15;
export const MATCH_SECONDS = 180;
export const KILL_SCORE = 120;
export const DAMAGE_SCORE = 2;
export const STREAK_BONUS = 40;

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// 端稳按住的时间折算成 0~1 的稳定度。
export const focusRatio = (focusTime) => clamp(focusTime / FOCUS_CHARGE_TIME, 0, 1);

export const turnRate = (ratio) => TURN_RATE + (FOCUS_TURN_RATE - TURN_RATE) * clamp(ratio, 0, 1);

// 当前散布半角：底噪 + 后坐力 + 移动惩罚，再按端稳程度整体收紧。
export function aimSpread(recoil = 0, { moving = 0, focus = 0 } = {}) {
  const base = SPREAD_MIN + Math.max(0, recoil) + SPREAD_MOVE * clamp(moving, 0, 1);
  const scale = 1 + (FOCUS_SPREAD_SCALE - 1) * clamp(focus, 0, 1);
  return clamp(base * scale, SPREAD_MIN * FOCUS_SPREAD_SCALE, SPREAD_MAX);
}

export function damageAt(distance) {
  if (distance <= FALLOFF_START) return BASE_DAMAGE;
  const t = clamp((distance - FALLOFF_START) / (FALLOFF_END - FALLOFF_START), 0, 1);
  return Math.round(BASE_DAMAGE * (1 + (FALLOFF_MIN - 1) * t));
}

// 连杀越长，单次击杀分越高。
export const killScore = (streak = 1) => KILL_SCORE + STREAK_BONUS * Math.max(0, streak - 1);

export const accuracy = (hits, shots) => (shots > 0 ? hits / shots : 0);
