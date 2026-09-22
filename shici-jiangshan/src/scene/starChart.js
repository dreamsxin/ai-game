// 星图的画法：绢底、墨线、朱点 —— 照苏州石刻天文图那一路，不是深空照片。
//
// 判定层（atlas/starmap.js）已经把每位作者的星等与坐标算好，这一层只管画：
// 星点大小按星等（一等最大），颜色按朝代（石青唐、石绿宋、赭石元），
// 亮星带晕、暗星只有一点；名字只给亮到三等的写出来，其余靠悬停。
// 这跟地图那边"远看只出印章"是同一条规矩：一次写出一百四十六个名字就是一堵字墙。

import { PALETTE, dynastyOf } from '../atlas/taxonomy.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const FONT = '"Songti SC","STSong","SimSun","Noto Serif SC",serif';

/** 星点半径：一等 10 像素到六等 2.2 像素，按星等指数收，差距才看得出来 */
const radiusOf = (mag, scale) => (2.1 + 7.9 * ((6 - mag) / 5) ** 1.35) * scale;

/** 画布坐标：判定层给的是 -1..1，这里换成像素，留出边距好写名字 */
const project = (star, w, h) => {
  const pad = Math.min(w, h) * 0.13;
  const r = Math.min(w, h) / 2 - pad;
  return [w / 2 + star.x * r, h / 2 + star.y * r];
};

export function drawStarChart(ctx, { stars, width: w, height: h, hover, selected, dpr = 1 }) {
  const scale = Math.max(0.72, Math.min(1.25, Math.min(w, h) / 900));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 绢底：中间略亮、边缘略深，像一张摊开的旧绢
  const pad = Math.min(w, h) * 0.13;
  const R = Math.min(w, h) / 2 - pad;
  const bg = ctx.createRadialGradient(w / 2, h / 2, R * 0.1, w / 2, h / 2, R * 1.9);
  bg.addColorStop(0, '#efe4c4');
  bg.addColorStop(1, '#dfd0a6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 分野圈：古星图的三圈（内规、赤道、外规），这里借来当"篇数的量尺"
  ctx.strokeStyle = 'rgba(59,58,52,0.16)';
  ctx.lineWidth = 1;
  for (const k of [0.34, 0.67, 1]) {
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, R * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(45,86,104,0.20)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 + Math.cos(a) * R * 0.34, h / 2 + Math.sin(a) * R * 0.34);
    ctx.lineTo(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 旋臂：同一朝代按名次连成一线（像星图上连"宿"的朱线），线要淡，它是背景不是主角
  const byArm = new Map();
  for (const s of stars) {
    if (!byArm.has(s.dynasty)) byArm.set(s.dynasty, []);
    byArm.get(s.dynasty).push(s);
  }
  for (const [dyn, list] of byArm) {
    if (list.length < 2) continue;
    ctx.strokeStyle = `${hex(dynastyOf(dyn).color)}44`;
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    list.forEach((s, i) => {
      const [x, y] = project(s, w, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // 星点：暗的先画，亮的压在上面
  const order = [...stars].sort((a, b) => b.mag - a.mag);
  for (const s of order) {
    const [x, y] = project(s, w, h);
    const rr = radiusOf(s.mag, scale);
    const color = hex(dynastyOf(s.dynasty).color);
    const on = s.name === hover || s.name === selected;

    if (s.mag <= 3 || on) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, rr * (on ? 4.6 : 3.2));
      halo.addColorStop(0, `${color}55`);
      halo.addColorStop(1, `${color}00`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, rr * (on ? 4.6 : 3.2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
    // 一二等星加一圈绢色内环，像刻在石头上的星点
    if (s.mag <= 2) {
      ctx.strokeStyle = 'rgba(240,231,205,0.85)';
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath();
      ctx.arc(x, y, rr * 0.52, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (on) {
      ctx.strokeStyle = hex(PALETTE.zhu);
      ctx.lineWidth = 1.6 * scale;
      ctx.beginPath();
      ctx.arc(x, y, rr + 5 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 名字：三等以上常驻，其余等悬停。
  // 这里同样要避让 —— 星图中心那几颗一等星相距不过十几像素，
  // 名字若都按"星右侧"写，就会叠成"李白王维杜甫"一串。做法与地图那边一致：
  // 给每个名字四个候选位（右、左、上、下），第一个不撞的就用，四个都撞就不写
  // （悬停或选中的那一颗例外，它必须出名字）。
  const placed = [];
  const hits = (r) => placed.some((p) => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]);
  const bright = [...order].sort((a, b) => a.mag - b.mag);   // 亮的先占位
  for (const s of bright) {
    const on = s.name === hover || s.name === selected;
    if (s.mag > 3 && !on) continue;
    const [x, y] = project(s, w, h);
    const rr = radiusOf(s.mag, scale);
    const size = (s.mag <= 2 ? 17 : 14.5) * scale;
    ctx.font = `500 ${size}px ${FONT}`;
    const label = on ? `${s.name} · ${s.count} 首` : s.name;
    const tw = ctx.measureText(label).width;
    const th = size * 1.12;
    const gap = rr + 7 * scale;
    const spots = [
      [x + gap, y + size * 0.36],
      [x - gap - tw, y + size * 0.36],
      [x - tw / 2, y - gap - size * 0.1],
      [x - tw / 2, y + gap + size * 0.9],
    ];
    let put = null;
    for (const [lx, ly] of spots) {
      const rect = [lx - 3, ly - size * 0.82, lx + tw + 3, ly - size * 0.82 + th];
      if (!hits(rect)) { put = [lx, ly, rect]; break; }
    }
    if (!put && !on) continue;
    const [lx, ly, rect] = put ?? [spots[0][0], spots[0][1], [spots[0][0] - 3, spots[0][1] - size * 0.82, spots[0][0] + tw + 3, spots[0][1] - size * 0.82 + th]];
    placed.push(rect);
    ctx.fillStyle = 'rgba(240,231,205,0.82)';
    ctx.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
    ctx.fillStyle = on ? hex(PALETTE.zhu) : '#2b2922';
    ctx.fillText(label, lx, ly);
  }
}

/** 点中了哪颗星：按屏幕距离找最近的，半径按星等放宽一点，暗星也点得中 */
export function hitTest(stars, px, py, w, h) {
  let best = null;
  let bestD = Infinity;
  const scale = Math.max(0.72, Math.min(1.25, Math.min(w, h) / 900));
  for (const s of stars) {
    const [x, y] = project(s, w, h);
    const d = Math.hypot(px - x, py - y);
    const reach = radiusOf(s.mag, scale) + 9 * scale;
    if (d <= reach && d < bestD) { bestD = d; best = s; }
  }
  return best;
}
