import {
  BALL_RADIUS,
  COLUMNS,
  FIELD_ROWS,
  MAX_BOUNCE_ANGLE,
  MIN_HORIZONTAL_RATIO,
  MIN_VERTICAL_RATIO,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_Y,
} from './rules.js';

// 一个子步最多走这么多格，保证再快的球也不会穿过一格弹珠。
export const MAX_SUBSTEP = 0.18;

export const ballSpeed = (ball) => Math.hypot(ball.vx, ball.vy);

export const clampPaddle = (x) =>
  Math.min(COLUMNS - PADDLE_WIDTH / 2, Math.max(PADDLE_WIDTH / 2, x));

// 挡板反弹：落点离中心越远角度越斜，速度大小不变，方向永远朝上。
export function paddleBounce(ball, paddle, speed = ballSpeed(ball)) {
  const half = PADDLE_WIDTH / 2;
  const offset = Math.min(1, Math.max(-1, (ball.x - paddle.x) / half));
  const angle = offset * MAX_BOUNCE_ANGLE;
  return { vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed };
}

// 球永远保持斜着走：竖直分量太小会在墙下横着磨，横向分量太小会在一条空列里干弹。
export function keepAngle(vx, vy, sideHint = 1) {
  const speed = Math.hypot(vx, vy);
  if (speed === 0) return { vx, vy };
  let ax = Math.abs(vx);
  let ay = Math.abs(vy);
  const minY = speed * MIN_VERTICAL_RATIO;
  const minX = speed * MIN_HORIZONTAL_RATIO;
  if (ay < minY) {
    ay = minY;
    ax = Math.sqrt(Math.max(0, speed * speed - ay * ay));
  }
  if (ax < minX) {
    ax = minX;
    ay = Math.sqrt(Math.max(0, speed * speed - ax * ax));
  }
  const signX = vx === 0 ? Math.sign(sideHint) || 1 : Math.sign(vx);
  const signY = vy === 0 ? -1 : Math.sign(vy);
  return { vx: signX * ax, vy: signY * ay };
}

// 横向分量归零时朝场地中央推，保证结果只由状态决定、可复现。
const sideHintOf = (ball) => (ball.x < COLUMNS / 2 ? 1 : -1);

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

// 把球推出格子并反弹：穿透浅的那个轴才是真正撞上的面。
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
  let touched = false;
  if (next.x - BALL_RADIUS < 0) {
    next = { ...next, x: BALL_RADIUS, vx: Math.abs(next.vx) };
    touched = true;
  } else if (next.x + BALL_RADIUS > COLUMNS) {
    next = { ...next, x: COLUMNS - BALL_RADIUS, vx: -Math.abs(next.vx) };
    touched = true;
  }
  if (next.y - BALL_RADIUS < 0) {
    next = { ...next, y: BALL_RADIUS, vy: Math.abs(next.vy) };
    touched = true;
  }
  return { ball: next, touched };
}

function hitPaddle(ball, paddle, world) {
  if (ball.vy <= 0) return null;
  const top = PADDLE_Y;
  const bottom = PADDLE_Y + PADDLE_HEIGHT;
  if (ball.y + BALL_RADIUS < top || ball.y - BALL_RADIUS > bottom) return null;
  if (Math.abs(ball.x - paddle.x) > PADDLE_WIDTH / 2 + BALL_RADIUS) return null;
  const speed = ballSpeed(ball);
  const bounced = paddleBounce(ball, paddle, speed);
  const color = world.paddle?.(ball) ?? ball.color;
  return { ...ball, y: top - BALL_RADIUS, ...keepAngle(bounced.vx, bounced.vy, sideHintOf(ball)), color };
}

// 定步长推进一颗球：分子步走位，每个子步最多结算一次撞击。
// world.occupied 查格子，world.hit 交给模拟层决定消除还是反弹，world.paddle 返回接球后的新颜色。
export function advanceBall(ball, paddle, dt, world) {
  const speed = ballSpeed(ball);
  const distance = speed * dt;
  const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
  const slice = dt / steps;
  let next = ball;
  let lost = false;
  let paddleHits = 0;
  let wallHits = 0;
  let marbleHits = 0;

  for (let i = 0; i < steps; i += 1) {
    next = { ...next, x: next.x + next.vx * slice, y: next.y + next.vy * slice };

    const walls = hitWalls(next);
    next = walls.ball;
    if (walls.touched) wallHits += 1;

    const paddled = hitPaddle(next, paddle, world);
    if (paddled) {
      next = paddled;
      paddleHits += 1;
    }

    const cell = findCell(next, world.occupied);
    if (cell) {
      marbleHits += 1;
      const result = world.hit(cell.col, cell.row, next) ?? {};
      // 消掉整组时球直接穿过去，继续在墙里钻，这就是连消的爽点。
      if (!result.pass) {
        const bounced = reflectOff(next, cell.col, cell.row);
        next = { ...bounced, ...keepAngle(bounced.vx, bounced.vy, sideHintOf(bounced)) };
      }
    }

    if (next.y - BALL_RADIUS > FIELD_ROWS) {
      lost = true;
      break;
    }
  }

  return { ball: next, lost, paddleHits, wallHits, marbleHits };
}
