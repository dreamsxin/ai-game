import { castRay } from './arena.js';
import { BULLET_RANGE, BULLET_SPEED, UNIT_RADIUS, damageAt } from './rules.js';

export function spawnBullet(id, unit, angle) {
  // 枪口从身体边缘出膛，否则贴墙开枪会立刻打在自己脚下。
  const offset = UNIT_RADIUS + 0.08;
  return {
    id,
    ownerId: unit.id,
    team: unit.team,
    x: unit.x + Math.cos(angle) * offset,
    y: unit.y + Math.sin(angle) * offset,
    angle,
    traveled: 0,
  };
}

// 线段与圆的最近命中参数 t（0~1），没打到返回 null。
export function segmentCircle(x0, y0, x1, y1, cx, cy, radius) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  // 起点已经在圆里：贴身命中，t 直接算 0。
  if (c < 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

// 子弹按 dt 推进一段：先看这一段里最近的是敌人还是墙。
// 友军不挡子弹（没有友伤），否则队友会堵住走廊里的火线。
export function advanceBullets(arena, bullets, units, dt) {
  const alive = [];
  const hits = [];
  const impacts = [];
  for (const bullet of bullets) {
    const remain = BULLET_RANGE - bullet.traveled;
    const length = Math.min(BULLET_SPEED * dt, remain);
    const ux = Math.cos(bullet.angle);
    const uy = Math.sin(bullet.angle);
    const x1 = bullet.x + ux * length;
    const y1 = bullet.y + uy * length;

    const wall = castRay(arena, bullet.x, bullet.y, ux, uy, length);
    let bestT = wall.hit ? wall.distance / (length || 1) : Infinity;
    let victim = null;
    for (const unit of units) {
      if (!unit.alive || unit.team === bullet.team) continue;
      const t = segmentCircle(bullet.x, bullet.y, x1, y1, unit.x, unit.y, UNIT_RADIUS);
      if (t === null || t >= bestT) continue;
      bestT = t;
      victim = unit;
    }

    if (victim) {
      const px = bullet.x + ux * length * bestT;
      const py = bullet.y + uy * length * bestT;
      const distance = bullet.traveled + length * bestT;
      hits.push({
        bulletId: bullet.id,
        ownerId: bullet.ownerId,
        team: bullet.team,
        targetId: victim.id,
        damage: damageAt(distance),
        distance,
        x: px,
        y: py,
      });
      continue;
    }
    if (wall.hit) {
      impacts.push({ x: wall.x, y: wall.y, angle: bullet.angle });
      continue;
    }
    const traveled = bullet.traveled + length;
    if (traveled >= BULLET_RANGE - 1e-9) {
      impacts.push({ x: x1, y: y1, angle: bullet.angle });
      continue;
    }
    alive.push({ ...bullet, x: x1, y: y1, traveled });
  }
  return { bullets: alive, hits, impacts };
}
