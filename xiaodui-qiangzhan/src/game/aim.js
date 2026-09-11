import { canSee } from './arena.js';
import {
  ASSIST_CONE,
  ASSIST_PULL,
  ASSIST_RANGE,
  LOCK_CONE,
  SPREAD_MAX,
  SPREAD_MIN,
  SPREAD_PER_SHOT,
  SPREAD_RECOVER,
  UNIT_RADIUS,
  aimSpread,
  clamp,
  focusRatio,
  turnRate,
} from './rules.js';

export const TAU = Math.PI * 2;

// 归一到 (-PI, PI]，两个角度之间的最短转向。
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

// 枪口按最大角速度转向目标角，转不到就停在半路：这就是瞄准惯性。
export function turnToward(angle, target, maxStep) {
  const delta = angleDelta(angle, target);
  if (Math.abs(delta) <= maxStep) return target;
  return angle + Math.sign(delta) * maxStep;
}

export const angleTo = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

// 软锁候选：活着、视线通、在辅助锥内、在辅助距离内。
export function assistCandidates(arena, shooter, enemies, aim = shooter.aim) {
  const out = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const distance = Math.hypot(enemy.x - shooter.x, enemy.y - shooter.y);
    if (distance > ASSIST_RANGE) continue;
    const delta = angleDelta(aim, angleTo(shooter, enemy));
    // 贴脸时目标的角半径很大，锥角按目标视角撑开一点，否则近身反而锁不上。
    const cone = ASSIST_CONE + Math.atan2(UNIT_RADIUS, Math.max(0.6, distance));
    if (Math.abs(delta) > cone) continue;
    if (!canSee(arena, shooter, enemy)) continue;
    out.push({ enemy, distance, delta });
  }
  return out;
}

// 优先锁准星最近的，同样偏角下优先近的；返回 null 表示没有可锁目标。
export function acquireTarget(arena, shooter, enemies, aim = shooter.aim) {
  let best = null;
  for (const candidate of assistCandidates(arena, shooter, enemies, aim)) {
    const cost = Math.abs(candidate.delta) + candidate.distance * 0.015;
    if (!best || cost < best.cost) best = { ...candidate, cost };
  }
  return best;
}

// 玩家给的期望角 + 软锁牵引：目标存在时枪口被额外朝目标拉一点，越端稳拉得越多。
export function steerAim(aim, desired, target, dt, focus = 0) {
  const ratio = clamp(focus, 0, 1);
  let next = turnToward(aim, desired, turnRate(ratio) * dt);
  if (!target) return next;
  const pull = ASSIST_PULL * (0.6 + 0.4 * ratio) * dt;
  return turnToward(next, target.angle, Math.min(pull, Math.abs(angleDelta(next, target.angle))));
}

// 准星是否已经咬住目标：偏角进 LOCK_CONE 才算锁定，HUD 据此变色。
export const isLocked = (aim, targetAngle) => Math.abs(angleDelta(aim, targetAngle)) <= LOCK_CONE;

export const addRecoil = (recoil) => Math.min(SPREAD_MAX, recoil + SPREAD_PER_SHOT);

export const recoverRecoil = (recoil, dt) => Math.max(0, recoil - SPREAD_RECOVER * dt);

// 一枪的实际出膛角：在散布半角内随机偏，散布越小越贴准星。
export const shotAngle = (aim, spread, signed) => aim + spread * signed;

// 汇总给渲染与 HUD 的瞄准读数。
export function reticleState(unit, target) {
  const focus = focusRatio(unit.focusTime);
  const spread = aimSpread(unit.recoil, { moving: unit.moveRatio, focus });
  return {
    angle: unit.aim,
    spread,
    focus,
    targetId: target ? target.enemy.id : null,
    locked: Boolean(target) && isLocked(unit.aim, angleTo(unit, target.enemy)),
    tight: clamp((spread - SPREAD_MIN * 0.35) / (SPREAD_MAX - SPREAD_MIN * 0.35), 0, 1),
  };
}
