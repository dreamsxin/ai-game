import { ENEMY_SPEED, GRAVITY, ITEM_SPEED, MAX_FALL, SHELL_SPEED, SHELL_WAKE, TURTLE_SPEED } from './rules.js';
import { walkStep } from './physics.js';

// 敌人与道具都是「贴着地面走的小盒子」，尺寸略小于一格，免得卡在窄缝里。
const ENEMY_SIZE = {
  walker: { w: 0.8, h: 0.8 },
  turtle: { w: 0.8, h: 0.9 },
};
const SHELL_SIZE = { w: 0.8, h: 0.68 };
const ITEM_SIZE = { w: 0.78, h: 0.78 };
// 道具从块里冒出来的时间，这段时间内不受重力也不碰撞。
const EMERGE_TIME = 0.36;
const DEAD_TIME = 0.45;
const FLIP_TIME = 1.2;

export function spawnEnemy(spot, id) {
  const size = ENEMY_SIZE[spot.kind] ?? ENEMY_SIZE.walker;
  const speed = spot.kind === 'turtle' ? TURTLE_SPEED : ENEMY_SPEED;
  return {
    id,
    kind: spot.kind,
    state: 'walk',
    x: spot.x + (1 - size.w) / 2,
    y: spot.y + (1 - size.h),
    w: size.w,
    h: size.h,
    vx: -speed,
    vy: 0,
    dir: -1,
    timer: 0,
    awake: false,
  };
}

// 道具从被顶的块里往上升一格，最终停在块顶上（baseY 就是那个位置）。
export function spawnItem(kind, col, row, id) {
  const baseY = row - ITEM_SIZE.h;
  return {
    id,
    kind,
    state: 'emerge',
    x: col + (1 - ITEM_SIZE.w) / 2,
    y: baseY + 1,
    w: ITEM_SIZE.w,
    h: ITEM_SIZE.h,
    vx: 0,
    vy: 0,
    dir: 1,
    timer: EMERGE_TIME,
    baseY,
  };
}

const fall = (body, dt) => ({ ...body, vy: Math.min(body.vy + GRAVITY * dt, MAX_FALL) });

// 头顶被顶到的块把踩在上面的敌人翻掉，和踩扁走不同的动画。
export const flipEnemy = (enemy) => ({ ...enemy, state: 'flip', vy: -9, vx: enemy.dir * 2, timer: FLIP_TIME });

export const stompEnemy = (enemy) => {
  if (enemy.kind === 'turtle' && enemy.state === 'walk') {
    return { ...enemy, state: 'shell', w: SHELL_SIZE.w, h: SHELL_SIZE.h, y: enemy.y + enemy.h - SHELL_SIZE.h, vx: 0, timer: SHELL_WAKE };
  }
  if (enemy.state === 'sliding') return { ...enemy, state: 'shell', vx: 0, timer: SHELL_WAKE };
  return { ...enemy, state: 'dead', vx: 0, timer: DEAD_TIME };
};

// 站着的壳被从侧面碰到就踢出去，滑行的壳能撞飞路上的其他敌人。
export const kickShell = (enemy, dir) => ({ ...enemy, state: 'sliding', dir, vx: dir * SHELL_SPEED, timer: 0 });

export const isEnemyThreat = (enemy) => enemy.state === 'walk' || enemy.state === 'sliding';

export const isStompable = (enemy) => enemy.state === 'walk' || enemy.state === 'shell' || enemy.state === 'sliding';

export function stepEnemy(grid, enemy, dt) {
  if (enemy.state === 'dead') return { ...enemy, timer: enemy.timer - dt };
  if (enemy.state === 'flip') {
    const vy = Math.min(enemy.vy + GRAVITY * dt, MAX_FALL);
    return { ...enemy, x: enemy.x + enemy.vx * dt, y: enemy.y + vy * dt, vy, timer: enemy.timer - dt };
  }
  if (enemy.state === 'shell') {
    const moved = walkStep(grid, fall(enemy, dt), dt);
    return { ...moved.body, timer: enemy.timer - dt, state: enemy.timer - dt <= 0 ? 'walk' : 'shell' };
  }

  const speed = enemy.state === 'sliding'
    ? SHELL_SPEED
    : (enemy.kind === 'turtle' ? TURTLE_SPEED : ENEMY_SPEED);
  const moving = { ...fall(enemy, dt), vx: enemy.dir * speed };
  // 壳滑行时不看悬崖，乌龟到边缘会转身，菇菇怪会直接走下去。
  const turnAtLedge = enemy.state === 'walk' && enemy.kind === 'turtle';
  const moved = walkStep(grid, moving, dt, { turnAtLedge });
  return { ...moved.body, vx: moved.body.dir * speed };
}

export function stepItem(grid, item, dt) {
  if (item.state === 'emerge') {
    const timer = item.timer - dt;
    const progress = Math.min(1, (EMERGE_TIME - timer) / EMERGE_TIME);
    const y = item.baseY + 1 - progress;
    if (timer > 0) return { ...item, timer, y };
    const speed = item.kind === 'star' ? ITEM_SPEED * 1.5 : ITEM_SPEED;
    return { ...item, state: 'live', timer: 0, y: item.baseY, vx: speed, dir: 1 };
  }

  const speed = item.kind === 'star' ? ITEM_SPEED * 1.5 : ITEM_SPEED;
  const moved = walkStep(grid, { ...fall(item, dt), vx: item.dir * speed }, dt);
  const next = { ...moved.body, vx: moved.body.dir * speed };
  // 星星落地就弹一下，比蘑菇难抓也更显眼。
  if (item.kind === 'star' && moved.hit.down) return { ...next, vy: -11 };
  return next;
}

// 道具刚冒出来时可能整格都还在块里，这时不允许被吃到。
export const itemReady = (item) => item.state !== 'emerge';

// 被顶的那格上方正好站着敌人时把它翻掉，判定放宽到 0.35 格。
export const standsOnTile = (entity, col, row) =>
  Math.abs(entity.y + entity.h - row) < 0.35 && entity.x + entity.w > col + 0.05 && entity.x < col + 0.95;

