import { canSee, circleBlocked } from './arena.js';
import { angleDelta, angleTo } from './aim.js';
import { MAG_SIZE, UNIT_RADIUS } from './rules.js';

// 机器人不寻路，只在这些走廊锚点之间游走：地图的横向长廊都在上面。
export const ROAM_POINTS = [
  { x: 2.5, y: 2.5 },
  { x: 10.5, y: 5.5 },
  { x: 17.5, y: 2.5 },
  { x: 2.5, y: 8.5 },
  { x: 10.5, y: 11.5 },
  { x: 17.5, y: 8.5 },
  { x: 2.5, y: 15.5 },
  { x: 10.5, y: 18.5 },
  { x: 17.5, y: 15.5 },
  { x: 10.5, y: 21.5 },
];

// 交火的舒适距离：太近被喷，太远打不动。
const NEAR = 3.4;
const FAR = 8.5;
const PROBE = UNIT_RADIUS + 0.55;

const DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return { x: Math.cos(a), y: Math.sin(a) };
});

// 八方向贪心避障：选能往目标推进又不撞墙的方向，绕掩体够用了。
export function steerTo(arena, unit, goal) {
  const dx = goal.x - unit.x;
  const dy = goal.y - unit.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const want = { x: dx / dist, y: dy / dist };
  let best = null;
  for (const dir of DIRS) {
    if (circleBlocked(arena, unit.x + dir.x * PROBE, unit.y + dir.y * PROBE)) continue;
    const score = dir.x * want.x + dir.y * want.y;
    if (!best || score > best.score) best = { dir, score };
  }
  if (!best) return { x: 0, y: 0 };
  return best.dir;
}

const nearestVisible = (arena, unit, enemies) => {
  let best = null;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (!canSee(arena, unit, enemy)) continue;
    const dist = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
    if (!best || dist < best.dist) best = { enemy, dist };
  }
  return best;
};

// 机器人一帧的意图：和玩家输入同构（移动向量 + 期望瞄准角 + 扣扳机），
// 因此模拟层对玩家和机器人走同一条推进路径。
export function botIntent(arena, unit, enemies, rng, dt) {
  const brain = { ...unit.brain };
  brain.retarget = Math.max(0, brain.retarget - dt);
  brain.strafeTimer = Math.max(0, brain.strafeTimer - dt);
  if (brain.strafeTimer === 0) {
    brain.strafe = rng.next() < 0.5 ? -1 : 1;
    brain.strafeTimer = 1 + rng.next() * 1.6;
  }

  const seen = nearestVisible(arena, unit, enemies);
  if (seen) {
    brain.memory = { x: seen.enemy.x, y: seen.enemy.y };
    brain.reaction = Math.max(0, brain.reaction - dt);
    if (brain.retarget === 0) {
      // 瞄准误差每隔一会儿重掷一次，枪口因此会「抖」而不是死盯。
      brain.error = rng.signed() * unit.skill.aimError;
      brain.retarget = 0.22 + rng.next() * 0.3;
    }
  } else {
    brain.reaction = unit.skill.reaction;
  }

  const goal = seen
    ? { x: seen.enemy.x, y: seen.enemy.y }
    : brain.memory ?? ROAM_POINTS[brain.roam % ROAM_POINTS.length];

  let move = steerTo(arena, unit, goal);
  if (seen) {
    // 交火时侧移拉扯，同时把距离往舒适区间推。
    const toward = angleTo(unit, seen.enemy);
    const radial = seen.dist < NEAR ? -1 : seen.dist > FAR ? 1 : 0;
    const strafeAngle = toward + (Math.PI / 2) * brain.strafe;
    move = {
      x: Math.cos(toward) * radial * 0.9 + Math.cos(strafeAngle) * 0.8,
      y: Math.sin(toward) * radial * 0.9 + Math.sin(strafeAngle) * 0.8,
    };
    // 侧移撞墙就翻面，别贴着掩体原地磨。
    if (circleBlocked(arena, unit.x + move.x * PROBE, unit.y + move.y * PROBE)) {
      brain.strafe = -brain.strafe;
      brain.strafeTimer = 0.6;
      move = steerTo(arena, unit, goal);
    }
  } else if (!brain.memory) {
    const point = ROAM_POINTS[brain.roam % ROAM_POINTS.length];
    if (Math.hypot(point.x - unit.x, point.y - unit.y) < 1) {
      brain.roam = (brain.roam + rng.int(1, 3)) % ROAM_POINTS.length;
    }
  } else if (Math.hypot(brain.memory.x - unit.x, brain.memory.y - unit.y) < 0.8) {
    brain.memory = null;
  }

  const desired = seen ? angleTo(unit, seen.enemy) + brain.error : Math.atan2(move.y, move.x);
  const aligned = seen ? Math.abs(angleDelta(unit.aim, desired)) < unit.skill.trigger : false;
  const fire = Boolean(seen) && aligned && brain.reaction === 0 && unit.ammo > 0 && !unit.reloading;
  const reload = unit.ammo === 0 || (!seen && unit.ammo < MAG_SIZE * 0.4);

  return {
    move,
    aimAngle: desired,
    fire,
    focus: Boolean(seen) && seen.dist > NEAR,
    reload,
    brain,
  };
}
