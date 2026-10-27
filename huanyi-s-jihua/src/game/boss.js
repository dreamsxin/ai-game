// Boss。每个 Boss 都是一道题，题面是弱点类型，答案是某一种机翼。
//
// 血量在 levels.js 按「推荐机翼的有效 DPS × 目标时长」反推好了，这里只管走位和吐弹。
// 伤害倍率由 wings.js 的 damageMultiplier 决定，Boss 自己不知道玩家带的是什么。

import { FIELD_W, clamp } from './rules.js';

const RAD = Math.PI / 180;

/** 各套走位的档案：出场高度、体型、开火节奏。 */
const PATTERNS = {
  sweep: { y: 30, w: 30, h: 16, cool: 1.6, speed: 24 },
  twin: { y: 28, w: 38, h: 14, cool: 1.9, speed: 17 },
  ring: { y: 32, w: 26, h: 22, cool: 2.2, speed: 13 },
  fortress: { y: 26, w: 44, h: 18, cool: 2.4, speed: 11 },
  centipede: { y: 34, w: 24, h: 12, cool: 0.9, speed: 56 },
  fortressCore: { y: 30, w: 40, h: 22, cool: 1.7, speed: 18 },
};

export const bossPatterns = Object.keys(PATTERNS);

export function makeBoss(level, tune) {
  const shape = PATTERNS[level.boss.pattern] ?? PATTERNS.sweep;
  // Boss 血量不吃 tune.hp：难度递进已经写在关卡的 ttk 里了，再乘一次就是双重加价。
  // 杂兵才按 tune.hp 变厚，Boss 变的是走位和吐弹频率。
  const hp = level.boss.hp;
  return {
    name: level.boss.name,
    weak: level.boss.weak,
    pattern: level.boss.pattern,
    hp,
    maxHp: hp,
    x: FIELD_W / 2,
    y: -shape.h,
    w: shape.w,
    h: shape.h,
    holdY: shape.y,
    dir: 1,
    speed: shape.speed * tune.speed,
    cool: shape.cool / tune.fire,
    timer: shape.cool / tune.fire,
    age: 0,
    entering: true,
    // 半血换姿态：吐弹更密、走得更快。第二阶段是给「打到一半才发现拿错机翼」的人准备的惩罚。
    rage: false,
  };
}

const shot = (id, x, y, vx, vy, kind = 'pellet') => ({ id, x, y, vx, vy, hp: 1, kind, age: 0 });

const fan = (id, x, y, count, spanDeg, speed, kind) => {
  const shots = [];
  for (let i = 0; i < count; i += 1) {
    const deg = count === 1 ? 0 : -spanDeg / 2 + (spanDeg / (count - 1)) * i;
    shots.push(shot(id + i, x, y, Math.sin(deg * RAD) * speed, Math.cos(deg * RAD) * speed, kind));
  }
  return shots;
};

/**
 * 推进 Boss。返回 `{ boss, shots }`。
 * 入场阶段（entering）不开火也不吃伤害之外的判定，给玩家看清体型和弱点的机会。
 */
export function stepBoss(boss, dt, { ship, nextId }) {
  const next = { ...boss, age: boss.age + dt };
  let id = nextId;
  const shots = [];

  if (boss.entering) {
    next.y = Math.min(boss.holdY, boss.y + 26 * dt);
    next.entering = next.y < boss.holdY;
    return { boss: next, shots, nextId: id };
  }

  next.rage = boss.hp <= boss.maxHp * 0.5;
  const pace = next.rage ? 1.35 : 1;

  if (boss.pattern === 'centipede') {
    // 机器蜈蚣：高速横移加上下起伏，站着不动一定会被弹幕包住。
    next.x = boss.x + boss.dir * boss.speed * pace * dt;
    if (next.x < boss.w / 2 || next.x > FIELD_W - boss.w / 2) next.dir = -boss.dir;
    next.x = clamp(next.x, boss.w / 2, FIELD_W - boss.w / 2);
    next.y = boss.holdY + Math.sin(next.age * 1.6) * 8;
  } else if (boss.pattern === 'fortress' || boss.pattern === 'fortressCore') {
    next.x = boss.x + boss.dir * boss.speed * pace * dt;
    if (next.x < boss.w / 2 + 2 || next.x > FIELD_W - boss.w / 2 - 2) next.dir = -boss.dir;
    next.x = clamp(next.x, boss.w / 2 + 2, FIELD_W - boss.w / 2 - 2);
  } else {
    next.x = boss.x + boss.dir * boss.speed * pace * dt;
    if (next.x < boss.w / 2 + 4 || next.x > FIELD_W - boss.w / 2 - 4) next.dir = -boss.dir;
    next.x = clamp(next.x, boss.w / 2 + 4, FIELD_W - boss.w / 2 - 4);
    next.y = boss.holdY + Math.sin(next.age * 0.8) * 4;
  }

  next.timer = boss.timer - dt * pace;
  if (next.timer > 0) return { boss: next, shots, nextId: id };
  next.timer = boss.cool;

  const speed = 32 * (next.rage ? 1.2 : 1);
  const bottom = next.y + next.h / 2;
  if (boss.pattern === 'sweep') {
    const dx = ship.x - next.x;
    const deg = clamp(Math.atan2(dx, Math.max(20, ship.y - bottom)) / RAD, -46, 46);
    shots.push(...fan(id, next.x, bottom, next.rage ? 5 : 3, 26, speed).map((item) => ({
      ...item,
      vx: item.vx + Math.sin(deg * RAD) * speed * 0.6,
    })));
    id += next.rage ? 5 : 3;
  } else if (boss.pattern === 'twin') {
    // 两侧炮座各吐一束：正面站着最安全，可你也打不到弱点。
    for (const side of [-1, 1]) {
      shots.push(...fan(id, next.x + (side * next.w) / 2, bottom, 3, 34, speed));
      id += 3;
    }
  } else if (boss.pattern === 'ring') {
    const count = next.rage ? 12 : 9;
    for (let i = 0; i < count; i += 1) {
      const deg = (360 / count) * i + next.age * 12;
      shots.push(shot(id, next.x, next.y, Math.sin(deg * RAD) * speed * 0.8, Math.cos(deg * RAD) * speed * 0.8));
      id += 1;
    }
  } else if (boss.pattern === 'centipede') {
    // 泼出去的一大片：这就是第 9 关那道题，答案是持续移动加上足够的火力密度。
    shots.push(...fan(id, next.x, bottom, next.rage ? 9 : 7, 120, speed * 0.9));
    id += next.rage ? 9 : 7;
  } else {
    // 堡垒：慢速重弹加一层贴地散射，重弹血厚，打掉它要花几发。
    shots.push(shot(id, next.x, bottom, 0, speed * 0.7, 'shell'));
    id += 1;
    shots.push(...fan(id, next.x, bottom, 5, 80, speed * 0.75));
    id += 5;
    if (boss.pattern === 'fortressCore' && next.rage) {
      shots.push(...fan(id, next.x, bottom, 7, 150, speed * 0.6));
      id += 7;
    }
  }

  return { boss: next, shots, nextId: id };
}

/**
 * 弱点的画面位置。渲染层照这个画标记，玩家才看得出「该往哪打」——
 * 弱点是情报，不该只写在关卡简报里。
 */
export function weakSpots(boss) {
  if (!boss) return [];
  if (boss.weak === 'side') {
    return [
      { x: boss.x - boss.w / 2, y: boss.y, r: 3.4 },
      { x: boss.x + boss.w / 2, y: boss.y, r: 3.4 },
    ];
  }
  if (boss.weak === 'core') return [{ x: boss.x, y: boss.y, r: 4.2 }];
  if (boss.weak === 'low') return [{ x: boss.x, y: boss.y + boss.h / 2 - 1, r: 3.8 }];
  return [];
}
