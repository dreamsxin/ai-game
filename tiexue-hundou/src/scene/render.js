import { weakBox } from '../game/entities.js';

// 渲染层只读模拟状态，相机平滑、枪口火光、弹壳这些纯表现的东西自己在这里维护。
// 视野按「至少看到 11 列、至多 12 行」取较小的那个格子尺寸：
// 竖屏手机上这样能把地平线压到画面下三分之一，横屏则自然变成一条宽走廊。
const VIEW_COLS = 11;
const VIEW_ROWS = 12;
// 玩家保持在画面偏左：横版跑射的危险都在右边，得把提前量留给前方。
const LEAD = 0.38;

const PALETTES = [
  { top: '#0d2b23', bottom: '#1f5f43', far: '#123a2c', near: '#0b241c', ink: '#7fd8a8' },
  { top: '#131c33', bottom: '#2c3e63', far: '#1b2745', near: '#111a2e', ink: '#8fb6ff' },
  { top: '#2a1c2e', bottom: '#5a3550', far: '#3a2440', near: '#22162a', ink: '#ff9fd0' },
  { top: '#1b2a33', bottom: '#3f6473', far: '#27414e', near: '#16232b', ink: '#8fe4ff' },
];

const TILE_COLORS = {
  '#': '#4a5b3c',
  '=': '#6b7280',
  '-': '#8b8f98',
  o: '#7a5a34',
};

const BULLET_COLORS = { rifle: '#ffe066', spread: '#ffb347', machine: '#fff3b0', laser: '#7cf7ff' };

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
  let flashes = [];
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

  // 相机横向跟得紧、纵向跟得松：跳一下画面不该跟着弹，掉下去才跟。
  const follow = (state, box, dt) => {
    const targetX = state.player.x + state.player.w / 2 - box.cols * LEAD;
    const clampedX = Math.min(Math.max(targetX, 0), Math.max(0, state.width - box.cols));
    const targetY = state.player.y + state.player.h - box.rows * 0.66;
    const clampedY = Math.min(Math.max(targetY, 0), Math.max(0, state.height - box.rows));
    if (!cam.ready) {
      cam.x = clampedX;
      cam.y = clampedY;
      cam.ready = true;
      return;
    }
    cam.x += (clampedX - cam.x) * Math.min(1, dt * 13);
    cam.y += (clampedY - cam.y) * Math.min(1, dt * 5);
  };

  // 背景两层剪影按不同系数跟着相机走，构成视差；不画云，画的是远处的林线与塔架。
  const drawBackground = (box, palette) => {
    const sky = ctx.createLinearGradient(0, 0, 0, box.height);
    sky.addColorStop(0, palette.top);
    sky.addColorStop(1, palette.bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, box.width, box.height);

    for (const layer of [
      { color: palette.far, factor: 0.22, base: 0.42, span: 6.5, height: 2.6 },
      { color: palette.near, factor: 0.46, base: 0.24, span: 3.2, height: 1.7 },
    ]) {
      const offset = cam.x * box.cell * layer.factor;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, box.height);
      for (let x = 0; x <= box.width; x += 10) {
        const t = (x + offset) / (box.cell * layer.span);
        const wave = (Math.sin(t) + Math.sin(t * 0.57 + 1.3)) / 2;
        ctx.lineTo(x, box.height * (1 - layer.base) - wave * box.cell * layer.height);
      }
      ctx.lineTo(box.width, box.height);
      ctx.closePath();
      ctx.fill();
    }
  };

  const drawTile = (tile, px, py, cell, openAbove) => {
    if (tile === ' ') return;
    if (tile === 'x') {
      // 水面：两道来回晃的亮线，一眼看出这里踩不得。
      ctx.fillStyle = 'rgba(70, 140, 200, 0.55)';
      ctx.fillRect(px, py, cell, cell);
      ctx.strokeStyle = 'rgba(200, 240, 255, 0.5)';
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.beginPath();
      for (let i = 0; i < 2; i += 1) {
        const y = py + cell * (0.26 + i * 0.3);
        ctx.moveTo(px, y + Math.sin(clock * 3 + px * 0.1 + i) * cell * 0.06);
        ctx.lineTo(px + cell, y + Math.cos(clock * 3 + px * 0.1 + i) * cell * 0.06);
      }
      ctx.stroke();
      return;
    }
    if (tile === '-') {
      // 单向钢架画得薄：厚了玩家会以为是墙。
      ctx.fillStyle = TILE_COLORS['-'];
      ctx.fillRect(px, py, cell, cell * 0.22);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(px + cell * (0.12 + i * 0.3), py + cell * 0.22, cell * 0.08, cell * 0.16);
      }
      return;
    }

    ctx.fillStyle = TILE_COLORS[tile] ?? '#5b6472';
    ctx.fillRect(px, py, cell, cell);
    if (tile === '#' && openAbove) {
      ctx.fillStyle = '#6f8a4a';
      ctx.fillRect(px, py, cell, cell * 0.2);
    }
    if (tile === 'o') {
      ctx.strokeStyle = 'rgba(255, 230, 190, 0.35)';
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.strokeRect(px + cell * 0.12, py + cell * 0.12, cell * 0.76, cell * 0.76);
      ctx.beginPath();
      ctx.moveTo(px + cell * 0.12, py + cell * 0.12);
      ctx.lineTo(px + cell * 0.88, py + cell * 0.88);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(px, py + cell * 0.82, cell, cell * 0.18);
  };

  // 主角：一个背着装备的兵。枪朝哪边是靠 ax/ay 画出来的，八个方向都看得出来。
  const drawPlayer = (player, box, status) => {
    const cell = box.cell;
    const px = (player.x - cam.x) * cell;
    const py = (player.y - cam.y) * cell;
    const w = player.w * cell;
    const h = player.h * cell;
    const blink = player.invuln > 0 && Math.floor(clock * 14) % 2 === 0;
    if (blink && status !== 'dying') ctx.globalAlpha = 0.45;

    ctx.fillStyle = '#2f5d3a';
    roundRect(ctx, px, py + h * 0.22, w, h * 0.78, w * 0.2);
    ctx.fill();
    // 头盔
    ctx.fillStyle = '#d8c7a0';
    circle(ctx, px + w * 0.5, py + h * 0.16, w * 0.34);
    ctx.fill();
    ctx.fillStyle = '#243046';
    circle(ctx, px + w * (player.dir > 0 ? 0.66 : 0.34), py + h * 0.17, w * 0.09);
    ctx.fill();

    // 枪：从胸口指向瞄准方向，长度一格出头，弹匣见底时枪身发暗。
    const cx = px + w * 0.5;
    const cy = py + h * (player.prone ? 0.42 : 0.44);
    const len = cell * 0.85;
    ctx.strokeStyle = player.reloading ? 'rgba(200, 200, 210, 0.45)' : '#e8e4da';
    ctx.lineWidth = Math.max(2, cell * 0.11);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + player.ax * len, cy + player.ay * len);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // 三种兵三种颜色：褐色的步兵、紫色的跳兵、红色的冲锋兵。
  // 冲锋兵背后还有一道速度线——「这个不开枪但会撞死你」要一眼分得出。
  const drawEnemy = (enemy, box) => {
    const cell = box.cell;
    const px = (enemy.x - cam.x) * cell;
    const py = (enemy.y - cam.y) * cell;
    const w = enemy.w * cell;
    const h = enemy.h * cell;
    const hurt = enemy.flash > 0;

    if (enemy.kind === 'turret') {
      // 炮台：一个带转管的墩子，朝着玩家那一侧伸出来。
      ctx.fillStyle = hurt ? '#ffffff' : '#7b6b8f';
      roundRect(ctx, px, py + h * 0.2, w, h * 0.8, w * 0.22);
      ctx.fill();
      ctx.strokeStyle = '#d8d2e6';
      ctx.lineWidth = Math.max(2, cell * 0.12);
      ctx.beginPath();
      ctx.moveTo(px + w * 0.5, py + h * 0.5);
      ctx.lineTo(px + w * 0.5 + enemy.dir * cell * 0.62, py + h * 0.62);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 120, 120, 0.9)';
      circle(ctx, px + w * 0.5, py + h * 0.34, w * 0.14);
      ctx.fill();
      return;
    }

    const body = enemy.kind === 'runner' ? '#a33c3c' : (enemy.kind === 'jumper' ? '#8a5ea8' : '#5f4b3a');
    ctx.fillStyle = hurt ? '#ffffff' : body;
    roundRect(ctx, px, py + h * 0.2, w, h * 0.8, w * 0.18);
    ctx.fill();
    ctx.fillStyle = hurt ? '#ffffff' : '#cbb996';
    circle(ctx, px + w * 0.5, py + h * 0.16, w * 0.32);
    ctx.fill();
    ctx.fillStyle = '#1b2330';
    circle(ctx, px + w * (enemy.dir > 0 ? 0.66 : 0.34), py + h * 0.17, w * 0.08);
    ctx.fill();
    if (enemy.kind === 'runner') {
      ctx.strokeStyle = 'rgba(255, 140, 140, 0.6)';
      ctx.lineWidth = Math.max(1, cell * 0.07);
      ctx.beginPath();
      ctx.moveTo(px + w * 0.5 - enemy.dir * w * 0.9, py + h * 0.5);
      ctx.lineTo(px + w * 0.5 - enemy.dir * w * 0.3, py + h * 0.5);
      ctx.stroke();
    }
  };

  // Boss：一台履带机器。核心舱开着的时候亮起来——玩家要读的就是这一下明暗。
  const drawBoss = (boss, box) => {
    const cell = box.cell;
    const px = (boss.x - cam.x) * cell;
    const py = (boss.y - cam.y) * cell;
    const w = boss.w * cell;
    const h = boss.h * cell;

    ctx.fillStyle = boss.flash > 0 ? '#ffffff' : '#41485c';
    roundRect(ctx, px, py, w, h, cell * 0.24);
    ctx.fill();
    ctx.fillStyle = '#2b3140';
    ctx.fillRect(px, py + h * 0.86, w, h * 0.14);
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(px + w * (0.08 + i * 0.18), py + h * 0.88, w * 0.1, h * 0.1);
    }

    const weak = weakBox(boss);
    const wx = (weak.x - cam.x) * cell;
    const wy = (weak.y - cam.y) * cell;
    const ww = weak.w * cell;
    const wh = weak.h * cell;
    if (boss.open) {
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(clock * 6));
      ctx.fillStyle = `rgba(255, 96, 96, ${pulse})`;
      roundRect(ctx, wx, wy, ww, wh, cell * 0.12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 220, 220, 0.9)';
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.stroke();
    } else {
      // 闭合时画成一排装甲板：这时候打上去只会响一声闷响。
      ctx.fillStyle = '#6a7284';
      roundRect(ctx, wx, wy, ww, wh, cell * 0.1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = Math.max(1, cell * 0.06);
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(wx, wy + (wh / 3) * (i + 0.5));
        ctx.lineTo(wx + ww, wy + (wh / 3) * (i + 0.5));
        ctx.stroke();
      }
    }
    // 炮口
    ctx.fillStyle = '#20242e';
    ctx.fillRect(px - cell * 0.3, py + h * 0.42, cell * 0.36, cell * 0.22);
  };

  const drawPod = (pod, box) => {
    const cell = box.cell;
    const px = (pod.x - cam.x) * cell;
    const py = (pod.y - cam.y) * cell;
    const w = pod.w * cell;
    const h = pod.h * cell;
    ctx.fillStyle = '#c9a227';
    roundRect(ctx, px, py, w, h, cell * 0.14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 30, 0, 0.5)';
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.strokeRect(px + w * 0.16, py + h * 0.16, w * 0.68, h * 0.68);
    ctx.fillStyle = '#3b2f05';
    ctx.font = `bold ${Math.round(cell * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', px + w / 2, py + h * 0.56);
  };

  const PICKUP_MARK = { spread: 'S', machine: 'M', laser: 'L', ammo: 'A' };

  const drawPickup = (pickup, box) => {
    const cell = box.cell;
    const px = (pickup.x - cam.x) * cell;
    const py = (pickup.y - cam.y) * cell;
    const w = pickup.w * cell;
    const h = pickup.h * cell;
    // 快过期时开始闪，提醒你「再不捡就没了」。
    if (pickup.life < 4 && Math.floor(clock * 10) % 2 === 0) return;
    ctx.fillStyle = pickup.kind === 'ammo' ? '#8fd694' : '#ffd447';
    roundRect(ctx, px, py, w, h, cell * 0.16);
    ctx.fill();
    ctx.fillStyle = '#2b2200';
    ctx.font = `bold ${Math.round(cell * 0.46)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PICKUP_MARK[pickup.kind] ?? '?', px + w / 2, py + h * 0.56);
  };

  const drawBullets = (state, box) => {
    const cell = box.cell;
    for (const bullet of state.bullets) {
      const px = (bullet.x - cam.x) * cell;
      const py = (bullet.y - cam.y) * cell;
      const mine = bullet.owner === 'player';
      const color = mine ? (BULLET_COLORS[bullet.weapon] ?? '#ffe066') : '#ff6b6b';
      // 拖一条与速度同向的尾巴，看得出来谁的弹、往哪飞。
      const len = Math.hypot(bullet.vx, bullet.vy) || 1;
      const tail = cell * (mine ? 0.42 : 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, cell * (mine ? 0.11 : 0.13));
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - (bullet.vx / len) * tail, py - (bullet.vy / len) * tail);
      ctx.stroke();
      if (!mine) {
        ctx.fillStyle = 'rgba(255, 190, 190, 0.9)';
        circle(ctx, px, py, cell * 0.09);
        ctx.fill();
      }
    }
  };

  // 粒子、飘字和枪口火光都是纯表现：模拟层只发一个 effect，寿命在这里自己走完。
  const BURST = {
    hit: { color: '#ffe066', count: 5 },
    weak: { color: '#ff8080', count: 8 },
    armor: { color: '#9aa4b8', count: 4 },
    kill: { color: '#ffb347', count: 9 },
    spark: { color: '#cfd6e4', count: 3 },
    crack: { color: '#ffd447', count: 8 },
    pickup: { color: '#8fd694', count: 6 },
    die: { color: '#ff6b6b', count: 12 },
    clear: { color: '#7cf7ff', count: 16 },
  };

  const POPUP_TEXT = { weak: '核心', armor: '装甲', pickup: '换枪', dry: '空仓', clear: '据点清除' };

  const spawnBurst = (effect) => {
    const spec = BURST[effect.type];
    if (!spec) return;
    for (let i = 0; i < spec.count; i += 1) {
      const angle = (Math.PI * 2 * i) / spec.count;
      particles.push({
        x: effect.x,
        y: effect.y,
        vx: Math.cos(angle) * 4,
        vy: Math.sin(angle) * 4 - 1.5,
        life: 0.42,
        max: 0.42,
        color: spec.color,
      });
    }
  };

  const drawParticles = (box, dt) => {
    particles = particles
      .map((p) => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + 14 * dt, life: p.life - dt }))
      .filter((p) => p.life > 0);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      const size = box.cell * 0.14;
      ctx.fillRect((p.x - cam.x) * box.cell - size / 2, (p.y - cam.y) * box.cell - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    flashes = flashes.map((f) => ({ ...f, life: f.life - dt })).filter((f) => f.life > 0);
    for (const f of flashes) {
      ctx.globalAlpha = Math.max(0, f.life / 0.07);
      ctx.fillStyle = '#fff6c8';
      circle(ctx, (f.x - cam.x) * box.cell, (f.y - cam.y) * box.cell, box.cell * 0.2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    popups = popups.map((p) => ({ ...p, y: p.y - dt * 1.8, life: p.life - dt })).filter((p) => p.life > 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(box.cell * 0.4)}px system-ui, sans-serif`;
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.life / 0.4);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, (p.x - cam.x) * box.cell, (p.y - cam.y) * box.cell);
    }
    ctx.globalAlpha = 1;
  };


  const POPUP_COLOR = { weak: '#ff8a8a', armor: '#b9c2d4', pickup: '#8fd694', dry: '#ffd47a', clear: '#7cf7ff' };

  return {
    notify(effects) {
      for (const effect of effects) {
        spawnBurst(effect);
        if (effect.type === 'fire') flashes.push({ x: effect.x, y: effect.y, life: 0.07 });
        const text = POPUP_TEXT[effect.type];
        if (text) {
          popups.push({ text, x: effect.x, y: effect.y, life: 0.7, color: POPUP_COLOR[effect.type] ?? '#fff8e1' });
        }
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

      // 关卡底下再画一层更深的岩色：屏幕比关卡高的时候，下面不该露出一条空带。
      const floorY = (state.height - cam.y) * box.cell;
      if (floorY < box.height) {
        ctx.fillStyle = '#080c0a';
        ctx.fillRect(0, floorY, box.width, box.height - floorY);
      }

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

      if (state.boss && state.boss.hp > 0) drawBoss(state.boss, box);
      for (const pod of state.pods) drawPod(pod, box);
      for (const pickup of state.pickups) drawPickup(pickup, box);
      for (const enemy of state.enemies) drawEnemy(enemy, box);
      drawPlayer(state.player, box, state.status);
      drawBullets(state, box);
      drawParticles(box, dt);
    },
    dispose() {
      particles = [];
      popups = [];
      flashes = [];
      canvas.remove();
    },
  };
}
