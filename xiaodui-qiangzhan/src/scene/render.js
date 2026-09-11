import { castRay } from '../game/arena.js';
import { toPixel, viewBox } from '../game/layout.js';
import { BULLET_RANGE, MAX_HEALTH, TEAM_ALLY, UNIT_RADIUS } from '../game/rules.js';

const TEAM_COLOR = { ally: '#4de1ff', enemy: '#ff5d7a' };
const FLASH_SECONDS = 0.08;
const HIT_SECONDS = 0.32;
const KILL_SECONDS = 0.7;
const SPAWN_SECONDS = 0.55;

const LIFE = { shot: FLASH_SECONDS, hit: HIT_SECONDS, kill: KILL_SECONDS, spawn: SPAWN_SECONDS, impact: HIT_SECONDS };

// 渲染层只读状态：枪口火光、弹着火花这类纯表现计时自己维护。
export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'field-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let particles = [];

  const layout = (arena) => {
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
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return viewBox(width, height, arena.cols, arena.rows);
  };

  const drawArena = (box, arena) => {
    const origin = toPixel(box, 0, 0);
    ctx.fillStyle = 'rgba(12, 17, 34, 0.96)';
    ctx.fillRect(origin.x, origin.y, arena.cols * box.scale, arena.rows * box.scale);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let cx = 1; cx < arena.cols; cx += 1) {
      const p = toPixel(box, cx, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, origin.y);
      ctx.lineTo(p.x, origin.y + arena.rows * box.scale);
      ctx.stroke();
    }
    for (let cy = 1; cy < arena.rows; cy += 1) {
      const p = toPixel(box, 0, cy);
      ctx.beginPath();
      ctx.moveTo(origin.x, p.y);
      ctx.lineTo(origin.x + arena.cols * box.scale, p.y);
      ctx.stroke();
    }
    for (let cy = 0; cy < arena.rows; cy += 1) {
      for (let cx = 0; cx < arena.cols; cx += 1) {
        if (arena.tiles[cy][cx] !== 1) continue;
        const p = toPixel(box, cx, cy);
        ctx.fillStyle = 'rgba(96, 116, 168, 0.5)';
        ctx.fillRect(p.x, p.y, box.scale, box.scale);
        ctx.fillStyle = 'rgba(158, 180, 236, 0.22)';
        ctx.fillRect(p.x, p.y, box.scale, Math.max(1, box.scale * 0.16));
      }
    }
  };

  const drawBullets = (box, bullets) => {
    ctx.lineCap = 'round';
    for (const bullet of bullets) {
      const tail = Math.min(0.55, BULLET_RANGE - bullet.traveled);
      const a = toPixel(box, bullet.x, bullet.y);
      const b = toPixel(box, bullet.x - Math.cos(bullet.angle) * tail, bullet.y - Math.sin(bullet.angle) * tail);
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, TEAM_COLOR[bullet.team]);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(1.5, box.scale * 0.08);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };

  const drawUnit = (box, unit, isPlayer) => {
    const p = toPixel(box, unit.x, unit.y);
    const radius = UNIT_RADIUS * box.scale;
    const color = TEAM_COLOR[unit.team];
    if (!unit.alive) {
      // 倒地标记：告诉玩家这里刚才死了人，重生倒计时在 HUD 上。
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - radius * 0.7, p.y - radius * 0.7);
      ctx.lineTo(p.x + radius * 0.7, p.y + radius * 0.7);
      ctx.moveTo(p.x + radius * 0.7, p.y - radius * 0.7);
      ctx.lineTo(p.x - radius * 0.7, p.y + radius * 0.7);
      ctx.stroke();
      return;
    }

    // 朝向扇形：一眼看出谁在看哪，这比小箭头清楚。
    ctx.fillStyle = `${color}22`;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, radius * 3.2, unit.aim - 0.42, unit.aim + 0.42);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 枪管，指向当前枪口角度。
    ctx.strokeStyle = 'rgba(12, 17, 34, 0.9)';
    ctx.lineWidth = Math.max(2, radius * 0.42);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(unit.aim) * radius * 1.9, p.y + Math.sin(unit.aim) * radius * 1.9);
    ctx.stroke();

    const ratio = Math.max(0, unit.health / MAX_HEALTH);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = Math.max(2, radius * 0.3);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 6, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.stroke();
    ctx.strokeStyle = ratio > 0.35 ? '#7dff9b' : '#ffcf5d';
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 6, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 1.5 * ratio);
    ctx.stroke();
    if (unit.reloading > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 11, Math.PI * 0.25, Math.PI * 0.75);
      ctx.stroke();
    }
  };

  // 瞄准可视化：中间是射线（打到墙就截断），两边是散布锥，锁定时准星收成实心。
  const drawAim = (box, arena, player, reticle, target) => {
    const ray = castRay(arena, player.x, player.y, Math.cos(reticle.angle), Math.sin(reticle.angle), BULLET_RANGE);
    const from = toPixel(box, player.x, player.y);
    const to = toPixel(box, ray.x, ray.y);
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    const tint = reticle.locked ? '#ffd166' : TEAM_COLOR[player.team];
    gradient.addColorStop(0, `${tint}66`);
    gradient.addColorStop(1, `${tint}00`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const dist = Math.hypot(ray.x - player.x, ray.y - player.y);
    ctx.strokeStyle = `${tint}55`;
    ctx.setLineDash([4, 4]);
    for (const side of [-1, 1]) {
      const angle = reticle.angle + reticle.spread * side;
      const edge = toPixel(box, player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(edge.x, edge.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 准星画在射线尽头：缺口宽度就是当前散布，端稳收枪时能看着它合上。
    const gap = Math.max(3, Math.tan(reticle.spread) * dist * box.scale);
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2;
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(to.x + dx * gap, to.y + dy * gap);
      ctx.lineTo(to.x + dx * (gap + box.scale * 0.35), to.y + dy * (gap + box.scale * 0.35));
      ctx.stroke();
    }

    if (!target) return;
    // 软锁目标戴一个圈：辅助咬住了谁必须看得见。
    const mark = toPixel(box, target.x, target.y);
    const radius = UNIT_RADIUS * box.scale + 7;
    ctx.strokeStyle = reticle.locked ? '#ffd166' : 'rgba(255, 209, 102, 0.45)';
    ctx.lineWidth = 2;
    for (const quad of [0, 1, 2, 3]) {
      const start = (Math.PI / 2) * quad + 0.28;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, radius, start, start + 0.72);
      ctx.stroke();
    }
  };

  const drawEffects = (box, dt) => {
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.life -= dt;
      const t = Math.max(0, p.life / LIFE[p.type]);
      const at = toPixel(box, p.x, p.y);
      if (p.type === 'shot') {
        ctx.fillStyle = `rgba(255, 236, 179, ${t})`;
        ctx.beginPath();
        ctx.arc(at.x, at.y, box.scale * 0.22 * t + 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'impact') {
        ctx.fillStyle = `rgba(200, 214, 255, ${t * 0.7})`;
        ctx.beginPath();
        ctx.arc(at.x, at.y, box.scale * 0.16 * t + 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'hit') {
        ctx.strokeStyle = `rgba(255, 93, 122, ${t})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(at.x, at.y, box.scale * 0.5 * (1 - t) + 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'kill') {
        ctx.strokeStyle = `${TEAM_COLOR[p.team]}${Math.round(t * 200).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(at.x, at.y, box.scale * (1.6 - t), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `${TEAM_COLOR[p.team]}${Math.round(t * 160).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(at.x, at.y, box.scale * (1.2 * t + 0.3), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };

  // 双摇杆画在手指按下的位置：底圈是基准，亮点是当前推的方向。
  const drawSticks = (sticks) => {
    if (!sticks) return;
    const rect = host.getBoundingClientRect();
    for (const side of ['move', 'aim']) {
      const stick = sticks[side];
      if (!stick) continue;
      const bx = stick.baseX - rect.left;
      const by = stick.baseY - rect.top;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = side === 'aim' ? 'rgba(255, 209, 102, 0.5)' : 'rgba(77, 225, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(bx + stick.x * 46, by + stick.y * 46, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  return {
    // 模拟层每步吐出的表现事件在这里转成粒子，渲染帧率和模拟步长因此解耦。
    notify(effects = []) {
      for (const effect of effects) {
        particles.push({ ...effect, life: LIFE[effect.type] ?? HIT_SECONDS });
      }
      if (particles.length > 240) particles = particles.slice(-240);
    },
    render(state, dt = 0, sticks = null) {
      const box = layout(state.arena);
      drawArena(box, state.arena);
      const player = state.units.find((unit) => unit.id === state.playerId);
      const target = state.reticle.targetId
        ? state.units.find((unit) => unit.id === state.reticle.targetId)
        : null;
      if (player?.alive) drawAim(box, state.arena, player, state.reticle, target);
      drawBullets(box, state.bullets);
      for (const unit of state.units) drawUnit(box, unit, unit.id === state.playerId);
      drawEffects(box, dt);
      drawSticks(sticks);
    },
    dispose() {
      canvas.remove();
    },
  };
}



