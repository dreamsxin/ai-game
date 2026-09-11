import { isSolid, tileAt } from './tiles.js';

// 一格瓦片一个世界单位，body 用左上角坐标加宽高，y 向下为正。
const EPS = 1e-6;

export const solidAt = (grid, col, row) => isSolid(tileAt(grid, col, row));

export const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;


const spanCols = (body) => [Math.floor(body.x + EPS), Math.floor(body.x + body.w - EPS)];
const spanRows = (body) => [Math.floor(body.y + EPS), Math.floor(body.y + body.h - EPS)];

// 脚下探 1/40 格，够判定站立又不会把贴地当成陷进地里。
export const isGrounded = (grid, body) => {
  const row = Math.floor(body.y + body.h + 0.025 - EPS);
  const [left, right] = spanCols(body);
  for (let col = left; col <= right; col += 1) {
    if (solidAt(grid, col, row)) return true;
  }
  return false;
};

// 分轴推进：先走 X 再走 Y，各自撞墙就贴边停下，这样斜向移动不会卡角。
export function moveBody(grid, body, dt) {
  const hit = { left: false, right: false, up: false, down: false };
  let { x, y, vx, vy } = body;
  const { w, h } = body;

  x += vx * dt;
  if (vx !== 0) {
    const forward = vx > 0;
    const col = forward ? Math.floor(x + w - EPS) : Math.floor(x + EPS);
    const [top, bottom] = spanRows({ x, y, w, h });
    for (let row = top; row <= bottom; row += 1) {
      if (!solidAt(grid, col, row)) continue;
      x = forward ? col - w : col + 1;
      vx = 0;
      if (forward) hit.right = true;
      else hit.left = true;
      break;
    }
  }

  y += vy * dt;
  let bumped = null;
  if (vy !== 0) {
    const falling = vy > 0;
    const row = falling ? Math.floor(y + h - EPS) : Math.floor(y + EPS);
    const [left, right] = spanCols({ x, y, w, h });
    let blocked = false;
    for (let col = left; col <= right; col += 1) {
      if (!solidAt(grid, col, row)) continue;
      blocked = true;
      // 头顶同时碰到两格时只顶离身体中心最近的那一格，和玛丽的手感一致。
      if (!falling) {
        const center = x + w / 2;
        if (!bumped || Math.abs(col + 0.5 - center) < Math.abs(bumped.col + 0.5 - center)) {
          bumped = { col, row };
        }
      }
    }
    if (blocked) {
      y = falling ? row - h : row + 1;
      vy = 0;
      if (falling) hit.down = true;
      else hit.up = true;
    }
  }

  return { body: { ...body, x, y, vx, vy }, hit, bumped };
}

// 敌人和道具走到平台边缘或撞墙就转向，参数化成一个小工具复用。
export function walkStep(grid, body, dt, { turnAtLedge = false } = {}) {
  const moved = moveBody(grid, body, dt);
  let next = moved.body;
  let dir = body.dir ?? (body.vx >= 0 ? 1 : -1);
  if (moved.hit.left || moved.hit.right) dir = -dir;
  if (turnAtLedge && moved.hit.down) {
    const ahead = dir > 0 ? Math.floor(next.x + next.w + 0.1) : Math.floor(next.x - 0.1);
    const below = Math.floor(next.y + next.h + 0.1);
    if (!solidAt(grid, ahead, below)) dir = -dir;
  }
  next = { ...next, dir };
  return { body: next, hit: moved.hit };
}
