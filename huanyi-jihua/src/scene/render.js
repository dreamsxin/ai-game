// Canvas 2D 表现层。只读模拟状态，不写回——所以画面出错永远不会影响判定。
//
// 画面要回答的问题只有三个，其余都是装饰：
// 1. 我现在有没有翅膀（有翅膀的机身更宽，那一截就是多出来的受击面积）。
// 2. Boss 的弱点在哪（weakSpots 画成一圈标记，选对机翼才打得进去）。
// 3. 哪些子弹是能打掉的（敌弹画成有轮廓的小球，被打掉时炸成火花）。

import { FIELD_H, FIELD_W } from '../game/rules.js';
import { CHAPTERS } from '../game/levels.js';
import { WEAKNESS, WINGS, tierOf } from '../game/wings.js';
import { orbsOf } from '../game/simulation.js';
import { weakSpots } from '../game/boss.js';

const STAR_COUNT = 70;
const MAX_SPARKS = 220;
const TRAIL_LEN = 12;
const TIER_COLOR = ['#9fc2ff', '#8affd0', '#ffd447'];

export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // 星野自己维护：它不属于模拟状态，纯粹是速度感。
  const stars = Array.from({ length: STAR_COUNT }, (_, i) => ({
    x: ((i * 37) % 100) + ((i % 7) - 3) * 0.4,
    y: (i * 151) % FIELD_H,
    z: 0.4 + ((i * 13) % 10) / 10,
  }));
  let sparks = [];
  let notes = [];
  let arcs = [];
  // 机身残影：只在下潜（弃翼换来的那一段）时留，所以它本身就是「我正无敌」的信号。
  let trail = [];
  let flash = null;
  let shake = 0;
  let size = { w: 1, h: 1, scale: 1, ox: 0, oy: 0 };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
    size = {
      w: rect.width,
      h: rect.height,
      scale,
      ox: (rect.width - FIELD_W * scale) / 2,
      oy: (rect.height - FIELD_H * scale) / 2,
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const px = (x) => size.ox + x * size.scale;
  const py = (y) => size.oy + y * size.scale;
  const ps = (v) => v * size.scale;

  const spark = (x, y, color, count, spread = 34) => {
    for (let i = 0; i < count && sparks.length < MAX_SPARKS; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random();
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * spread * (0.4 + Math.random()),
        vy: Math.sin(angle) * spread * (0.4 + Math.random()),
        life: 0.3 + Math.random() * 0.3,
        age: 0,
        color,
      });
    }
  };

  const note = (x, y, text, color) => {
    notes.push({ x, y, text, color, life: 0.9, age: 0 });
    if (notes.length > 12) notes.shift();
  };

  const bang = (color, power = 0.35) => {
    flash = { color, power, life: 0.26, age: 0 };
  };

  // effects 是逻辑层唯一的出口，火花和飘字都从这里长出来。
  const notify = (effects = []) => {
    for (const effect of effects) {
      if (effect.type === 'pop') {
        // 打掉一发敌弹就炸一小簇火花：弹幕被抵消掉这件事必须看得见。
        spark(effect.x, effect.y, '#ffd447', 4, 26);
        if (effect.chain >= 3) note(FIELD_W / 2, 44, `连消 ${effect.chain}`, '#ffe066');
      } else if (effect.type === 'kill') {
        spark(effect.x, effect.y, effect.kind === 'carrier' ? '#ffd447' : '#ff8f5e', 8, 40);
      } else if (effect.type === 'wingLost') {
        spark(effect.x, effect.y, '#ff5470', 12, 46);
        note(FIELD_W / 2, 100, `${effect.code} 机翼被崩掉`, '#ff5470');
        shake = Math.max(shake, 2.4);
      } else if (effect.type === 'jettison') {
        note(FIELD_W / 2, 100, '弃翼下潜', '#7fe3ff');
      } else if (effect.type === 'catch' || effect.type === 'swap') {
        note(FIELD_W / 2, 96, `${effect.code} ${WINGS[effect.code]?.name ?? ''}`, '#8affd0');
      } else if (effect.type === 'evolve') {
        // 进化是这游戏里唯一「变强」的一刻，值得一次白光加一圈火花。
        spark(effect.x, effect.y, TIER_COLOR[effect.tier - 1] ?? '#ffd447', 14, 40);
        note(FIELD_W / 2, 92, `${effect.code} → ${tierOf(effect.tier).name}`, TIER_COLOR[effect.tier - 1]);
        bang('#ffe9a8', 0.26);
      } else if (effect.type === 'topped') {
        note(FIELD_W / 2, 92, `${effect.code} 已满阶`, '#8affd0');
      } else if (effect.type === 'burst') {
        spark(effect.x, effect.y, '#c9a6ff', 12, 62);
        bang('#c9a6ff', 0.2);
      } else if (effect.type === 'arc') {
        arcs.push({ x1: effect.x1, y1: effect.y1, x2: effect.x2, y2: effect.y2, life: 0.14, age: 0 });
        if (arcs.length > 24) arcs.shift();
      } else if (effect.type === 'bare') {
        note(FIELD_W / 2, 108, '裸机！', '#ff5470');
      } else if (effect.type === 'carrier') {
        note(FIELD_W / 2, 60, `掉落 ${effect.code} 机翼`, '#ffd447');
      } else if (effect.type === 'skip') {
        note(FIELD_W / 2, 70, '跳关 · 省 4 关', '#7fe3ff');
      } else if (effect.type === 'bossIn') {
        note(FIELD_W / 2, 56, '弱点已标出', '#ffd447');
      } else if (effect.type === 'bossKill') {
        shake = Math.max(shake, 4);
      } else if (effect.type === 'die') {
        shake = Math.max(shake, 3.2);
      }
    }
  };

  /** 画一具机身。残影和分身都走这里，只是透明度不同。 */
  const drawHull = (x, y, ship, alpha, ghost = false) => {
    ctx.globalAlpha = alpha;
    const tier = ship.wing ? Math.min(3, Math.max(1, ship.tier)) : 1;
    if (ship.wing) {
      // 机翼：往两侧伸出去的那一截，也正是多出来的受击面积。阶级越高越亮。
      const trim = TIER_COLOR[tier - 1];
      ctx.fillStyle = ghost ? 'rgba(127, 227, 255, 0.5)' : '#5f7fd8';
      ctx.fillRect(x - ps(6.4), y - ps(0.9), ps(12.8), ps(3));
      ctx.fillStyle = trim;
      ctx.fillRect(x - ps(6.4), y - ps(0.9), ps(2.2), ps(3));
      ctx.fillRect(x + ps(4.2), y - ps(0.9), ps(2.2), ps(3));
      if (tier > 1 && !ghost) {
        // Mk.II 以上给翼尖描一层辉光：进化要看得见，不能只是数字变大。
        ctx.save();
        ctx.shadowColor = trim;
        ctx.shadowBlur = ps(3.4) * tier;
        ctx.fillRect(x - ps(6.4), y - ps(0.9), ps(2.2), ps(3));
        ctx.fillRect(x + ps(4.2), y - ps(0.9), ps(2.2), ps(3));
        ctx.restore();
      }
      ctx.fillStyle = '#04101f';
      ctx.font = `700 ${Math.max(7, ps(2.6))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(ship.wing, x, y + ps(1.5));
      // 阶级刻在翼下：I / II / III。
      if (tier > 1 && !ghost) {
        ctx.fillStyle = trim;
        ctx.font = `800 ${Math.max(6, ps(2.2))}px system-ui, sans-serif`;
        ctx.fillText(tierOf(tier).mark, x, y + ps(4.6));
      }
    }

    ctx.fillStyle = ghost ? 'rgba(127, 227, 255, 0.55)' : ship.dive > 0 ? '#7fe3ff' : '#f6f4ee';
    ctx.beginPath();
    ctx.moveTo(x, y - ps(3.4));
    ctx.lineTo(x + ps(2.4), y + ps(3));
    ctx.lineTo(x, y + ps(1.8));
    ctx.lineTo(x - ps(2.4), y + ps(3));
    ctx.closePath();
    ctx.fill();
    // 尾焰。下潜时加速，火苗也跟着拉长。
    const boost = ship.dive > 0 ? 2.2 : 0;
    ctx.fillStyle = ghost ? 'rgba(127, 227, 255, 0.4)' : 'rgba(255, 196, 84, 0.85)';
    ctx.fillRect(x - ps(0.7), y + ps(2.6), ps(1.4), ps(1.6 + boost + Math.random() * 1.4));
    ctx.globalAlpha = 1;
  };

  const drawShip = (state) => {
    const ship = state.ship;
    const x = px(ship.x);
    const y = py(ship.y);

    // 相位残影：下潜那一秒会拖出一串影子。这一串本身就是「现在打不到我」的信号。
    for (const [i, spot] of trail.entries()) {
      const fade = ((i + 1) / trail.length) * 0.34;
      drawHull(px(spot.x), py(spot.y), spot.ship, fade, true);
    }

    // 量子分身：镜像那一侧真的有一具半透明的机身在开火。
    if (ship.wing && WINGS[ship.wing]?.echo) {
      drawHull(px(FIELD_W - ship.x), y, ship, 0.5, true);
    }

    // 无敌护盾环。挨打换来的无敌是白的，弃翼换来的下潜是蓝的——两种无敌看得出区别。
    if (ship.invuln > 0) {
      const pulse = 8.4 + Math.sin(ship.invuln * 22) * 1.2;
      ctx.strokeStyle = ship.dive > 0 ? 'rgba(127, 227, 255, 0.85)' : 'rgba(246, 244, 238, 0.55)';
      ctx.lineWidth = Math.max(1, ps(0.6));
      ctx.beginPath();
      ctx.arc(x, y, ps(pulse), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 无敌期闪烁：只闪机身，护盾环一直画着，不然会看不出还剩多久。
    const blink = ship.invuln > 0 && ship.dive <= 0 && Math.floor(ship.invuln * 12) % 2 === 0;
    drawHull(x, y, ship, blink ? 0.45 : 1);

    for (const orb of orbsOf(ship)) {
      ctx.fillStyle = '#d8d8e6';
      ctx.beginPath();
      ctx.arc(px(orb.x), py(orb.y), ps(orb.r), 0, Math.PI * 2);
      ctx.fill();
      // 顶阶多出来的那一枚也一样亮，省得玩家怀疑自己看错了。
      ctx.strokeStyle = 'rgba(255, 212, 71, 0.7)';
      ctx.lineWidth = Math.max(0.8, ps(0.3));
      ctx.stroke();
    }
  };

  const ENEMY_STYLE = {
    zako: { body: '#7c8cff', trim: '#c7d0ff' },
    diver: { body: '#ff8f5e', trim: '#ffd0b0' },
    turret: { body: '#9a7bff', trim: '#d9caff' },
    ground: { body: '#8a6b3c', trim: '#d8b374' },
    carrier: { body: '#ffd447', trim: '#fff2b8' },
    wall: { body: '#4a5a72', trim: '#8fa3bd' },
  };

  const drawEnemies = (state) => {
    for (const enemy of state.enemies) {
      const style = ENEMY_STYLE[enemy.kind] ?? ENEMY_STYLE.zako;
      const x = px(enemy.x);
      const y = py(enemy.y);
      const w = ps(enemy.w);
      const h = ps(enemy.h);
      ctx.fillStyle = style.body;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = style.trim;
      if (enemy.kind === 'carrier') {
        // 运载火箭上写着它装的是哪一种机翼——换翼的机会得看得见。
        ctx.font = `700 ${Math.max(7, ps(3.4))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(enemy.wing ?? '?', x, y + ps(1.2));
      } else if (enemy.kind === 'ground') {
        // 贴地目标画一条底座：平射打不动它，得用炸弹。
        ctx.fillRect(x - w / 2, y + h / 2 - ps(1.2), w, ps(1.2));
      } else {
        ctx.fillRect(x - w / 2, y - h / 2, w, ps(1));
      }
      if (enemy.hp < enemy.maxHp) {
        ctx.fillStyle = 'rgba(255, 84, 112, 0.85)';
        ctx.fillRect(x - w / 2, y - h / 2 - ps(1.4), (w * enemy.hp) / enemy.maxHp, ps(0.8));
      }
    }
  };

  const drawBoss = (state) => {
    const boss = state.boss;
    if (!boss) return;
    const x = px(boss.x);
    const y = py(boss.y);
    const w = ps(boss.w);
    const h = ps(boss.h);
    ctx.fillStyle = boss.rage ? '#7a2a3a' : '#3c4a6b';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = '#c9d6ff';
    ctx.lineWidth = Math.max(1, ps(0.5));
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    // 弱点标记：一圈会呼吸的环。这是关卡情报里那句话在画面上的样子。
    const pulse = 0.7 + Math.sin(boss.age * 6) * 0.3;
    for (const spot of weakSpots(boss)) {
      ctx.strokeStyle = 'rgba(255, 212, 71, 0.95)';
      ctx.lineWidth = Math.max(1, ps(0.7));
      ctx.beginPath();
      ctx.arc(px(spot.x), py(spot.y), ps(spot.r * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 212, 71, 0.28)';
      ctx.fill();
    }
  };

  const drawBullets = (state) => {
    // 我方火力
    for (const shot of state.shots) {
      if (shot.well) {
        // 引力井：一圈会转的吸积环，画得比子弹大得多——它的作用范围必须一眼看见。
        const r = ps(shot.well);
        const spin = shot.age * 5;
        ctx.strokeStyle = 'rgba(180, 140, 255, 0.75)';
        ctx.lineWidth = Math.max(1, ps(0.7));
        ctx.beginPath();
        ctx.arc(px(shot.x), py(shot.y), r, spin, spin + Math.PI * 1.5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(120, 80, 220, 0.22)';
        ctx.beginPath();
        ctx.arc(px(shot.x), py(shot.y), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0d0ff';
        ctx.beginPath();
        ctx.arc(px(shot.x), py(shot.y), ps(1.8), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (shot.kind === 'flame') {
        ctx.fillStyle = 'rgba(255, 156, 64, 0.8)';
        ctx.beginPath();
        ctx.arc(px(shot.x), py(shot.y), ps(2.2), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (shot.kind === 'beam') {
        // 相位激光：细长一条，尾巴拖得比谁都长。
        ctx.strokeStyle = 'rgba(140, 255, 240, 0.9)';
        ctx.lineWidth = Math.max(1, ps(0.8));
        ctx.beginPath();
        ctx.moveTo(px(shot.x), py(shot.y));
        ctx.lineTo(px(shot.x), py(shot.y + 7));
        ctx.stroke();
        continue;
      }
      if (shot.kind === 'anti') {
        const r = ps(2.6 + Math.sin(shot.age * 18) * 0.5);
        ctx.fillStyle = '#c9a6ff';
        ctx.beginPath();
        ctx.arc(px(shot.x), py(shot.y), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = Math.max(0.8, ps(0.3));
        ctx.stroke();
        continue;
      }
      // 分身的子弹画得淡一点，好和本体的火力分得开。
      ctx.globalAlpha = shot.echo ? 0.66 : 1;
      ctx.fillStyle = shot.kind === 'shard'
        ? '#c9a6ff'
        : shot.pierce === 'armor'
          ? '#8affd0'
          : shot.ground
            ? '#ffb35e'
            : '#fff4c2';
      const long = shot.kind === 'pierce' ? 4.6 : shot.kind === 'bomb' ? 2.4 : shot.kind === 'shard' ? 2 : 3;
      ctx.fillRect(px(shot.x) - ps(0.7), py(shot.y) - ps(long / 2), ps(1.4), ps(long));
      ctx.globalAlpha = 1;
    }
    // 敌弹：画成带轮廓的小球，因为它们是可以被打掉的目标，不是背景装饰。
    for (const foe of state.foes) {
      const x = px(foe.x);
      const y = py(foe.y);
      ctx.fillStyle = foe.kind === 'shell' ? '#ff8f5e' : '#ff5470';
      ctx.beginPath();
      ctx.arc(x, y, ps(foe.kind === 'shell' ? 2 : 1.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = Math.max(0.6, ps(0.25));
      ctx.stroke();
    }
  };

  /** 链弧：两点之间抖几下的折线。它只活六帧，所以画得糙一点也没人看得出。 */
  const drawArcs = (dt) => {
    arcs = arcs.filter((item) => item.age < item.life);
    ctx.lineWidth = Math.max(1, ps(0.5));
    for (const item of arcs) {
      item.age += dt;
      ctx.globalAlpha = Math.max(0, 1 - item.age / item.life);
      ctx.strokeStyle = '#b8f0ff';
      ctx.beginPath();
      ctx.moveTo(px(item.x1), py(item.y1));
      for (let i = 1; i < 4; i += 1) {
        const t = i / 4;
        const jag = (Math.random() - 0.5) * 5;
        ctx.lineTo(px(item.x1 + (item.x2 - item.x1) * t + jag), py(item.y1 + (item.y2 - item.y1) * t));
      }
      ctx.lineTo(px(item.x2), py(item.y2));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const drawDrops = (state) => {
    const keys = WEAKNESS[state.weak]?.keys ?? [];
    for (const drop of state.drops) {
      const x = px(drop.x);
      const y = py(drop.y);
      const r = ps(4);
      // 菱形道具，和原作一样。快要飘走的那一刻开始闪，提醒你再不接就没了。
      const fading = drop.life < 1.2 && Math.floor(drop.life * 10) % 2 === 0;
      ctx.globalAlpha = fading ? 0.4 : 1;
      ctx.fillStyle = drop.mine ? '#7fe3ff' : '#ffd447';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
      // 这枚机翼打不打得进本关 Boss 的弱点——情报直接画在道具上，
      // 否则「捡到手才发现是把螺丝刀」就成了运气问题。
      if (keys.includes(drop.code)) {
        ctx.strokeStyle = 'rgba(255, 212, 71, 0.95)';
        ctx.lineWidth = Math.max(1, ps(0.55));
        ctx.stroke();
      } else {
        ctx.globalAlpha = fading ? 0.28 : 0.66;
      }
      ctx.fillStyle = '#04101f';
      ctx.font = `700 ${Math.max(7, ps(3))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(drop.code, x, y + ps(1.1));
      // 带着阶级飞出去的翼，阶级也要标出来：它值不值得追回来全看这个。
      const tier = Math.min(3, Math.max(1, drop.tier ?? 1));
      if (tier > 1) {
        ctx.fillStyle = TIER_COLOR[tier - 1];
        ctx.font = `800 ${Math.max(6, ps(2.2))}px system-ui, sans-serif`;
        ctx.fillText(tierOf(tier).mark, x, y + ps(6.6));
      }
      ctx.globalAlpha = 1;
    }
  };

  const drawGate = (state) => {
    const gate = state.gate;
    if (!gate) return;
    const x = px(gate.x);
    const y = py(gate.y);
    const w = ps(gate.w);
    const h = ps(gate.h);
    ctx.strokeStyle = '#7fe3ff';
    ctx.lineWidth = Math.max(1.5, ps(0.9));
    ctx.setLineDash([ps(3), ps(2)]);
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(127, 227, 255, 0.16)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#7fe3ff';
    ctx.font = `700 ${Math.max(8, ps(4))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('跳关', x, y + ps(1.5));
  };

  const drawBackdrop = (state, dt) => {
    const palette = CHAPTERS[state.chapter] ?? CHAPTERS[0];
    const gradient = ctx.createLinearGradient(0, 0, 0, size.h);
    gradient.addColorStop(0, palette.deep);
    gradient.addColorStop(1, palette.sky);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size.w, size.h);

    ctx.fillStyle = palette.star;
    for (const star of stars) {
      star.y += (18 + star.z * 46) * dt;
      if (star.y > FIELD_H) {
        star.y -= FIELD_H;
        star.x = (star.x * 7 + 13) % FIELD_W;
      }
      ctx.globalAlpha = 0.25 + star.z * 0.5;
      ctx.fillRect(px(star.x), py(star.y), Math.max(1, ps(0.5)), Math.max(1, ps(star.z * 2)));
    }
    ctx.globalAlpha = 1;
  };

  const drawSparks = (dt) => {
    sparks = sparks.filter((item) => item.age < item.life);
    for (const item of sparks) {
      item.age += dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - item.age / item.life);
      ctx.fillStyle = item.color;
      ctx.fillRect(px(item.x) - 1, py(item.y) - 1, Math.max(2, ps(0.9)), Math.max(2, ps(0.9)));
    }
    ctx.globalAlpha = 1;
  };

  const drawNotes = (dt) => {
    notes = notes.filter((item) => item.age < item.life);
    ctx.textAlign = 'center';
    for (const item of notes) {
      item.age += dt;
      ctx.globalAlpha = Math.max(0, 1 - item.age / item.life);
      ctx.fillStyle = item.color;
      ctx.font = `800 ${Math.max(10, ps(4.2))}px system-ui, sans-serif`;
      ctx.fillText(item.text, px(item.x), py(item.y - item.age * 8));
    }
    ctx.globalAlpha = 1;
  };

  /** 全屏闪一下。只给进化和反物质爆炸这种「场面变了」的事件。 */
  const drawFlash = (dt) => {
    if (!flash) return;
    flash.age += dt;
    if (flash.age >= flash.life) {
      flash = null;
      return;
    }
    ctx.globalAlpha = (1 - flash.age / flash.life) * flash.power;
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.globalAlpha = 1;
  };

  /**
   * 裸机警示：画面四边泛起一层红。
   * 这是全局最危险的状态（再挨一下就掉命），值得一个躲不开的提示。
   */
  const drawBareEdge = (state) => {
    if (state.ship.wing || state.ship.dive > 0 || state.status !== 'playing') return;
    const pulse = 0.34 + Math.sin(state.elapsed * 7) * 0.12;
    const edge = ctx.createLinearGradient(0, 0, 0, size.h);
    edge.addColorStop(0, `rgba(255, 84, 112, ${pulse})`);
    edge.addColorStop(0.16, 'rgba(255, 84, 112, 0)');
    edge.addColorStop(0.84, 'rgba(255, 84, 112, 0)');
    edge.addColorStop(1, `rgba(255, 84, 112, ${pulse})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size.w, size.h);
    // 左右两边也补一层，四边一起亮才不像「屏幕上下脏了」。
    const side = ctx.createLinearGradient(0, 0, size.w, 0);
    side.addColorStop(0, `rgba(255, 84, 112, ${pulse * 0.8})`);
    side.addColorStop(0.14, 'rgba(255, 84, 112, 0)');
    side.addColorStop(0.86, 'rgba(255, 84, 112, 0)');
    side.addColorStop(1, `rgba(255, 84, 112, ${pulse * 0.8})`);
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, size.w, size.h);
  };

  /** 残影只在下潜时攒，别的时候一帧一帧清掉。 */
  const trackTrail = (state) => {
    if (state.status !== 'playing') {
      trail = [];
      return;
    }
    if (state.ship.dive > 0) {
      trail.push({ x: state.ship.x, y: state.ship.y, ship: state.ship });
      while (trail.length > TRAIL_LEN) trail.shift();
    } else if (trail.length) {
      trail.shift();
    }
  };

  return {
    notify,

    render(state, dt) {
      const delta = Math.min(0.05, Math.max(0, dt));
      trackTrail(state);
      ctx.save();
      if (shake > 0.05) {
        // 屏幕震动只给「翅膀没了」「掉命」「Boss 炸了」这三件事，否则一路都在抖。
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake *= 0.86;
      }
      drawBackdrop(state, delta);
      drawGate(state);
      drawEnemies(state);
      drawBoss(state);
      drawDrops(state);
      drawBullets(state);
      drawArcs(delta);
      if (state.status !== 'dying') drawShip(state);
      drawSparks(delta);
      drawBareEdge(state);
      drawNotes(delta);
      drawFlash(delta);
      ctx.restore();
    },

    dispose() {
      observer.disconnect();
      canvas.remove();
    },
  };
}
