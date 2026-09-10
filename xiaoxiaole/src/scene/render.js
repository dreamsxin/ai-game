import { boardBox, cellCenter } from '../game/layout.js';
import { KIND_COLORS } from '../game/tiles.js';

const BOARD_TOP = 'rgba(12, 17, 34, 0.92)';
const BOARD_BOTTOM = 'rgba(6, 9, 20, 0.92)';
const GRID_LINE = 'rgba(255, 255, 255, 0.05)';
const POP_SECONDS = 0.24;

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// 渲染层只读状态，另外自己维护消除爆开这类纯表现的计时。
export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'board-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let pops = [];

  const layout = (state) => {
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
    const box = boardBox(width, height, state.board[0].length, state.board.length);
    return { ...box, ratio };
  };

  const drawSpecial = (cx, cy, radius, special) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = Math.max(2, radius * 0.22);
    ctx.lineCap = 'round';
    if (special === 'row' || special === 'col') {
      ctx.beginPath();
      if (special === 'row') {
        ctx.moveTo(cx - radius * 0.72, cy);
        ctx.lineTo(cx + radius * 0.72, cy);
      } else {
        ctx.moveTo(cx, cy - radius * 0.72);
        ctx.lineTo(cx, cy + radius * 0.72);
      }
      ctx.stroke();
    } else if (special === 'bomb') {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
    } else if (special === 'rainbow') {
      const colors = Object.values(KIND_COLORS);
      colors.forEach((color, index) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, radius * 0.26);
        const from = (index / colors.length) * Math.PI * 2;
        ctx.arc(cx, cy, radius * 0.62, from, from + (Math.PI * 2) / colors.length);
        ctx.stroke();
      });
    }
    ctx.restore();
  };

  const drawTile = (box, x, y, t, { scale = 1, lift = 0 } = {}) => {
    const center = cellCenter(box, x, y);
    const radius = (box.cell / 2 - Math.max(2, box.cell * 0.09)) * scale;
    if (radius <= 0) return;
    const cy = center.y - lift;
    const gradient = ctx.createRadialGradient(center.x - radius * 0.3, cy - radius * 0.4, radius * 0.2, center.x, cy, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(0.35, KIND_COLORS[t.kind]);
    gradient.addColorStop(1, KIND_COLORS[t.kind]);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center.x, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    if (t.special) drawSpecial(center.x, cy, radius, t.special);
  };

  const drawRing = (box, x, y, color, width) => {
    const px = box.originX + x * box.cell;
    const py = box.originY + y * box.cell;
    const pad = Math.max(2, box.cell * 0.06);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    roundRect(ctx, px + pad, py + pad, box.cell - pad * 2, box.cell - pad * 2, Math.max(4, box.cell * 0.28));
    ctx.stroke();
  };

  return {
    notify(effects) {
      for (const effect of effects) {
        if (effect.type === 'clear') {
          pops = [...pops, { cells: effect.cells, life: POP_SECONDS }];
        }
      }
    },
    render(state, dt = 0) {
      const box = layout(state);
      ctx.setTransform(box.ratio, 0, 0, box.ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const boardW = box.cell * box.columns;
      const boardH = box.cell * box.rows;
      const gradient = ctx.createLinearGradient(0, box.originY, 0, box.originY + boardH);
      gradient.addColorStop(0, BOARD_TOP);
      gradient.addColorStop(1, BOARD_BOTTOM);
      ctx.fillStyle = gradient;
      roundRect(ctx, box.originX, box.originY, boardW, boardH, Math.round(box.cell * 0.3));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.strokeStyle = GRID_LINE;
      ctx.beginPath();
      for (let x = 1; x < box.columns; x += 1) {
        ctx.moveTo(box.originX + x * box.cell, box.originY);
        ctx.lineTo(box.originX + x * box.cell, box.originY + boardH);
      }
      for (let y = 1; y < box.rows; y += 1) {
        ctx.moveTo(box.originX, box.originY + y * box.cell);
        ctx.lineTo(box.originX + boardW, box.originY + y * box.cell);
      }
      ctx.stroke();

      // 正在消除的格子按剩余寿命缩小，其余按常态画。
      const popScale = new Map();
      pops = pops.map((pop) => ({ ...pop, life: pop.life - dt })).filter((pop) => pop.life > 0);
      for (const pop of pops) {
        for (const [x, y] of pop.cells) popScale.set(`${x},${y}`, Math.max(0.1, pop.life / POP_SECONDS));
      }

      state.board.forEach((row, y) => {
        row.forEach((t, x) => {
          if (!t) return;
          const scale = popScale.get(`${x},${y}`) ?? 1;
          drawTile(box, x, y, t, { scale });
        });
      });

      if (state.selected) {
        drawRing(box, state.selected.x, state.selected.y, 'rgba(255, 255, 255, 0.9)', Math.max(2, box.cell * 0.08));
      }
      if (state.swap?.rejected) {
        for (const spot of [state.swap.a, state.swap.b]) {
          drawRing(box, spot.x, spot.y, 'rgba(255, 93, 122, 0.9)', Math.max(2, box.cell * 0.08));
        }
      }
      if (state.cursor) {
        drawRing(box, state.cursor.x, state.cursor.y, 'rgba(77, 225, 255, 0.55)', Math.max(1, box.cell * 0.05));
      }
    },
    dispose() {
      pops = [];
      canvas.remove();
    },
  };
}
