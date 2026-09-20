import { ENEMY_BULLET_SPEED } from './rules.js';
import { moveBody, walkStep } from './physics.js';

// 敌人表。hp 是要吃几发步枪弹，cd 是开火间隔（按 id 错开，免得整屏齐射）。
export const ENEMIES = {
  soldier: { w: 0.78, h: 1.34, hp: 2, speed: 2.6, cd: 1.7, score: 120 },
  jumper: { w: 0.78, h: 1.3, hp: 2, speed: 3.4, cd: 2.4, score: 160, jump: 1.5 },
  runner: { w: 0.8, h: 1.1, hp: 1, speed: 5.6, cd: 0, score: 100 },
  turret: { w: 0.9, h: 0.9, hp: 3, speed: 0, cd: 1.9, score: 180, fan: 3 },
};

export const enemySpec = (kind) => ENEMIES[kind] ?? ENEMIES.soldier;

export function spawnEnemy(spot, id) {
  const spec = enemySpec(spot.kind);
  return {
    id,
    kind: spot.kind,
    x: spot.x + (1 - spec.w) / 2,
    y: spot.y + (1 - spec.h),
    w: spec.w,
    h: spec.h,
    vx: 0,
    vy: 0,
    dir: -1,
    hp: spec.hp,
    // 开火节奏按 id 错开：同一排三个兵不会踩在同一帧上，弹幕才有缝。
    cool: spec.cd ? 0.35 + ((id * 7) % 11) * 0.11 : 0,
    jumpTimer: spec.jump ? ((id * 5) % 7) * 0.2 : 0,
    flash: 0,
    awake: false,
  };
}

export const centerOf = (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

// 朝目标的单位向量。敌人子弹都是直瞄的，所以跳起来就能从弹道上让开。
export function aimAt(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

const shot = (from, dir, speed = ENEMY_BULLET_SPEED) => ({
  x: from.x,
  y: from.y,
  vx: dir.x * speed,
  vy: dir.y * speed,
  dmg: 1,
  pierce: 0,
  owner: 'enemy',
});

/**
 * 推进一个敌人，返回它这一帧吐出的子弹。
 * 三种兵是三种压迫方式：步兵站住了开枪，跳兵会跨过掩体，冲锋兵完全不开枪只往身上撞。
 */
export function stepEnemy(grid, enemy, dt, { player, gravity }) {
  const spec = enemySpec(enemy.kind);
  const shots = [];
  const target = centerOf(player);
  const self = centerOf(enemy);
  let next = { ...enemy, flash: Math.max(0, enemy.flash - dt) };

  if (enemy.kind === 'turret') {
    next.cool = enemy.cool - dt;
    next.dir = target.x < self.x ? -1 : 1;
    if (next.cool <= 0) {
      next.cool = spec.cd;
      // 炮台打的是扇形：正对着它站没用，得从斜上或斜下切进去。
      const aim = aimAt(self, target);
      for (let i = 0; i < spec.fan; i += 1) {
        const angle = 0.22 * (i - (spec.fan - 1) / 2);
        shots.push(shot(self, {
          x: aim.x * Math.cos(angle) - aim.y * Math.sin(angle),
          y: aim.x * Math.sin(angle) + aim.y * Math.cos(angle),
        }));
      }
    }
    return { enemy: next, shots };
  }

  const toward = target.x < self.x ? -1 : 1;
  const chase = enemy.kind === 'runner' || Math.abs(target.x - self.x) > 2.2;
  const dir = chase ? toward : enemy.dir;
  next = { ...next, vx: dir * spec.speed, vy: Math.min(enemy.vy + gravity * dt, 26), dir };

  if (spec.jump) {
    next.jumpTimer = enemy.jumpTimer - dt;
    const grounded = enemy.vy === 0;
    if (next.jumpTimer <= 0 && grounded) {
      next.jumpTimer = spec.jump;
      next.vy = -13;
    }
  }

  const moved = walkStep(grid, next, dt, { turnAtLedge: enemy.kind !== 'runner' });
  next = { ...next, ...moved.body, dir: chase ? dir : moved.body.dir };

  if (spec.cd) {
    next.cool = enemy.cool - dt;
    // 只在大致同高时平射：站在高台上的玩家不会被地面兵隔着两层楼点中。
    const aligned = Math.abs(target.y - self.y) < 1.6;
    if (next.cool <= 0 && aligned && (target.x - self.x) * next.dir > 0) {
      next.cool = spec.cd;
      shots.push(shot({ x: self.x + next.dir * 0.4, y: self.y - 0.1 }, { x: next.dir, y: 0 }));
    }
  }

  return { enemy: next, shots };
}

export const BOSS_SIZE = { w: 3.4, h: 4.2 };

// 弱点开合的节奏：开 2.4 秒、闭 1.5 秒。闭合时打它一发不回弹（见 rules.refundFor('armor')），
// 所以「什么时候压上去」变成一道读拍子的题，而不是一路按住射击。
export const BOSS_OPEN = 2.4;
export const BOSS_SHUT = 1.5;
const BOSS_CD = 1.5;


export function spawnBoss(spot, hp) {
  return {
    x: spot.x - BOSS_SIZE.w + 1,
    y: spot.y - BOSS_SIZE.h + 1,
    w: BOSS_SIZE.w,
    h: BOSS_SIZE.h,
    hp,
    maxHp: hp,
    open: true,
    timer: BOSS_OPEN,
    cool: 0.9,
    flash: 0,
    active: false,
  };
}

// 弱点是前装甲下方的核心舱：开着的时候一发平射就能打进去。
// 它从半身高一直开到底，所以边跳边打也还能打中——但跳过一个身位就只剩装甲了。
// 打 Boss 的姿势因此是「贴着地面打」，而那恰好是它弹幕最想吃掉的高度。
export const weakBox = (boss) => ({
  x: boss.x,
  y: boss.y + BOSS_SIZE.h * 0.48,
  w: BOSS_SIZE.w * 0.4,
  h: BOSS_SIZE.h * 0.52,
});



export function stepBoss(boss, dt, { player }) {
  const shots = [];
  let next = { ...boss, flash: Math.max(0, boss.flash - dt), timer: boss.timer - dt, cool: boss.cool - dt };
  if (next.timer <= 0) {
    next.open = !boss.open;
    next.timer = next.open ? BOSS_OPEN : BOSS_SHUT;
  }
  if (next.cool <= 0) {
    next.cool = BOSS_CD;
    const from = { x: boss.x + BOSS_SIZE.w * 0.2, y: boss.y + BOSS_SIZE.h * 0.5 };
    const aim = aimAt(from, centerOf(player));
    // 开着弱点时弹幕更密：能打的那一拍也是最难站的那一拍。
    const count = next.open ? 4 : 2;

    for (let i = 0; i < count; i += 1) {
      const angle = 0.3 * (i - (count - 1) / 2);
      shots.push(shot(from, {
        x: aim.x * Math.cos(angle) - aim.y * Math.sin(angle),
        y: aim.x * Math.sin(angle) + aim.y * Math.cos(angle),
      }, ENEMY_BULLET_SPEED * 0.9));
    }
  }
  return { boss: next, shots };
}

export const POD_SIZE = { w: 0.92, h: 0.92 };

export const spawnPod = (spot, id, drop) => ({
  id,
  x: spot.x + (1 - POD_SIZE.w) / 2,
  y: spot.y + (1 - POD_SIZE.h),
  w: POD_SIZE.w,
  h: POD_SIZE.h,
  hp: 1,
  drop,
  flash: 0,
});

export const PICKUP_SIZE = { w: 0.74, h: 0.74 };

export const spawnPickup = (kind, x, y, id) => ({
  id,
  kind,
  x,
  y,
  w: PICKUP_SIZE.w,
  h: PICKUP_SIZE.h,
  vx: 0,
  vy: 0,
  life: 14,
});

// 掉落物会自己落地停住，捡不到就过期消失，免得满地都是白送的火力。
export function stepPickup(grid, pickup, dt, gravity) {
  const moved = moveBody(grid, { ...pickup, vy: Math.min(pickup.vy + gravity * dt, 18) }, dt);
  return { ...pickup, ...moved.body, life: pickup.life - dt };
}


