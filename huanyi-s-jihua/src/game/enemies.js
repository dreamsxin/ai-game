// 敌人与敌弹的行为。全部是纯函数：给一个敌人和 dt，返回新的敌人和它这一帧射出的子弹。
//
// 这一层最关键的一条是敌弹也有血量：敌弹能被打掉，所以「火力密度」同时是攻击力和防御力。
// 生存不完全靠躲，而是靠用足够的火力把弹幕抵消掉——这是这游戏和普通弹幕射击最大的分野。

import { ENEMY_BULLET_HP, FIELD_H, FIELD_W, KILL_SCORE, clamp } from './rules.js';

/** 敌人档案。hp 和射速在 spawn 时按关卡难度缩放，这里只写基线。 */
const KINDS = {
  zako: { hp: 3, w: 5, h: 5, vy: 26, cool: 3, score: KILL_SCORE.zako },
  diver: { hp: 4, w: 5, h: 5.5, vy: 52, cool: 4.2, score: KILL_SCORE.diver },
  turret: { hp: 9, w: 7, h: 7, vy: 20, cool: 2.4, score: KILL_SCORE.turret },
  ground: { hp: 7, w: 8, h: 6, vy: 16, cool: 3.2, score: KILL_SCORE.ground, armor: 'low' },
  carrier: { hp: 16, w: 9, h: 11, vy: 15, cool: 0, score: KILL_SCORE.carrier },
  wall: { hp: 14, w: 11, h: 8, vy: 18, cool: 0, score: 40, blocks: true },
};

export const enemyKinds = Object.keys(KINDS);

// 炮台在原地开火的时长（含下落那两秒），到点就继续往下滑走。
const TURRET_HOLD = 9;

/**
 * 生成一波敌人。站位由 seed 决定，所以同一关每次跑出来是同一张图。
 * wall 这一种特殊：它铺一整排并留一个缺口，缺口位置就是这一波的解法。
 */
export function spawnWave(item, { tune, rng, nextId }) {
  const base = KINDS[item.kind];
  if (!base) return { enemies: [], nextId };
  const enemies = [];
  let id = nextId;
  if (item.kind === 'wall') {
    const gap = rng.int(0, item.count - 1);
    for (let i = 0; i < item.count; i += 1) {
      if (i === gap) continue;
      const step = FIELD_W / item.count;
      enemies.push(makeEnemy('wall', id, step * (i + 0.5), -8 - Math.floor(i / 4) * 9, { tune }));
      id += 1;
    }
    return { enemies, nextId: id };
  }
  const spread = item.spread ?? 40;
  for (let i = 0; i < item.count; i += 1) {
    const ratio = item.count === 1 ? 0.5 : i / (item.count - 1);
    const x = clamp(FIELD_W / 2 + (ratio - 0.5) * spread * 2, 8, FIELD_W - 8);
    const y = -8 - i * (item.from === 'side' ? 3 : 7);
    const enemy = makeEnemy(item.kind, id, x, y, { tune, wing: item.wing });
    if (item.from === 'side') enemy.vx = i % 2 === 0 ? 22 : -22;
    if (item.kind === 'ground') enemy.y = -8 - i * 12;
    enemies.push(enemy);
    id += 1;
  }
  return { enemies, nextId: id };
}

export function makeEnemy(kind, id, x, y, { tune = { hp: 1, fire: 1, speed: 1 }, wing } = {}) {
  const base = KINDS[kind];
  const hp = Math.max(1, Math.round(base.hp * tune.hp));
  return {
    id,
    kind,
    x,
    y,
    vx: 0,
    vy: base.vy * tune.speed,
    hp,
    maxHp: hp,
    w: base.w,
    h: base.h,
    armor: base.armor ?? null,
    blocks: Boolean(base.blocks),
    score: base.score,
    cool: base.cool > 0 ? base.cool / tune.fire : 0,
    timer: base.cool > 0 ? base.cool / tune.fire : 0,
    wing: wing ?? null,
    age: 0,
  };
}

const shot = (id, x, y, vx, vy, kind = 'pellet') => ({ id, x, y, vx, vy, hp: ENEMY_BULLET_HP, kind, age: 0 });

/** 朝玩家瞄准。生物系的弹幕之所以难，是因为它算的是你现在在哪。 */
const aimAt = (from, to, speed) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
};

/**
 * 推进一个敌人。返回 `{ enemy, shots }`，shots 是这一帧新出膛的敌弹。
 * 打不到的敌人（飞出场地）由 simulation 负责回收。
 */
export function stepEnemy(enemy, dt, { ship, tune, nextId }) {
  const next = { ...enemy, age: enemy.age + dt };
  let id = nextId;
  const shots = [];

  if (enemy.kind === 'zako') {
    next.x = clamp(enemy.x + Math.sin(next.age * 2.2) * 26 * dt + enemy.vx * dt, 4, FIELD_W - 4);
    next.y = enemy.y + enemy.vy * dt;
  } else if (enemy.kind === 'diver') {
    // 俯冲：横向追着玩家的 x 走，所以站着不动最危险。
    const pull = clamp((ship.x - enemy.x) * 1.6, -32, 32);
    next.vx = enemy.vx + (pull - enemy.vx) * Math.min(1, dt * 3);
    next.x = clamp(enemy.x + next.vx * dt, 3, FIELD_W - 3);
    next.y = enemy.y + enemy.vy * dt;
  } else if (enemy.kind === 'turret') {
    // 炮台下到三分之一处停住开火，撑够 TURRET_HOLD 秒就继续往下走。
    // 让它永远钉在那儿会越攒越多，最后把上半屏封死——那不是难度，是设计事故。
    const hold = FIELD_H * 0.3;
    const parked = enemy.y >= hold && next.age < TURRET_HOLD;
    next.y = parked ? hold : enemy.y + enemy.vy * dt;
    next.x = clamp(enemy.x + Math.sin(next.age * 0.9) * 18 * dt, 6, FIELD_W - 6);
  } else {
    next.x = clamp(enemy.x + enemy.vx * dt, 4, FIELD_W - 4);
    next.y = enemy.y + enemy.vy * dt;
  }

  if (next.cool > 0 && next.y > 0) {
    next.timer = enemy.timer - dt;
    if (next.timer <= 0) {
      next.timer = next.cool;
      const speed = 30 * tune.speed;
      if (enemy.kind === 'turret') {
        // 环形五发：站在正下方最省事，也最容易被包住。
        for (let i = 0; i < 5; i += 1) {
          const deg = -50 + i * 25;
          const rad = (deg * Math.PI) / 180;
          shots.push(shot(id, next.x, next.y, Math.sin(rad) * speed, Math.cos(rad) * speed));
          id += 1;
        }
      } else if (enemy.kind === 'ground') {
        shots.push(shot(id, next.x, next.y, 0, speed * 0.8, 'shell'));
        id += 1;
      } else {
        const aim = aimAt(next, ship, speed);
        shots.push(shot(id, next.x, next.y, aim.vx, aim.vy));
        id += 1;
      }
    }
  }

  return { enemy: next, shots, nextId: id };
}

/** 敌弹只会直走。它们的威胁在数量，而数量是可以被火力抵消的。 */
export const stepShot = (bullet, dt) => ({
  ...bullet,
  x: bullet.x + bullet.vx * dt,
  y: bullet.y + bullet.vy * dt,
  age: bullet.age + dt,
});

export const offField = (item, margin = 16) =>
  item.y < -margin - 12 || item.y > FIELD_H + margin || item.x < -margin || item.x > FIELD_W + margin;
