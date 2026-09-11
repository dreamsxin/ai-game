import { fieldBox } from '../game/layout.js';
import { BOMB_COLOR, PLUS_COLOR, brickColor } from '../game/bricks.js';
import { previewPath } from '../game/aim.js';
import { at } from '../game/grid.js';
import {
  BALL_RADIUS,
  COLUMNS,
  FIELD_ROWS,
  GRID_ROWS,
  LAUNCH_Y,
} from '../game/rules.js';

const POP_SECONDS = 0.3;

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// 渲染层只读状态，拆砖闪光这类纯表现计时自己维护。
export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'field-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let pops = [];

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
    roundRect(ctx, box.originX, box.originY, w, h, box.cell * 0.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 底线：砖块压过这条线就结束。
    const lineY = box.originY + GRID_ROWS * box.cell;
    ctx.strokeStyle = 'rgba(255, 93, 122, 0.4)';
    ctx.setLineDash([box.cell * 0.22, box.cell * 0.18]);
    ctx.beginPath();
    ctx.moveTo(box.originX, lineY);
    ctx.lineTo(box.originX + w, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawCell = (box, col, row, cell) => {
    const pad = Math.max(1, box.cell * 0.06);
    const x = box.originX + col * box.cell + pad;
    const y = box.originY + row * box.cell + pad;
    const size = box.cell - pad * 2;
    if (cell.kind === 'plus') {
      // 加珠画成一颗带十字的小球，和砖块区分开。
      ctx.fillStyle = 'rgba(92, 232, 138, 0.18)';
      roundRect(ctx, x, y, size, size, size * 0.3);
      ctx.fill();
      ctx.strokeStyle = PLUS_COLOR;
      ctx.lineWidth = Math.max(1.5, size * 0.1);
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + size / 2 - size * 0.14, y + size / 2);
      ctx.lineTo(x + size / 2 + size * 0.14, y + size / 2);
      ctx.moveTo(x + size / 2, y + size / 2 - size * 0.14);
      ctx.lineTo(x + size / 2, y + size / 2 + size * 0.14);
      ctx.stroke();
      return;
    }
    const color = cell.kind === 'bomb' ? BOMB_COLOR : brickColor(cell.hp);
    ctx.fillStyle = color;
    roundRect(ctx, x, y, size, size, size * 0.22);
    ctx.fill();
    if (cell.kind === 'bomb') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = Math.max(1, size * 0.07);
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 血量直接印在砖上，玩家一眼算出要几下。
    ctx.fillStyle = 'rgba(6, 10, 22, 0.88)';
    ctx.font = `700 ${Math.round(size * 0.44)}px 'PingFang SC', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cell.hp), x + size / 2, y + size / 2 + size * 0.02);
  };

  // 预瞄虚线：只在瞄准阶段画，碰到砖或天花板就收尾。
  const drawAim = (box, state) => {
    const path = previewPath(state.launcher, state.aim, (col, row) => Boolean(at(state.grid, col, row)));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = Math.max(1, box.cell * 0.05);
    ctx.setLineDash([box.cell * 0.18, box.cell * 0.16]);
    ctx.beginPath();
    path.forEach((point, index) => {
      const px = box.originX + point.x * box.cell;
      const py = box.originY + point.y * box.cell;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const tip = path[path.length - 1];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(box.originX + tip.x * box.cell, box.originY + tip.y * box.cell, box.cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawLauncher = (box, state) => {
    const cx = box.originX + state.launcher.x * box.cell;
    const cy = box.originY + LAUNCH_Y * box.cell;
    ctx.fillStyle = 'rgba(77, 225, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, box.cell * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 225, 255, 0.35)';
    ctx.lineWidth = Math.max(1, box.cell * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, box.cell * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    // 还没射出去的弹珠堆在发射口下面，数量一眼可见。
    if (state.queued > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = `700 ${Math.round(box.cell * 0.3)}px 'PingFang SC', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${state.queued}`, cx, cy + box.cell * 0.28);
    }
  };

  const drawBalls = (box, state) => {
    ctx.fillStyle = '#f4f7ff';
    ctx.shadowColor = 'rgba(244, 247, 255, 0.8)';
    ctx.shadowBlur = box.cell * 0.35;
    for (const ball of state.balls) {
      ctx.beginPath();
      ctx.arc(box.originX + ball.x * box.cell, box.originY + ball.y * box.cell, BALL_RADIUS * box.cell, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  return {
    notify(effects) {
      for (const effect of effects) {
        if (effect.type === 'break') {
          pops = [...pops, { cells: effect.cells, life: POP_SECONDS }];
        } else if (effect.type === 'pickup') {
          pops = [...pops, { cells: [{ col: effect.col, row: effect.row }], life: POP_SECONDS }];
        }
      }
    },
    render(state, dt = 0) {
      const box = layout();
      ctx.setTransform(box.ratio, 0, 0, box.ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawField(box);

      pops = pops.map((pop) => ({ ...pop, life: pop.life - dt })).filter((pop) => pop.life > 0);

      state.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell) drawCell(box, x, y, cell);
        });
      });

      // 刚拆掉的格子留一圈扩散余光，连爆看得出规模。
      for (const pop of pops) {
        const ratio = pop.life / POP_SECONDS;
        ctx.strokeStyle = `rgba(255, 255, 255, ${ratio * 0.6})`;
        ctx.lineWidth = Math.max(1, box.cell * 0.07);
        for (const { col, row } of pop.cells) {
          const cx = box.originX + (col + 0.5) * box.cell;
          const cy = box.originY + (row + 0.5) * box.cell;
          ctx.beginPath();
          ctx.arc(cx, cy, box.cell * (0.28 + (1 - ratio) * 0.45), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (state.phase === 'aim' && state.status !== 'over') drawAim(box, state);
      drawLauncher(box, state);
      drawBalls(box, state);
    },
    dispose() {
      pops = [];
      canvas.remove();
    },
  };
}
