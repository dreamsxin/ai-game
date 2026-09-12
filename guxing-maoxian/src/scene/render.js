// 渲染层只读模拟状态，相机平滑、粒子和角色动画这些纯表现的东西自己在这里维护。
const VIEW_COLS = 15;
const VIEW_ROWS = 9;
// 玩家保持在画面偏左的位置，右边留出更多提前量看清前方地形。
const LEAD = 0.42;

const PALETTES = [
  { top: '#5aa9e6', bottom: '#bfe3ff', hill: '#3f8f4f', hillBack: '#2f6f3f' },
  { top: '#2b3a6b', bottom: '#6d7fbf', hill: '#4a3b6b', hillBack: '#33284d' },
  { top: '#1b1f3b', bottom: '#4b3a7a', hill: '#3a2f6b', hillBack: '#241d4a' },
];

const TILE_COLORS = {
  '#': '#8a5a32',
  '=': '#8d9aa8',
  B: '#b5502a',
  '?': '#e6a91f',
  '!': '#d94fd0',
  C: '#e6a91f',
  U: '#6d5a3c',
  P: '#2fa860',
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const circle = (ctx, x, y, r) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
};

export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0, ready: false };
  let clock = 0;
  let particles = [];
  let popups = [];
  let lastLevel = null;

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
    const cell = Math.min(width / VIEW_COLS, height / VIEW_ROWS);
    return { ratio, width, height, cell, cols: width / cell, rows: height / cell };
  };

  // 相机平滑跟随，纵向只有在跳得比较高或掉下去时才跟，避免小跳时画面晃。
  const follow = (state, box, dt) => {
    const targetX = state.player.x + state.player.w / 2 - box.cols * LEAD;
    const maxX = Math.max(0, state.width - box.cols);
    const clampedX = Math.min(Math.max(targetX, 0), maxX);
    const targetY = state.player.y + state.player.h - box.rows * 0.62;
    const maxY = Math.max(0, state.height - box.rows);
    const clampedY = Math.min(Math.max(targetY, 0), maxY);
    if (!cam.ready) {
      cam.x = clampedX;
      cam.y = clampedY;
      cam.ready = true;
      return;
    }
    const easeX = Math.min(1, dt * 12);
    const easeY = Math.min(1, dt * 6);
    cam.x += (clampedX - cam.x) * easeX;
    cam.y += (clampedY - cam.y) * easeY;
  };

  // 背景两层山按不同系数跟着相机走，构成视差；云朵用相机位置算，不需要额外状态。
  const drawBackground = (box, palette) => {
    const sky = ctx.createLinearGradient(0, 0, 0, box.height);
    sky.addColorStop(0, palette.top);
    sky.addColorStop(1, palette.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, box.width, box.height);

    for (const layer of [
      { color: palette.hillBack, factor: 0.25, height: 0.32, span: 5.5 },
      { color: palette.hill, factor: 0.5, height: 0.22, span: 3.5 },
    ]) {
      const offset = cam.x * box.cell * layer.factor;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, box.height);
      for (let x = 0; x <= box.width; x += 8) {
        const t = (x + offset) / (box.cell * layer.span);
        const wave = (Math.sin(t) + Math.sin(t * 0.6 + 1.7)) / 2;
        ctx.lineTo(x, box.height * (1 - layer.height) - wave * box.cell * 1.2);
      }
      ctx.lineTo(box.width, box.height);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    for (let i = 0; i < 4; i += 1) {
      const cx = ((i * 260 - cam.x * box.cell * 0.15) % (box.width + 200)) - 100;
      const cy = box.height * (0.12 + (i % 3) * 0.08);
      const r = box.cell * (0.36 + (i % 2) * 0.14);
      circle(ctx, cx, cy, r);
      ctx.fill();
      circle(ctx, cx + r, cy + r * 0.2, r * 0.8);
      ctx.fill();
      circle(ctx, cx - r, cy + r * 0.25, r * 0.7);
      ctx.fill();
    }
  };

  const drawTile = (tile, px, py, cell, openAbove) => {
    if (tile === ' ') return;
    if (tile === 'o') {
      // 金币自转：用横向缩放模拟旋转，比换贴图省事。
      const wobble = Math.abs(Math.cos(clock * 5 + px * 0.05));
      ctx.fillStyle = '#ffd447';
      ctx.beginPath();
      ctx.ellipse(px + cell / 2, py + cell / 2, cell * 0.14 + cell * 0.16 * wobble, cell * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 78, 0, 0.5)';
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.stroke();
      return;
    }
    if (tile === 'x') {
      ctx.fillStyle = '#5a6472';
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(px + cell * (0.1 + i * 0.3), py + cell);
        ctx.lineTo(px + cell * (0.25 + i * 0.3), py + cell * 0.28);
        ctx.lineTo(px + cell * (0.4 + i * 0.3), py + cell);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    if (tile === 'G') {
      ctx.fillStyle = '#d8dee9';
      ctx.fillRect(px + cell * 0.42, py, cell * 0.16, cell);
      ctx.fillStyle = '#ff5470';
      ctx.beginPath();
      ctx.moveTo(px + cell * 0.58, py + cell * 0.08);
      ctx.lineTo(px + cell * 0.58 + cell * 0.7, py + cell * 0.3);
      ctx.lineTo(px + cell * 0.58, py + cell * 0.52);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const base = TILE_COLORS[tile] ?? '#77839a';
    ctx.fillStyle = base;
    ctx.fillRect(px, py, cell, cell);

    if (tile === '#') {
      if (openAbove) {
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(px, py, cell, cell * 0.24);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
      ctx.fillRect(px, py + cell * 0.72, cell, cell * 0.1);
      return;
    }
    if (tile === 'B') {
      ctx.strokeStyle = 'rgba(255, 235, 220, 0.35)';
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(px, py + cell / 2);
      ctx.lineTo(px + cell, py + cell / 2);
      ctx.moveTo(px + cell / 2, py);
      ctx.lineTo(px + cell / 2, py + cell / 2);
      ctx.moveTo(px + cell * 0.25, py + cell / 2);
      ctx.lineTo(px + cell * 0.25, py + cell);
      ctx.moveTo(px + cell * 0.75, py + cell / 2);
      ctx.lineTo(px + cell * 0.75, py + cell);
      ctx.stroke();
      return;
    }
    if (tile === 'P') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(px + cell * 0.12, py, cell * 0.16, cell);
      return;
    }
    if (tile === '?' || tile === '!' || tile === 'C') {
      const glyph = tile === '?' ? '?' : (tile === '!' ? '★' : '¤');
      const pulse = 0.72 + 0.28 * Math.abs(Math.sin(clock * 3));
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.font = `bold ${Math.round(cell * 0.62)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, px + cell / 2, py + cell * 0.56);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.strokeRect(px, py, cell, cell);
      return;
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.strokeRect(px, py, cell, cell);
  };

  // 主角「小菇」：一顶蘑菇帽加一双大眼睛，全靠几何图形画，不依赖任何贴图。
  const drawPlayer = (player, box, status) => {
    const cell = box.cell;
    const px = (player.x - cam.x) * cell;
    const py = (player.y - cam.y) * cell;
    const w = player.w * cell;
    const h = player.h * cell;
    // 无敌时帽子循环变色，受伤无敌期则闪烁。
    const blink = player.invuln > 0 && Math.floor(clock * 14) % 2 === 0;
    if (blink && status !== 'dying') ctx.globalAlpha = 0.4;
    const cap = player.star > 0 ? `hsl(${Math.floor(clock * 420) % 360}, 85%, 62%)` : '#ff5470';

    ctx.fillStyle = '#f7e3c8';
    roundRect(ctx, px + w * 0.12, py + h * 0.42, w * 0.76, h * 0.58, w * 0.22);
    ctx.fill();

    ctx.fillStyle = '#3f6fd8';
    roundRect(ctx, px + w * 0.16, py + h * 0.66, w * 0.68, h * 0.34, w * 0.16);
    ctx.fill();

    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(px + w / 2, py + h * 0.42, w * 0.58, h * 0.3, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    circle(ctx, px + w * 0.3, py + h * 0.3, w * 0.11);
    ctx.fill();
    circle(ctx, px + w * 0.72, py + h * 0.24, w * 0.08);
    ctx.fill();

    const look = player.dir >= 0 ? 1 : -1;
    ctx.fillStyle = '#243046';
    circle(ctx, px + w * (0.5 + look * 0.16), py + h * 0.58, w * 0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    // 跑动时脚下带一道拖影，速度越快越明显。
    const speed = Math.min(1, Math.abs(player.vx) / 9.2);
    if (speed > 0.4 && player.grounded) {
      ctx.fillRect(px - look * w * 0.4, py + h * 0.94, w * 0.5, h * 0.06);
    }
    ctx.globalAlpha = 1;
  };

  const drawItem = (item, box) => {

    const cell = box.cell;
    const px = (item.x - cam.x) * cell;
    const py = (item.y - cam.y) * cell;
    const w = item.w * cell;
    const h = item.h * cell;
    if (item.kind === 'star') {
      ctx.save();
      ctx.translate(px + w / 2, py + h / 2);
      ctx.rotate(clock * 4);
      ctx.fillStyle = '#ffd447';
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const radius = i % 2 === 0 ? w * 0.5 : w * 0.22;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#f7e3c8';
    roundRect(ctx, px + w * 0.18, py + h * 0.5, w * 0.64, h * 0.5, w * 0.18);
    ctx.fill();
    ctx.fillStyle = '#ff5470';
    ctx.beginPath();
    ctx.ellipse(px + w / 2, py + h * 0.52, w * 0.5, h * 0.42, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    circle(ctx, px + w * 0.34, py + h * 0.34, w * 0.1);
    ctx.fill();
    circle(ctx, px + w * 0.68, py + h * 0.28, w * 0.08);
    ctx.fill();
  };

  // 粒子和飘字都是纯表现，模拟层只发一个 effect，寿命在这里自己走完。
  const spawnBurst = (effect) => {
    const palette = {
      brick: '#b5502a',
      coin: '#ffd447',
      stomp: '#f0d8b8',
      kick: '#2fa860',
      star: '#ffd447',
      grow: '#ff5470',
      bump: '#e6a91f',
      jump: 'rgba(255, 255, 255, 0.5)',
      die: '#ff5470',
      shrink: '#ff9f43',
      clear: '#4de1ff',
    }[effect.type] ?? '#ffffff';
    const count = effect.type === 'jump' ? 3 : 8;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      particles = [
        ...particles,
        {
          x: effect.x + 0.5,
          y: effect.y + 0.5,
          vx: Math.cos(angle) * 3,
          vy: Math.sin(angle) * 3 - 2,
          life: 0.5,
          max: 0.5,
          color: palette,
        },
      ];
    }
  };

  const POPUP_TEXT = {
    coin: '+100',
    stomp: '+100',
    kick: '+200',
    grow: '强化',
    star: '无敌',
    clear: '过关',
  };

  const drawParticles = (box, dt) => {
    particles = particles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 12 * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const size = box.cell * 0.16;
      ctx.fillRect((p.x - cam.x) * box.cell - size / 2, (p.y - cam.y) * box.cell - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    popups = popups.map((p) => ({ ...p, y: p.y - dt * 1.6, life: p.life - dt })).filter((p) => p.life > 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(box.cell * 0.42)}px system-ui, sans-serif`;
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life / 0.4);
      ctx.fillStyle = '#fff8e1';
      ctx.fillText(p.text, (p.x + 0.5 - cam.x) * box.cell, (p.y - cam.y) * box.cell);
    }
    ctx.globalAlpha = 1;
  };

  // 敌人：菇菇怪是一坨会走的伞菌，乌龟多一层壳。全靠几何图形画，不依赖任何贴图。
  // 状态决定画法：walk 正常走，shell 只剩壳，sliding 壳在转，dead 压扁，flip 翻过来掉下去。
  const drawEnemy = (enemy, box) => {
    const cell = box.cell;
    const px = (enemy.x - cam.x) * cell;
    const py = (enemy.y - cam.y) * cell;
    const w = enemy.w * cell;
    const h = enemy.h * cell;
    const turtle = enemy.kind === 'turtle';
    const shelled = enemy.state === 'shell' || enemy.state === 'sliding';

    ctx.save();
    // 翻掉的敌人整体倒过来，和「踩扁」一眼分得开。
    if (enemy.state === 'flip') {
      ctx.translate(px + w / 2, py + h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-(px + w / 2), -(py + h / 2));
    }

    if (shelled) {
      // 滑行的壳自转，站着的壳快醒时抖一下当预告。
      const spin = enemy.state === 'sliding' ? clock * 9 * enemy.dir : 0;
      const wobble = enemy.state === 'shell' && enemy.timer < 1 ? Math.sin(clock * 26) * w * 0.05 : 0;
      ctx.save();
      ctx.translate(px + w / 2 + wobble, py + h / 2);
      ctx.rotate(spin);
      ctx.fillStyle = '#2fa860';
      circle(ctx, 0, 0, Math.min(w, h) * 0.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(-w * 0.34, 0);
      ctx.lineTo(w * 0.34, 0);
      ctx.moveTo(0, -h * 0.34);
      ctx.lineTo(0, h * 0.34);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
      return;
    }

    // 踩扁的那一下压成一张饼，靠 timer 收缩，不另外做动画状态。
    const squash = enemy.state === 'dead' ? Math.max(0.18, enemy.timer / 0.45) : 1;
    const bodyH = h * squash;
    const bodyY = py + h - bodyH;
    // 走动时左右晃一点，静止的和在走的一眼分得出。
    const sway = enemy.state === 'walk' ? Math.sin(clock * 11 + enemy.id) * w * 0.05 : 0;

    ctx.fillStyle = turtle ? '#2fa860' : '#f0d8b8';
    roundRect(ctx, px + w * 0.14 + sway, bodyY + bodyH * 0.44, w * 0.72, bodyH * 0.56, w * 0.2);
    ctx.fill();

    ctx.fillStyle = turtle ? '#7ad46a' : '#9b5fd0';
    ctx.beginPath();
    ctx.ellipse(px + w / 2 + sway, bodyY + bodyH * 0.46, w * 0.5, bodyH * 0.42, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    if (enemy.state !== 'dead') {
      const look = enemy.dir >= 0 ? 1 : -1;
      ctx.fillStyle = '#243046';
      circle(ctx, px + w * (0.5 + look * 0.15) + sway, bodyY + bodyH * 0.66, w * 0.07);
      ctx.fill();
      circle(ctx, px + w * (0.5 + look * 0.15) - look * w * 0.26 + sway, bodyY + bodyH * 0.66, w * 0.07);
      ctx.fill();
    }
    ctx.restore();
  };

  return {
    notify(effects) {
      for (const effect of effects) {
        spawnBurst(effect);
        const text = POPUP_TEXT[effect.type];
        if (text) popups = [...popups, { text, x: effect.x, y: effect.y, life: 0.8 }];
      }
    },
    render(state, dt = 0) {
      clock += dt;
      const box = layout();
      // 换关或重生时相机直接吸到新位置，不要拖一条横穿关卡的长镜头。
      if (lastLevel !== state.levelKey || state.status === 'ready') {
        cam.ready = false;
        lastLevel = state.levelKey;
      }
      follow(state, box, dt);
      ctx.setTransform(box.ratio, 0, 0, box.ratio, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      drawBackground(box, PALETTES[state.levelIndex % PALETTES.length]);

      const startCol = Math.max(0, Math.floor(cam.x) - 1);
      const endCol = Math.min(state.width - 1, Math.ceil(cam.x + box.cols) + 1);
      const startRow = Math.max(0, Math.floor(cam.y) - 1);
      const endRow = Math.min(state.height - 1, Math.ceil(cam.y + box.rows) + 1);
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const tile = state.grid[row][col];
          if (tile === ' ') continue;
          const above = row > 0 ? state.grid[row - 1][col] : ' ';
          drawTile(tile, (col - cam.x) * box.cell, (row - cam.y) * box.cell, box.cell, above === ' ');
        }
      }

      for (const item of state.items) drawItem(item, box);
      for (const enemy of state.enemies) drawEnemy(enemy, box);
      drawPlayer(state.player, box, state.status);
      drawParticles(box, dt);
    },
    dispose() {
      particles = [];
      popups = [];
      canvas.remove();
    },
  };
}






