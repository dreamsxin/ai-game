import { isPlatform, isSolid, tileAt } from './tiles.js';

// 一格瓦片一个世界单位，body 用左上角坐标加宽高，y 向下为正。
const EPS = 1e-6;

export const solidAt = (grid, col, row) => isSolid(tileAt(grid, col, row));
export const platAt = (grid, col, row) => isPlatform(tileAt(grid, col, row));

export const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const pointIn = (x, y, box) =>
  x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;

const spanCols = (body) => [Math.floor(body.x + EPS), Math.floor(body.x + body.w - EPS)];
const spanRows = (body) => [Math.floor(body.y + EPS), Math.floor(body.y + body.h - EPS)];

// 脚下探 1/40 格，够判定站立又不会把贴地当成陷进地里。单向平台也算地面。
export const isGrounded = (grid, body) => {
  const row = Math.floor(body.y + body.h + 0.025 - EPS);
  const [left, right] = spanCols(body);
  // 站在平台上时脚底刚好在平台上沿：探到的那一格若是平台，只有脚确实在它上面才算。
  const onTop = body.y + body.h <= row + 0.05;
  for (let col = left; col <= right; col += 1) {
    if (solidAt(grid, col, row)) return true;
    if (onTop && platAt(grid, col, row)) return true;
  }
  return false;
};

/**
 * 分轴推进：先走 X 再走 Y，各自撞墙就贴边停下。
 * 单向平台只在「正在下落且上一帧脚还在平台上沿之上」时挡人，
 * 所以从下往上跳能穿过去，按住下键（dropping）则整帧忽略平台，这就是横版射击的下落穿板。
 */
export function moveBody(grid, body, dt, { dropping = false } = {}) {
  const hit = { left: false, right: false, up: false, down: false };
  let { x, y, vx, vy } = body;
  const { w, h } = body;
  const prevBottom = y + h;

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
  if (vy !== 0) {
    const falling = vy > 0;
    const row = falling ? Math.floor(y + h - EPS) : Math.floor(y + EPS);
    const [left, right] = spanCols({ x, y, w, h });
    let blocked = false;
    for (let col = left; col <= right; col += 1) {
      if (solidAt(grid, col, row)) {
        blocked = true;
        break;
      }
      if (falling && !dropping && platAt(grid, col, row) && prevBottom <= row + 0.02) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      y = falling ? row - h : row + 1;
      vy = 0;
      if (falling) hit.down = true;
      else hit.up = true;
    }
  }

  return { body: { ...body, x, y, vx, vy }, hit };
}

// 走到平台边缘或撞墙就转向，敌人共用这一个小工具。
export function walkStep(grid, body, dt, { turnAtLedge = true } = {}) {
  const moved = moveBody(grid, body, dt);
  let next = moved.body;
  let dir = body.dir ?? (body.vx >= 0 ? 1 : -1);
  if (moved.hit.left || moved.hit.right) dir = -dir;
  if (turnAtLedge && moved.hit.down) {
    const ahead = dir > 0 ? Math.floor(next.x + next.w + 0.1) : Math.floor(next.x - 0.1);
    const below = Math.floor(next.y + next.h + 0.1);
    if (!solidAt(grid, ahead, below) && !platAt(grid, ahead, below)) dir = -dir;
  }
  return { body: { ...next, dir }, hit: moved.hit };
}

// 子弹只做点判定：撞到实心瓦片就没了，单向平台不挡子弹（否则钢架下面成了绝对安全区）。
export const bulletBlocked = (grid, x, y) => solidAt(grid, Math.floor(x), Math.floor(y));
