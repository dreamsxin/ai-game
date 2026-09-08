export const RING_COMPLETION_MASS = 90;
export const STELLAR_IGNITION_MASS = 130;
export const STELLAR_FUEL_TARGET = 100;
export const STELLAR_STABILITY_TARGET = 75;
export const ASCENSION_MASS = STELLAR_IGNITION_MASS;
export const INITIAL_RADIUS = 1.15;
export const MASS_PER_RADIUS = 7;
export const MAX_NAVIGATION_RADIUS = 2.35;

export const STABILITY_MAX = 100;
export const OVERLOAD_SAFE_MASS = 12;
export const OVERLOAD_STABILITY_COST = 6;
export const IMPACT_SPEED_THRESHOLD = 9;
export const IMPACT_STABILITY_COST = 1.5;
export const STABILITY_PENALTY_COOLDOWN = 0.6;
export const STABILITY_RECOVERY_DELAY = 1.5;
export const STABILITY_RECOVERY_RATE = 1.2;

export const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function radiusForMass(mass) {
  return INITIAL_RADIUS + Math.sqrt(Math.max(0, mass) / MASS_PER_RADIUS);
}

export function consumePower(player) {
  const overload = player.mass >= 60 ? 5 : player.mass >= 32 ? 3 : 2;
  return player.mass + overload;
}

export function canConsume(player, object, encounter) {
  if (!object.active || object.polarity === 'dark') return false;
  if (object.type === 'core') return encounter.coreUnlocked;
  return object.mass <= consumePower(player);
}

export function passageHeight(mass) {
  return INITIAL_RADIUS + Math.sqrt(Math.max(0, mass) / MASS_PER_RADIUS);
}

// 跨越安全余量：让"再吃一个就能翻过去"这件事有明确门槛，而不是贴着相等值抖动。
export const CROSS_SAFE_MARGIN = 0.6;

export function canCrossObstacle(mass, obstacle) {
  if (!obstacle || typeof obstacle.height !== 'number') return false;
  return passageHeight(mass) >= obstacle.height + CROSS_SAFE_MARGIN;
}

// 窄门只看质量上限：体型一旦超过就永久关闭，这是"成长不可逆"的载体。
export function canPassGate(mass, gate) {
  if (!gate || typeof gate.maxMass !== 'number') return true;
  return mass <= gate.maxMass;
}

// 恰好能翻过某高度所需的质量，供关卡标注与验证器使用。
export function massToCross(height) {
  const required = height + CROSS_SAFE_MARGIN - INITIAL_RADIUS;
  if (required <= 0) return 0;
  return required * required * MASS_PER_RADIUS;
}

// 牵引资格：目标质量不超过玩家质量的这个比例。取代早期的 gravity 白名单。
// 0.18 的效果：质量 12 解锁牵引时只能拉动 2.2 以下的糖屑，
// 质量 60 能拉到 10.8，质量 130 能拉到 23.4，糖心熔炉（52）始终拉不动。
export const GRAVITY_MASS_RATIO = 0.18;

export function canPull(player, object) {
  if (!object.active) return false;
  // 糖心熔炉是关卡主门槛，永不参与自动吸附，避免玩家在岔路口被迫升级
  if (object.type === 'core') return false;
  return object.mass <= player.mass * GRAVITY_MASS_RATIO;
}

// 恰好能拉动某质量目标所需的玩家质量，供文档与验证器换算。
export const massToPull = (objectMass) => objectMass / GRAVITY_MASS_RATIO;

export function isOverloadConsume(player, object) {
  return player.mass >= OVERLOAD_SAFE_MASS && object.mass > player.mass;
}

export function applyStabilityPenalty(player, amount) {
  if (player.stabilityPenaltyCooldown > 0) return 0;
  const before = player.stability;
  player.stability = Math.max(0, player.stability - amount);
  player.stabilityPenaltyCooldown = STABILITY_PENALTY_COOLDOWN;
  player.stabilityRecoveryDelay = STABILITY_RECOVERY_DELAY;
  return before - player.stability;
}

export function recoverStability(player, dt) {
  player.stabilityPenaltyCooldown = Math.max(0, player.stabilityPenaltyCooldown - dt);
  if (player.stabilityRecoveryDelay > 0) {
    player.stabilityRecoveryDelay = Math.max(0, player.stabilityRecoveryDelay - dt);
    return;
  }
  player.stability = Math.min(STABILITY_MAX, player.stability + STABILITY_RECOVERY_RATE * dt);
}

export function comboMultiplier(combo) {
  return 1 + Math.min(1.5, Math.max(0, combo - 1) * 0.12);
}

export function stellarIgnitionReady(state) {
  const anchorsReady = state.anchors.every((anchor) => anchor.integrity <= 0);
  const coreConsumed = !state.objects.find((object) => object.id === 'core')?.active;
  return state.player.mass >= STELLAR_IGNITION_MASS
    && state.player.fuel >= STELLAR_FUEL_TARGET
    && state.player.stability >= STELLAR_STABILITY_TARGET
    && anchorsReady
    && state.encounter.phaseIgnited
    && coreConsumed;
}

export function resultStars(result) {
  if (!result) return 0;
  if (result.elapsed <= 150 && result.highestCombo >= 6 && result.phaseShortcut) return 3;
  if (result.elapsed <= 195 || result.highestCombo >= 4) return 2;
  return 1;
}
