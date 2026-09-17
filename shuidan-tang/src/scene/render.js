// Canvas 2D 表现层。只读模拟状态，不写回——所以画面出错永远不会影响判定。
//
// 画面要回答的问题只有四个，其余都是装饰：
// 1. 哪些格子**马上要炸**（水弹按引信收缩、颜色越来越烫，最后 0.6 秒开始闪）。
// 2. 谁是水泡、还剩多久（水泡外面画一圈会走完的环，环走完它就自由了）。
// 3. 哪个箱子后面有东西（拆开时道具是从箱子里弹出来的，视觉上连着因果）。
// 4. 爆流现在盖住哪几格（画成一条连起来的水带，不是四个独立的方块——
//    爆流是「流」这件事决定了走位，画散了玩家就读不出安全线）。

import { BUBBLE_LIFE, FUSE, H, TILE, W, key } from '../game/rules.js';
import { HUMAN } from '../game/simulation.js';

const MAX_SPLASH = 200;
const ITEM_MARK = { bomb: '弹', power: '压', speed: '速', kick: '踢' };
const ITEM_COLOR = { bomb: '#7fe3ff', power: '#ff7a59', speed: '#8affd0', kick: '#ffd447' };

export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let splashes = [];
  let notes = [];
  let shake = 0;
  let time = 0;
  let size = { w: 1, h: 1, scale: 1, ox: 0, oy: 0 };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const scale = Math.min(rect.width / W, rect.height / H);
    size = {
      w: rect.width,
      h: rect.height,
      scale,
      ox: (rect.width - W * scale) / 2,
      oy: (rect.height - H * scale) / 2,
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const px = (x) => size.ox + x * size.scale;
  const py = (y) => size.oy + y * size.scale;
  const ps = (v) => v * size.scale;

  const splash = (cx, cy, color, count = 8) => {
    for (let i = 0; i < count && splashes.length < MAX_SPLASH; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random();
      splashes.push({
        x: cx + 0.5,
        y: cy + 0.5,
        vx: Math.cos(angle) * (0.8 + Math.random() * 1.6),
        vy: Math.sin(angle) * (0.8 + Math.random() * 1.6),
        life: 0.3 + Math.random() * 0.3,
        age: 0,
        color,
      });
    }
  };

  const note = (cx, cy, text, color) => {
    notes.push({ x: cx + 0.5, y: cy + 0.5, text, color, life: 0.9, age: 0 });
    if (notes.length > 10) notes.shift();
  };

  // effects 是逻辑层唯一的出口，水花和飘字都从这里长出来。
  const notify = (effects = []) => {
    for (const effect of effects) {
      if (effect.type === 'blast') {
        for (const cell of effect.cells) splash(cell.cx, cell.cy, '#7fe3ff', cell.crate ? 10 : 6);
        shake = Math.min(1, shake + 0.25 + effect.chain * 0.12);
      }
      if (effect.type === 'crate') splash(effect.cx, effect.cy, '#c08a4a', 10);
      if (effect.type === 'item') note(effect.cx, effect.cy, ITEM_MARK[effect.code] ?? '＋', ITEM_COLOR[effect.code]);
      if (effect.type === 'bubble') shake = Math.min(1, shake + (effect.self ? 0.5 : 0.2));
      if (effect.type === 'pop') shake = Math.min(1, shake + 0.6);
    }
  };

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawGrid = (state) => {
    for (let cy = 0; cy < H; cy += 1) {
      for (let cx = 0; cx < W; cx += 1) {
        const tile = state.grid[key(cx, cy)];
        const x = px(cx);
        const y = py(cy);
        const s = ps(1);
        if (tile === TILE.WALL) {
          // 柱子画出一层顶面：格子游戏里「哪儿绝对过不去」必须一眼看出来。
          ctx.fillStyle = '#1b3350';
          ctx.fillRect(x, y, s, s);
          ctx.fillStyle = '#2c4d72';
          ctx.fillRect(x, y, s, s * 0.72);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(x, y, s, s * 0.16);
          continue;
        }
        // 地砖用棋盘格，走位时格子边界才看得清。
        ctx.fillStyle = (cx + cy) % 2 === 0 ? '#0c1c30' : '#0a1729';
        ctx.fillRect(x, y, s, s);
        if (tile === TILE.CRATE) {
          ctx.fillStyle = '#8a5a2b';
          roundRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.14);
          ctx.fill();
          ctx.fillStyle = '#a8703a';
          roundRect(x + s * 0.14, y + s * 0.14, s * 0.72, s * 0.72, s * 0.1);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = Math.max(1, s * 0.04);
          ctx.beginPath();
          ctx.moveTo(x + s * 0.14, y + s * 0.5);
          ctx.lineTo(x + s * 0.86, y + s * 0.5);
          ctx.stroke();
        }
      }
    }
  };

  const drawDrops = (state) => {
    for (const drop of state.drops) {
      const s = ps(1);
      const bob = Math.sin(time * 4 + drop.at) * s * 0.05;
      const x = px(drop.cx) + s * 0.5;
      const y = py(drop.cy) + s * 0.5 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, py(drop.cy) + s * 0.82, s * 0.26, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ITEM_COLOR[drop.code] ?? '#ffd447';
      roundRect(x - s * 0.28, y - s * 0.28, s * 0.56, s * 0.56, s * 0.16);
      ctx.fill();
      ctx.fillStyle = '#04101f';
      ctx.font = `700 ${Math.round(s * 0.36)}px 'PingFang SC', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ITEM_MARK[drop.code] ?? '＋', x, y + s * 0.02);
    }
  };

  const drawBombs = (state) => {
    for (const bomb of state.bombs) {
      const s = ps(1);
      const x = px(bomb.x);
      const y = py(bomb.y);
      const left = Math.max(0, bomb.fuse) / FUSE;
      // 引信越短挤得越扁、越红；最后 0.6 秒开始闪——这是唯一的「快让开」信号。
      const squash = 1 + Math.sin(time * (10 + (1 - left) * 26)) * 0.08 * (1 - left);
      const radius = s * (0.3 + 0.1 * left);
      const hot = bomb.fuse < 0.6 && Math.floor(time * 12) % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.3, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hot ? '#ffe9a8' : `rgb(${Math.round(90 + (1 - left) * 150)}, ${Math.round(190 - (1 - left) * 60)}, 255)`;
      ctx.beginPath();
      ctx.ellipse(x, y, radius / squash, radius * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(x - radius * 0.3, y - radius * 0.35, radius * 0.18, radius * 0.12, -0.5, 0, Math.PI * 2);
      ctx.fill();
      if (bomb.slide) {
        // 正在滑的弹拖一道尾巴：踢出去的弹会停在哪儿，是踢弹唯一要算的事。
        ctx.strokeStyle = 'rgba(127,227,255,0.5)';
        ctx.lineWidth = Math.max(1, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(x - bomb.slide.x * radius * 1.6, y - bomb.slide.y * radius * 1.6);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  };

  /** 爆流：同一片里的格子连成一条水带，不画成四个独立方块——它是「流」。 */
  const drawBlasts = (state) => {
    for (const blast of state.blasts) {
      const fade = 1 - blast.age / blast.life;
      const s = ps(1);
      ctx.globalAlpha = Math.max(0, fade);
      for (const cell of blast.list) {
        const x = px(cell.cx);
        const y = py(cell.cy);
        const grow = 0.5 + fade * 0.5;
        ctx.fillStyle = 'rgba(127,227,255,0.42)';
        roundRect(x + s * (0.5 - grow * 0.5), y + s * (0.5 - grow * 0.5), s * grow, s * grow, s * 0.18);
        ctx.fill();
        ctx.fillStyle = 'rgba(233,250,255,0.75)';
        const core = grow * 0.5;
        roundRect(x + s * (0.5 - core * 0.5), y + s * (0.5 - core * 0.5), s * core, s * core, s * 0.12);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  const drawPlayer = (player) => {
    const s = ps(1);
    const x = px(player.x);
    const y = py(player.y);
    const mine = player.id === HUMAN;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3, s * 0.26, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    if (player.state === 'bubble') {
      const left = Math.max(0, Math.min(1, player.bubble / BUBBLE_LIFE));
      const radius = s * 0.4;
      // 泡里的人先画小一号，再套一层半透明的壳：被困住≠已经没了。
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(127,227,255,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(233,250,255,0.85)';
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.stroke();
      // 会走完的一圈环：环走完它就自己出来了，所以补刀的窗口是看得见的。
      ctx.strokeStyle = mine ? '#ffd447' : '#ff7a59';
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
      return;
    }

    // 无敌期闪一下：这段时间踩在爆流里也没事，得让人敢往里走。
    const blink = player.grace > 0 && Math.floor(time * 14) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (mine) {
      // 只给玩家画一圈描边：四个人挤在一片爆流边上时，找到自己是第一要务。
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 朝向用两只眼睛表示：放弹之前先看清自己正对着哪条巷子。
    const fx = player.face.x;
    const fy = player.face.y;
    ctx.fillStyle = '#04101f';
    for (const side of [-1, 1]) {
      const ex = x + fx * s * 0.12 + (fx ? 0 : side * s * 0.1);
      const ey = y + fy * s * 0.12 + (fy ? 0 : side * s * 0.1);
      ctx.beginPath();
      ctx.arc(ex + (fx ? 0 : 0), ey, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawSplashes = (dt) => {
    for (const bit of splashes) {
      bit.age += dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.vy += dt * 1.6;
      const fade = 1 - bit.age / bit.life;
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      ctx.fillStyle = bit.color;
      const r = ps(0.06) * fade + 1;
      ctx.beginPath();
      ctx.arc(px(bit.x), py(bit.y), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    splashes = splashes.filter((bit) => bit.age < bit.life);
  };

  const drawNotes = (dt) => {
    for (const item of notes) {
      item.age += dt;
      const fade = 1 - item.age / item.life;
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      ctx.fillStyle = item.color ?? '#ffd447';
      ctx.font = `700 ${Math.round(ps(0.34))}px 'PingFang SC', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, px(item.x), py(item.y) - ps(item.age * 0.8));
    }
    ctx.globalAlpha = 1;
    notes = notes.filter((item) => item.age < item.life);
  };

  return {
    notify,

    render(state, dt = 1 / 60) {
      time += dt;
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.save();
      if (shake > 0.01) {
        // 抖动只跟爆流走，且很短：格子游戏里镜头乱晃会让人读不出安全线。
        const amp = ps(0.06) * shake;
        ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
        shake = Math.max(0, shake - dt * 3.4);
      }
      drawGrid(state);
      drawDrops(state);
      drawBombs(state);
      drawBlasts(state);
      // 水泡先画、活人后画：活人会走到泡前面，这样自己永远不会被泡挡住。
      for (const player of state.players) {
        if (player.state === 'bubble') drawPlayer(player);
      }
      for (const player of state.players) {
        if (player.state === 'alive') drawPlayer(player);
      }
      drawSplashes(dt);
      drawNotes(dt);
      ctx.restore();
    },

    dispose() {
      observer.disconnect();
      canvas.remove();
    },
  };
}
