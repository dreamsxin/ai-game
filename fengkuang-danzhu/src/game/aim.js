import { BALL_RADIUS, COLUMNS, LAUNCH_Y, MIN_AIM_ANGLE } from './rules.js';

// 默认瞄准正上方。方向统一用单位向量表示，vy 永远为负（朝上）。
export const DEFAULT_AIM = { x: 0, y: -1 };

const normalize = (x, y) => {
  const len = Math.hypot(x, y);
  if (len === 0) return { ...DEFAULT_AIM };
  return { x: x / len, y: y / len };
};

// 夹角：必须朝上，而且离水平线至少 MIN_AIM_ANGLE，否则弹珠会横着飞到超时。
export function clampAim(x, y) {
  const unit = normalize(x, y);
  const limit = Math.sin(MIN_AIM_ANGLE);
  if (unit.y > -limit) {
    const side = unit.x === 0 ? 1 : Math.sign(unit.x);
    return { x: side * Math.cos(MIN_AIM_ANGLE), y: -limit };
  }
  return unit;
}

// 手指点在哪，就从发射点指向那里。
export const aimAt = (launcher, point) => clampAim(point.x - launcher.x, point.y - LAUNCH_Y);

// 键盘微调：绕发射点转一个小角度，转到边界就停在边界上。
export function nudgeAim(aim, radians) {
  const angle = Math.atan2(aim.y, aim.x) + radians;
  return clampAim(Math.cos(angle), Math.sin(angle));
}

export const aimDegrees = (aim) => Math.round((Math.atan2(-aim.y, aim.x) * 180) / Math.PI);

// 预瞄虚线：只算左右墙的反弹，撞到砖块或天花板就收尾，纯几何、可测。
export function previewPath(launcher, aim, occupied = () => false, { maxDistance = 26, step = 0.08 } = {}) {
  const points = [{ x: launcher.x, y: LAUNCH_Y }];
  let x = launcher.x;
  let y = LAUNCH_Y;
  let vx = aim.x;
  let vy = aim.y;
  for (let travelled = 0; travelled < maxDistance; travelled += step) {
    x += vx * step;
    y += vy * step;
    if (x - BALL_RADIUS < 0) {
      x = BALL_RADIUS;
      vx = Math.abs(vx);
      points.push({ x, y });
    } else if (x + BALL_RADIUS > COLUMNS) {
      x = COLUMNS - BALL_RADIUS;
      vx = -Math.abs(vx);
      points.push({ x, y });
    }
    if (y - BALL_RADIUS <= 0) {
      points.push({ x, y: BALL_RADIUS });
      break;
    }
    if (occupied(Math.floor(x), Math.floor(y))) {
      points.push({ x, y });
      break;
    }
  }
  const last = points[points.length - 1];
  if (last.x !== x || last.y !== y) points.push({ x, y });
  return points;
}
