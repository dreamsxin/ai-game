import { PIECE_COLORS, pieceCells } from '../game/pieces.js';

const GRID_LINE = 'rgba(255, 255, 255, 0.06)';
const WELL_TOP = 'rgba(12, 17, 34, 0.92)';
const WELL_BOTTOM = 'rgba(6, 9, 20, 0.92)';
const FLASH_SECONDS = 0.26;

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// 渲染层只读状态，另外自己维护消行闪光这类纯表现的计时。
export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'well-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let flashes = [];

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
    const columns = state.board[0].length;
    const rows = state.board.length;
    const cell = Math.floor(Math.min(width / columns, height / rows));
    return {
      ratio,
      cell,
      originX: Math.floor((width - cell * columns) / 2),
      originY: Math.floor((height - cell * rows) / 2),
      columns,
      rows,
    };
  };

  const drawCell = (ctx2, box, x, y, color, { ghost = false } = {}) => {
    const px = box.originX + x * box.cell;
    const py = box.originY + y * box.cell;
    const pad = Math.max(1, Math.round(box.cell * 0.06));
    const size = box.cell - pad * 2;
    const radius = Math.max(2, Math.round(box.cell * 0.16));
    if (ghost) {
      ctx2.globalAlpha = 0.22;
      ctx2.fillStyle = color;
      roundRect(ctx2, px + pad, py + pad, size, size, radius);
      ctx2.fill();
      ctx2.globalAlpha = 0.5;
      ctx2.strokeStyle = color;
      ctx2.lineWidth = Math.max(1, box.cell * 0.06);
      ctx2.stroke();
      ctx2.globalAlpha = 1;
      return;
    }
    ctx2.fillStyle = color;
    roundRect(ctx2, px + pad, py + pad, size, size, radius);
    ctx2.fill();
    // 顶部高光让方块有一点体积感。
    ctx2.fillStyle = 'rgba(255, 255, 255, 0.22)';
    roundRect(ctx2, px + pad, py + pad, size, Math.max(2, size * 0.26), radius);
    ctx2.fill();
  };

  return {
    notify(effects) {
      for (const effect of effects) {
        if (effect.type === 'clear') {
          flashes = [...flashes, { rows: effect.rows, life: FLASH_SECONDS }];
        }
      }
    },
    render(state, dt = 0) {
      const box = layout(state);
      ctx.setTransform(box.ratio, 0, 0, box.ratio, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const wellW = box.cell * box.columns;
      const wellH = box.cell * box.rows;
      const gradient = ctx.createLinearGradient(0, box.originY, 0, box.originY + wellH);
      gradient.addColorStop(0, WELL_TOP);
      gradient.addColorStop(1, WELL_BOTTOM);
      ctx.fillStyle = gradient;
      roundRect(ctx, box.originX, box.originY, wellW, wellH, Math.round(box.cell * 0.3));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.strokeStyle = GRID_LINE;
      ctx.beginPath();
      for (let x = 1; x < box.columns; x += 1) {
        ctx.moveTo(box.originX + x * box.cell, box.originY);
        ctx.lineTo(box.originX + x * box.cell, box.originY + wellH);
      }
      for (let y = 1; y < box.rows; y += 1) {
        ctx.moveTo(box.originX, box.originY + y * box.cell);
        ctx.lineTo(box.originX + wellW, box.originY + y * box.cell);
      }
      ctx.stroke();

      state.board.forEach((row, y) => {
        row.forEach((type, x) => {
          if (type) drawCell(ctx, box, x, y, PIECE_COLORS[type]);
        });
      });

      if (state.active && state.status !== 'over') {
        const { type, rotation, x, y } = state.active;
        const color = PIECE_COLORS[type];
        for (const [cx, cy] of pieceCells(type, rotation)) {
          const gy = state.ghostY + cy;
          if (gy >= 0 && state.ghostY !== y) drawCell(ctx, box, x + cx, gy, color, { ghost: true });
        }
        for (const [cx, cy] of pieceCells(type, rotation)) {
          if (y + cy >= 0) drawCell(ctx, box, x + cx, y + cy, color);
        }
      }

      if (flashes.length) {
        flashes = flashes
          .map((flash) => ({ ...flash, life: flash.life - dt }))
          .filter((flash) => flash.life > 0);
        for (const flash of flashes) {
          ctx.fillStyle = `rgba(255, 255, 255, ${(flash.life / FLASH_SECONDS) * 0.55})`;
          for (const row of flash.rows) {
            ctx.fillRect(box.originX, box.originY + row * box.cell, wellW, box.cell);
          }
        }
      }
    },
    dispose() {
      flashes = [];
      canvas.remove();
    },
  };
}
