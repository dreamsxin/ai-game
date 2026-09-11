import { fieldBox } from '../game/layout.js';
import { COLOR_HEX } from '../game/marbles.js';
import {
  BALL_RADIUS,
  COLUMNS,
  FIELD_ROWS,
  GRID_ROWS,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_Y,
  beatPeriod,
} from '../game/rules.js';

const POP_SECONDS = 0.26;
const FLASH_SECONDS = 0.18;

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// 渲染层只读状态，消除爆开和踩拍闪光这类纯表现计时自己维护。
export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'field-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let pops = [];
  let flash = 0;

  const layout = () => {
    const rect = host.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    return { ...fieldBox(width, height), ratio };
  };

  const drawField = (box) => {
    const w = box.cell * COLUMNS;
    const h = box.cell * FIELD_ROWS;
    const gradient = ctx.createLinearGradient(0, box.originY, 0, box.originY + h);
    gradient.addColorStop(0, 'rgba(16, 22, 44, 0.95)');
    gradient.addColorStop(1, 'rgba(6, 9, 20, 0.95)');
    ctx.fillStyle = gradient;
    roundRect(ctx, box.originX, box.originY, w, h, box.cell * 0.35);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 越线提示：弹珠墙压过这条线就输了。
    const lineY = box.originY + GRID_ROWS * box.cell;
    ctx.strokeStyle = 'rgba(255, 93, 122, 0.35)';
    ctx.setLineDash([box.cell * 0.25, box.cell * 0.2]);
    ctx.beginPath();
    ctx.moveTo(box.originX, lineY);
    ctx.lineTo(box.originX + w, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawMarble = (box, col, row, cell, scale = 1) => {
    const cx = box.originX + (col + 0.5) * box.cell;
    const cy = box.originY + (row + 0.5) * box.cell;
    const radius = (box.cell / 2 - Math.max(1, box.cell * 0.08)) * scale;
    if (radius <= 0) return;
    const color = COLOR_HEX[cell.color];
    const gradient = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.4, radius * 0.2, cx, cy, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    gradient.addColorStop(0.4, color);
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    // 被异色砸裂过的弹珠画一道裂纹，提示再来一下就碎。
    if (cell.damage > 0) {
      ctx.strokeStyle = 'rgba(10, 12, 24, 0.75)';
      ctx.lineWidth = Math.max(1, radius * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.5, cy - radius * 0.2);
      ctx.lineTo(cx - radius * 0.1, cy + radius * 0.15);
      ctx.lineTo(cx + radius * 0.45, cy - radius * 0.3);
      ctx.stroke();
    }
  };

  const drawPaddle = (box, state) => {
    const w = PADDLE_WIDTH * box.cell;
    const h = PADDLE_HEIGHT * box.cell;
    const x = box.originX + state.paddle.x * box.cell - w / 2;
    const y = box.originY + PADDLE_Y * box.cell;
    const color = COLOR_HEX[state.paddleColor];
    // 踩准拍子时挡板整条发光，这是律动倍率的即时反馈。
    if (flash > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = box.cell * 0.9 * (flash / FLASH_SECONDS);
    }
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    roundRect(ctx, x + w * 0.08, y + h * 0.18, w * 0.84, h * 0.3, h * 0.15);
    ctx.fill();
  };

  const drawBall = (box, state) => {
    const cx = box.originX + state.ball.x * box.cell;
    const cy = box.originY + state.ball.y * box.cell;
    const radius = BALL_RADIUS * box.cell;
    const color = COLOR_HEX[state.ball.color];
    ctx.shadowColor = color;
    ctx.shadowBlur = box.cell * 0.6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(cx - radius * 0.3, cy - radius * 0.32, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
  };

  // 节拍环：越接近下一拍越收紧，玩家靠它对准接球时机。
  const drawBeat = (box, state) => {
    const period = beatPeriod(state.level.bpm);
    const phase = period > 0 ? Math.min(1, Math.max(0, state.beatTimer / period)) : 0;
    const cx = box.originX + state.paddle.x * box.cell;
    const cy = box.originY + (PADDLE_Y + PADDLE_HEIGHT / 2) * box.cell;
    const radius = box.cell * (0.5 + (1 - phase) * 1.4);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + phase * 0.3})`;
    ctx.lineWidth = Math.max(1, box.cell * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  };

  return {
    notify(effects) {
      for (const effect of effects) {
        if (effect.type === 'clear' || effect.type === 'drop') {
          pops = [...pops, { cells: effect.cells, life: POP_SECONDS }];
        } else if (effect.type === 'pop' || effect.type === 'break') {
          pops = [...pops, { cells: [{ col: effect.col, row: effect.row }], life: POP_SECONDS }];
        } else if (effect.type === 'paddle' && effect.onBeat) {
          flash = FLASH_SECONDS;
        }
      }
    },
    render(state, dt = 0) {
      const box = layout();
      ctx.setTransform(box.ratio, 0, 0, box.ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawField(box);

      pops = pops.map((pop) => ({ ...pop, life: pop.life - dt })).filter((pop) => pop.life > 0);
      flash = Math.max(0, flash - dt);

      state.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell) drawMarble(box, x, y, cell);
        });
      });

      // 刚消掉的格子留一圈扩散的余光，让连消看得出来。
      for (const pop of pops) {
        const ratio = pop.life / POP_SECONDS;
        ctx.strokeStyle = `rgba(255, 255, 255, ${ratio * 0.55})`;
        ctx.lineWidth = Math.max(1, box.cell * 0.08);
        for (const { col, row } of pop.cells) {
          const cx = box.originX + (col + 0.5) * box.cell;
          const cy = box.originY + (row + 0.5) * box.cell;
          ctx.beginPath();
          ctx.arc(cx, cy, box.cell * (0.3 + (1 - ratio) * 0.4), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      drawBeat(box, state);
      drawPaddle(box, state);
      drawBall(box, state);
    },
    dispose() {
      pops = [];
      flash = 0;
      canvas.remove();
    },
  };
}
