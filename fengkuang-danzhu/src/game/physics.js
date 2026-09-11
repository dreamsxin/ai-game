import {
  BALL_RADIUS,
  COLUMNS,
  FLOOR_Y,
  MIN_VERTICAL_RATIO,
  PULL_DOWN_SPEED,
} from './rules.js';

// 一个子步最多走这么多格，保证再快的弹珠也不会穿过一格砖。
export const MAX_SUBSTEP = 0.14;

export const speedOf = (ball) => Math.hypot(ball.vx, ball.vy);

// 撞砖后竖直分量太小会让弹珠贴着砖缝横向磨，强行掰回一个最小仰角。
export function keepVertical(vx, vy) {
  const speed = Math.hypot(vx, vy);
  if (speed === 0) return { vx, vy };
  const minVy = speed * MIN_VERTICAL_RATIO;
  if (Math.abs(vy) >= minVy) return { vx, vy };
  const signY = vy === 0 ? -1 : Math.sign(vy);
  const nextVy = signY * minVy;
  const nextVx = Math.sign(vx || 1) * Math.sqrt(Math.max(0, speed * speed - nextVy * nextVy));
  return { vx: nextVx, vy: nextVy };
}

// 回合超时后把弹珠拽向地面：速度大小不变，方向压到向下，回合一定收得住。
export function pullDown(ball) {
  const speed = Math.max(PULL_DOWN_SPEED, speedOf(ball));
  const vy = Math.abs(ball.vy) || speed;
  const scaled = keepVertical(ball.vx, Math.max(vy, speed * 0.5));
  return { ...ball, vx: scaled.vx, vy: Math.abs(scaled.vy) };
}

const overlaps = (ball, col, row) =>
  ball.x + BALL_RADIUS > col &&
  ball.x - BALL_RADIUS < col + 1 &&
  ball.y + BALL_RADIUS > row &&
  ball.y - BALL_RADIUS < row + 1;

// 命中哪一格：取重叠面积最大的那格，平手时按列行顺序，保证可复现。
function findCell(ball, occupied) {
  const minCol = Math.floor(ball.x - BALL_RADIUS);
  const maxCol = Math.floor(ball.x + BALL_RADIUS);
  const minRow = Math.floor(ball.y - BALL_RADIUS);
  const maxRow = Math.floor(ball.y + BALL_RADIUS);
  let best = null;
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      if (!occupied(col, row) || !overlaps(ball, col, row)) continue;
      const dx = Math.min(ball.x + BALL_RADIUS, col + 1) - Math.max(ball.x - BALL_RADIUS, col);
      const dy = Math.min(ball.y + BALL_RADIUS, row + 1) - Math.max(ball.y - BALL_RADIUS, row);
      const area = dx * dy;
      if (!best || area > best.area + 1e-9) best = { col, row, area };
    }
  }
  return best;
}

// 把弹珠推出格子并反弹：穿透浅的那个轴才是真正撞上的面。
function reflectOff(ball, col, row) {
  const overlapLeft = ball.x + BALL_RADIUS - col;
  const overlapRight = col + 1 - (ball.x - BALL_RADIUS);
  const overlapTop = ball.y + BALL_RADIUS - row;
  const overlapBottom = row + 1 - (ball.y - BALL_RADIUS);
  const spanX = Math.min(overlapLeft, overlapRight);
  const spanY = Math.min(overlapTop, overlapBottom);
  if (spanX <= spanY) {
    const toLeft = overlapLeft < overlapRight;
    return {
      ...ball,
      x: toLeft ? col - BALL_RADIUS : col + 1 + BALL_RADIUS,
      vx: toLeft ? -Math.abs(ball.vx) : Math.abs(ball.vx),
    };
  }
  const toTop = overlapTop < overlapBottom;
  return {
    ...ball,
    y: toTop ? row - BALL_RADIUS : row + 1 + BALL_RADIUS,
    vy: toTop ? -Math.abs(ball.vy) : Math.abs(ball.vy),
  };
}

function hitWalls(ball) {
  let next = ball;
  if (next.x - BALL_RADIUS < 0) next = { ...next, x: BALL_RADIUS, vx: Math.abs(next.vx) };
  else if (next.x + BALL_RADIUS > COLUMNS) next = { ...next, x: COLUMNS - BALL_RADIUS, vx: -Math.abs(next.vx) };
  if (next.y - BALL_RADIUS < 0) next = { ...next, y: BALL_RADIUS, vy: Math.abs(next.vy) };
  return next;
}

// 推进一颗弹珠，返回它的新状态；落地的弹珠标成 landed，由上层回收。
export function advanceBall(ball, dt, world) {
  const distance = speedOf(ball) * dt;
  const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
  const slice = dt / steps;
  let next = ball;
  let hits = 0;
  for (let i = 0; i < steps; i += 1) {
    next = hitWalls({ ...next, x: next.x + next.vx * slice, y: next.y + next.vy * slice });
    const cell = findCell(next, world.occupied);
    if (cell) {
      hits += 1;
      const result = world.hit(cell.col, cell.row, next) ?? {};
      // 加珠这种不挡路的格子直接穿过去，砖块才反弹。
      if (!result.pass) {
        const bounced = reflectOff(next, cell.col, cell.row);
        next = { ...bounced, ...keepVertical(bounced.vx, bounced.vy) };
      }
    }
    if (next.y - BALL_RADIUS > FLOOR_Y) {
      next = { ...next, landed: true };
      break;
    }
  }
  return { ball: next, hits };
}

// 一帧推进所有在飞的弹珠：落地的挑出来交给上层，按顺序处理保证确定性。
export function advanceBalls(balls, dt, world, { pull = false } = {}) {
  const flying = [];
  const landed = [];
  let hits = 0;
  for (const current of balls) {
    const flight = advanceBall(pull ? pullDown(current) : current, dt, world);
    hits += flight.hits;
    if (flight.ball.landed) landed.push(flight.ball);
    else flying.push(flight.ball);
  }
  return { balls: flying, landed, hits };
}
