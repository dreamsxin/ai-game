// Canvas 2D 表现层。只读判定状态，不写回——所以画面出错永远不会影响比赛结果。
//
// 视角是**跟着车头转的俯视图**：车永远指向屏幕上方，赛道在脚下转。
// 手机上这是唯一读得清弯向的画法（固定朝向的俯视图会让人分不清「往左打」是往哪边）。
// 相机跟的是**速度方向而不是车头**，所以漂移时车在画面里是斜着走的——
// 这一点很要紧：漂移角是这游戏的核心操作量，它必须看得见。
//
// 画面要回答的问题只有四个，其余都是装饰：
// 1. 下一个弯往哪边、有多紧（路面本身 + 前方 200 米的路肩红白块）。
// 2. 我现在横到什么程度（车身斜角 + 后轮拖出的烟）。
// 3. 气攒到哪一档（车尾的攒气环由暗转亮，喷射时变成一条火舌）。
// 4. 我和对手的相对位置（小地图，以及贴身时对手车尾的尾流纹）。

import { TIERS, wrapAngle } from '../game/rules.js';
import { HUMAN } from '../game/simulation.js';

const MAX_SMOKE = 220;
const VIEW_METERS = 78;

// 路面几何一条赛道只算一次。边线点是纯几何，和比赛状态无关。
const edgeCache = new WeakMap();
const boundsCache = new WeakMap();

function edgesOf(course) {
  if (!edgeCache.has(course)) {
    const left = [];
    const right = [];
    for (let i = 0; i < course.count; i += 1) {
      left.push(course.edgeAt(i, 1));
      right.push(course.edgeAt(i, -1));
    }
    edgeCache.set(course, { left, right });
  }
  return edgeCache.get(course);
}

export function createRenderer(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let smoke = [];
  let shake = 0;
  let flash = 0;
  let time = 0;
  let cam = { x: 0, y: 0, heading: 0, ready: false };
  let size = { w: 1, h: 1, scale: 1 };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    size = { w: rect.width, h: rect.height, scale: Math.max(rect.height, 1) / VIEW_METERS };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const puff = (kart, count, spread, life) => {
    for (let i = 0; i < count && smoke.length < MAX_SMOKE; i += 1) {
      const back = kart.course + Math.PI + (Math.random() - 0.5) * spread;
      smoke.push({
        x: kart.x - Math.cos(kart.course) * 1.4,
        y: kart.y - Math.sin(kart.course) * 1.4,
        vx: Math.cos(back) * (2 + Math.random() * 3),
        vy: Math.sin(back) * (2 + Math.random() * 3),
        life: life * (0.7 + Math.random() * 0.6),
        age: 0,
        color: kart.color,
      });
    }
  };

  const drawKart = (kart, isMe) => {
    ctx.save();
    ctx.translate(kart.x, kart.y);
    ctx.rotate(kart.heading);
    // 喷射的火舌。长度跟着档位走，所以「刚才那下是大喷」看一眼车尾就知道。
    if (kart.boostTime > 0) {
      const len = 2.4 + kart.boostTier * 1.6 + Math.sin(time * 40) * 0.4;
      const grad = ctx.createLinearGradient(-1.4, 0, -1.4 - len, 0);
      grad.addColorStop(0, 'rgba(255,244,214,0.95)');
      grad.addColorStop(0.45, 'rgba(255,168,64,0.7)');
      grad.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-1.4, -0.62);
      ctx.lineTo(-1.4 - len, 0);
      ctx.lineTo(-1.4, 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-1.5, -0.95, 3, 1.9);
    ctx.fillStyle = kart.color;
    ctx.beginPath();
    ctx.moveTo(1.5, 0);
    ctx.lineTo(0.5, -0.85);
    ctx.lineTo(-1.35, -0.75);
    ctx.lineTo(-1.35, 0.75);
    ctx.lineTo(0.5, 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(8,14,26,0.85)';
    ctx.fillRect(-0.55, -0.55, 1, 1.1);
    ctx.fillStyle = '#10182a';
    for (const [wx, wy] of [[1, -0.95], [1, 0.6], [-1.1, -0.95], [-1.1, 0.6]]) ctx.fillRect(wx, wy, 0.7, 0.36);
    if (isMe) {
      // 攒气环：暗到亮就是一档到三档，满档时整圈发白。
      const level = Math.min(1, kart.charge / TIERS[2]);
      if (level > 0.02) {
        ctx.strokeStyle = level >= 1 ? '#fff6c8' : level >= 0.53 ? '#ffd447' : '#7fe3ff';
        ctx.lineWidth = 0.22;
        ctx.beginPath();
        ctx.arc(0, 0, 1.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * level);
        ctx.stroke();
      }
    } else {
      ctx.restore();
      ctx.save();
      ctx.translate(kart.x, kart.y);
      ctx.rotate(cam.heading + Math.PI / 2);
      // 对手名字朝屏幕正上方写，不跟着车转——转起来的字没法读。
      ctx.fillStyle = 'rgba(233,242,255,0.82)';
      ctx.font = '1.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(kart.name, 0, -2.4);
    }
    ctx.restore();
  };

  const drawTrack = (course, me) => {
    const { left, right } = edgesOf(course);
    const at = (list, i) => list[((i % course.count) + course.count) % course.count];
    const center = Math.round(me.s / course.step);
    const from = center - 18;
    const to = center + 62;

    // 路肩缓冲带：画在路面下面一层，宽出去的那一圈就是「再往外就是墙」。
    ctx.beginPath();
    for (let i = from; i <= to; i += 1) {
      const node = course.node(i);
      const nx = -Math.sin(node.heading);
      const ny = Math.cos(node.heading);
      const w = course.half + 4;
      const x = node.x + nx * w;
      const y = node.y + ny * w;
      if (i === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = to; i >= from; i -= 1) {
      const node = course.node(i);
      const nx = -Math.sin(node.heading);
      const ny = Math.cos(node.heading);
      const w = course.half + 4;
      ctx.lineTo(node.x - nx * w, node.y - ny * w);
    }
    ctx.closePath();
    ctx.fillStyle = '#2b3a26';
    ctx.fill();

    ctx.beginPath();
    for (let i = from; i <= to; i += 1) {
      const p = at(left, i);
      if (i === from) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let i = to; i >= from; i -= 1) {
      const p = at(right, i);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = '#20263a';
    ctx.fill();

    // 路肩红白块。每两节换一次色，块的疏密就是弯的紧密——远处那一串是提前读弯的依据。
    ctx.lineWidth = 1.2;
    for (const list of [left, right]) {
      for (let i = from; i < to; i += 1) {
        const a = at(list, i);
        const b = at(list, i + 1);
        ctx.strokeStyle = i % 4 < 2 ? '#e8556c' : '#eef3ff';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(233,242,255,0.18)';
    ctx.lineWidth = 0.3;
    for (let i = from; i < to; i += 2) {
      const a = course.node(i);
      const b = course.node(i + 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // 起跑线。只在附近才画，省得每帧算一遍整圈。
    if (from <= 0 && to >= 0) {
      const node = course.node(0);
      const nx = -Math.sin(node.heading);
      const ny = Math.cos(node.heading);
      const cells = 10;
      for (let c = 0; c < cells; c += 1) {
        const t0 = -course.half + (course.width * c) / cells;
        const t1 = -course.half + (course.width * (c + 1)) / cells;
        ctx.fillStyle = c % 2 === 0 ? '#f3f6ff' : '#1b2030';
        ctx.beginPath();
        ctx.moveTo(node.x + nx * t0, node.y + ny * t0);
        ctx.lineTo(node.x + nx * t1, node.y + ny * t1);
        ctx.lineTo(node.x + nx * t1 + Math.cos(node.heading) * 1.6, node.y + ny * t1 + Math.sin(node.heading) * 1.6);
        ctx.lineTo(node.x + nx * t0 + Math.cos(node.heading) * 1.6, node.y + ny * t0 + Math.sin(node.heading) * 1.6);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  const drawMinimap = (state) => {
    const course = state.level.course;
    let box = boundsCache.get(course);
    if (!box) {
      const xs = course.nodes.map((node) => node.x);
      const ys = course.nodes.map((node) => node.y);
      box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
      boundsCache.set(course, box);
    }
    const pad = 8;
    const side = Math.min(96, size.w * 0.28);
    const ox = size.w - side - 10;
    const oy = 10;
    const scale = Math.min((side - pad * 2) / (box.x1 - box.x0), (side - pad * 2) / (box.y1 - box.y0));
    const mx = (x) => ox + pad + (x - box.x0) * scale;
    const my = (y) => oy + pad + (y - box.y0) * scale;

    ctx.save();
    ctx.fillStyle = 'rgba(8,12,22,0.55)';
    ctx.beginPath();
    ctx.roundRect(ox, oy, side, side, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(233,242,255,0.35)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    course.nodes.forEach((node, index) => {
      if (index === 0) ctx.moveTo(mx(node.x), my(node.y));
      else ctx.lineTo(mx(node.x), my(node.y));
    });
    ctx.closePath();
    ctx.stroke();
    for (const kart of state.karts) {
      ctx.fillStyle = kart.id === HUMAN ? '#ffffff' : kart.color;
      ctx.beginPath();
      ctx.arc(mx(kart.x), my(kart.y), kart.id === HUMAN ? 3.4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  return {
    /** effects 只用来加特效。判定层已经算完了，这里只负责让它「看起来发生过」。 */
    notify(effects = []) {
      for (const effect of effects) {
        if (effect.type === 'wall' && effect.self) shake = Math.max(shake, 0.45);
        if (effect.type === 'boost' && effect.self) flash = Math.max(flash, 0.35);
        if (effect.type === 'bump' && effect.self) shake = Math.max(shake, 0.16);
      }
    },

    render(state, dt = 0) {
      time += dt;
      shake = Math.max(0, shake - dt * 2.2);
      flash = Math.max(0, flash - dt * 2.6);

      const course = state.level.course;
      const me = state.karts[HUMAN];

      if (!cam.ready) {
        cam = { x: me.x, y: me.y, heading: me.course, ready: true };
      } else {
        // 相机往前送一点，速度越快看得越远：不然高速时弯已经到脚下才看见。
        const lead = 6 + me.speed * 0.28;
        const tx = me.x + Math.cos(me.course) * lead;
        const ty = me.y + Math.sin(me.course) * lead;
        const follow = Math.min(1, dt * 7);
        cam.x += (tx - cam.x) * follow;
        cam.y += (ty - cam.y) * follow;
        cam.heading += wrapAngle(me.course - cam.heading) * Math.min(1, dt * 6);
      }

      for (const kart of state.karts) {
        if (kart.drifting && !kart.offTrack && kart.speed > 10) puff(kart, 2, 0.9, 0.42);
        if (kart.offTrack && kart.speed > 6) puff(kart, 1, 1.6, 0.3);
        if (kart.boostTime > 0) puff(kart, 1, 0.4, 0.22);
      }
      for (const flake of smoke) {
        flake.age += dt;
        flake.x += flake.vx * dt;
        flake.y += flake.vy * dt;
        flake.vx *= 0.94;
        flake.vy *= 0.94;
      }
      smoke = smoke.filter((flake) => flake.age < flake.life);

      ctx.save();
      ctx.fillStyle = '#3f5a33';
      ctx.fillRect(0, 0, size.w, size.h);

      const jolt = shake > 0 ? shake * 6 : 0;
      ctx.translate(
        size.w / 2 + (Math.random() - 0.5) * jolt,
        size.h * 0.68 + (Math.random() - 0.5) * jolt,
      );
      ctx.rotate(-Math.PI / 2 - cam.heading);
      ctx.scale(size.scale, size.scale);
      ctx.translate(-cam.x, -cam.y);

      drawTrack(course, me);

      for (const flake of smoke) {
        const fade = 1 - flake.age / flake.life;
        ctx.fillStyle = `rgba(226,232,244,${(fade * 0.34).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, 0.4 + (1 - fade) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 吃到尾流时在前车尾后拉两道纹：这份便宜是白拿的，但得让人看见自己正在拿。
      if (me.draft) {
        ctx.strokeStyle = 'rgba(127,227,255,0.35)';
        ctx.lineWidth = 0.24;
        for (const side of [-0.7, 0.7]) {
          ctx.beginPath();
          ctx.moveTo(me.x - Math.sin(me.course) * side, me.y + Math.cos(me.course) * side);
          ctx.lineTo(
            me.x + Math.cos(me.course) * 9 - Math.sin(me.course) * side,
            me.y + Math.sin(me.course) * 9 + Math.cos(me.course) * side,
          );
          ctx.stroke();
        }
      }

      for (const kart of state.karts) if (kart.id !== HUMAN) drawKart(kart, false);
      drawKart(me, true);
      ctx.restore();

      if (flash > 0) {
        ctx.fillStyle = `rgba(255,236,180,${(flash * 0.22).toFixed(3)})`;
        ctx.fillRect(0, 0, size.w, size.h);
      }
      drawMinimap(state);
    },

    dispose() {
      observer.disconnect();
      canvas.remove();
      smoke = [];
    },
  };
}


