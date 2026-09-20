// 画笔：把抚州画成一卷青绿山水。
//
// 《千里江山图》的几条规矩在这里都用上了：
//   1. 只用两种矿物色（石绿、石青）+ 赭石打底 + 淡墨勾轮廓 + 金点提神，不用现代高饱和色；
//   2. 远山偏青、近山偏绿（见 taxonomy.js 的 TIERS），靠颜色而不是透视拉开层次；
//   3. 山脚压云、山腰留白 —— 留白是画面呼吸的地方，也正好给地名腾位置；
//   4. 卷面两侧的空白不是浪费，题名、跋文和印章就该在那儿。
//
// 所有随机都走 hash（同一个位置永远画出同一座山），所以画面在平移缩放时不会抖。

import { PALETTE, TIERS, categoryOf } from '../data/taxonomy.js';
import { CITY, RIVERS, LAKES, MOUNTAINS } from '../data/geo.js';
import { project } from './projection.js';

const fract = (v) => v - Math.floor(v);
const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const hash2 = (a, b) => fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);

// ---------- 绢底 ----------

let silkCache = null;

/**
 * 绢底：暖褐底色 + 横向织纹 + 四角发暗。
 * 一次画进离屏 canvas 存起来，之后每帧只是贴一张图 ——
 * 织纹有两千多笔，每帧重画会把帧率拖死。
 */
function getSilk(width, height) {
  if (silkCache && silkCache.width === width && silkCache.height === height) return silkCache.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');

  const base = g.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#eadcba');
  base.addColorStop(0.45, PALETTE.silk);
  base.addColorStop(1, PALETTE.silkWarm);
  g.fillStyle = base;
  g.fillRect(0, 0, width, height);

  // 织纹：横向细线加零星竖丝，像绢的经纬
  g.lineWidth = 1;
  for (let i = 0; i < height; i += 3) {
    g.strokeStyle = `rgba(120, 96, 60, ${0.03 + hash(i) * 0.03})`;
    g.beginPath();
    g.moveTo(0, i + 0.5);
    g.lineTo(width, i + 0.5);
    g.stroke();
  }
  for (let i = 0; i < 420; i++) {
    const x = hash(i * 3.7) * width;
    const y = hash(i * 7.3 + 1) * height;
    const len = 6 + hash(i * 2.1) * 26;
    g.strokeStyle = `rgba(103, 82, 52, ${0.05 + hash(i) * 0.06})`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 1.5, y + len);
    g.stroke();
  }
  // 斑驳的旧渍
  for (let i = 0; i < 60; i++) {
    const x = hash(i * 5.1 + 3) * width;
    const y = hash(i * 9.7 + 5) * height;
    const r = 18 + hash(i * 1.3) * 70;
    const stain = g.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, `rgba(139, 110, 66, ${0.05 + hash(i) * 0.05})`);
    stain.addColorStop(1, 'rgba(139, 110, 66, 0)');
    g.fillStyle = stain;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // 四角压暗，让卷面像旧绢
  const vig = g.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
  vig.addColorStop(0, 'rgba(80, 60, 30, 0)');
  vig.addColorStop(1, 'rgba(80, 60, 30, 0.26)');
  g.fillStyle = vig;
  g.fillRect(0, 0, width, height);

  silkCache = { width, height, canvas };
  return canvas;
}

// ---------- 山 ----------

/** 一个山头的轮廓。左缓右陡（或反过来），顶上带一点偏，不画成等腰三角 */
function peakPath(ctx, cx, baseY, halfW, height, lean) {
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY);
  ctx.bezierCurveTo(
    cx - halfW * 0.62, baseY - height * 0.3,
    cx - halfW * (0.5 - lean * 0.2), baseY - height * 0.8,
    cx + lean * halfW * 0.22, baseY - height,
  );
  ctx.bezierCurveTo(
    cx + halfW * (0.48 + lean * 0.16), baseY - height * 0.78,
    cx + halfW * 0.68, baseY - height * 0.28,
    cx + halfW, baseY,
  );
  ctx.closePath();
}

/** 山腰的皴笔：从顶往下拉几道短弧，青绿山水靠这个出体积 */
function strokeRidge(ctx, cx, baseY, halfW, height, seed, edge) {
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 3; i++) {
    const t = 0.25 + i * 0.22 + hash(seed + i) * 0.08;
    const sx = cx + (hash(seed + i * 3.1) - 0.5) * halfW * 0.5;
    const sy = baseY - height * (1 - t * 0.35);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx - halfW * 0.18, sy + height * 0.22, sx - halfW * 0.34, baseY - height * 0.04);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 近山的山头点几笔树，只在放大到一定程度才画，远看是噪点 */
function dotTrees(ctx, cx, baseY, halfW, height, seed, zoom) {
  if (zoom < 1.35) return;
  ctx.fillStyle = 'rgba(38, 74, 48, 0.75)';
  const n = 5 + Math.floor(hash(seed) * 4);
  for (let i = 0; i < n; i++) {
    const t = hash(seed + i * 1.7);
    const x = cx - halfW * 0.6 + t * halfW * 1.2;
    const y = baseY - height * (0.12 + hash(seed + i * 2.3) * 0.3);
    const r = 1.6 + hash(seed + i) * 1.6;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 画一簇山：一座山在图上是三到五个高低错落的山头，中间那个最高 */
function paintMountain(ctx, view, m, zoom) {
  const tier = TIERS[m.tier] ?? TIERS[1];
  const center = project(view, m.lng, m.lat);
  const spreadPx = m.spread * view.scale * 0.6;
  const unit = Math.max(12, view.scale * 0.032);
  const seed = m.lng * 100 + m.lat;

  // 山脚的云：先铺白雾，山压在雾上，这是青绿山水最常用的一招
  const cloud = ctx.createRadialGradient(center.x, center.y + unit * 0.15, 0, center.x, center.y + unit * 0.15, spreadPx * 0.9 + unit * 0.6);
  cloud.addColorStop(0, 'rgba(253, 250, 242, 0.55)');
  cloud.addColorStop(0.6, 'rgba(253, 250, 242, 0.2)');
  cloud.addColorStop(1, 'rgba(253, 250, 242, 0)');
  ctx.fillStyle = cloud;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + unit * 0.18, spreadPx * 0.95 + unit * 0.6, unit * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < m.peaks; i++) {
    const t = m.peaks === 1 ? 0.5 : i / (m.peaks - 1);
    const jitter = hash(seed + i * 4.7) - 0.5;
    const cx = center.x + (t - 0.5) * spreadPx * 2 + jitter * spreadPx * 0.25;
    const baseY = center.y + Math.abs(t - 0.5) * unit * 0.5 + jitter * unit * 0.2;
    // 中间的山头最高，两侧递减；再按这座山的实际海拔整体缩放
    const tall = (1 - Math.abs(t - 0.5) * 0.85) * (0.55 + Math.min(1, m.h / 1500) * 0.6);
    const height = unit * (0.9 + tall * 1.4) * (0.85 + hash(seed + i) * 0.3);
    const halfW = spreadPx * (0.35 + hash(seed + i * 2.3) * 0.18) + unit * 0.25;
    const lean = hash(seed + i * 5.9) > 0.5 ? 1 : -1;

    const grad = ctx.createLinearGradient(cx, baseY - height, cx, baseY);
    grad.addColorStop(0, tier.fill);
    grad.addColorStop(0.62, tier.fill);
    grad.addColorStop(1, tier.base);
    peakPath(ctx, cx, baseY, halfW, height, lean);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = tier.edge;
    ctx.lineWidth = Math.max(0.8, unit * 0.045);
    ctx.stroke();
    strokeRidge(ctx, cx, baseY, halfW, height, seed + i * 11, tier.edge);
    if (m.tier === 2) dotTrees(ctx, cx, baseY, halfW, height, seed + i * 13, zoom);
  }
}

// ---------- 水 ----------

/** 河流：用宽窄渐变的曲线画，颜色是矿物蓝加一点绿 */
function paintRiver(ctx, view, river) {
  if (river.pts.length < 2) return;
  const pts = river.pts.map(([lng, lat]) => project(view, lng, lat));
  const baseW = Math.max(2.5, view.scale * 0.014 * river.width * 1.3);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 底色：淡墨描一条宽线，模拟「墨分五色」里的淡墨
  ctx.strokeStyle = 'rgba(28, 60, 72, 0.14)';
  ctx.lineWidth = baseW + 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // 水体
  ctx.strokeStyle = PALETTE.water;
  ctx.lineWidth = baseW;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // 水纹：在河两侧画几道平行短弧，让水面有流动感
  ctx.strokeStyle = PALETTE.waterDeep;
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < 3; s++) {
      const t = 0.2 + s * 0.3 + hash(i * 7 + s) * 0.1;
      const x = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
      const y = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
      const angle = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
      const waveW = baseW * (0.8 + hash(i * 3 + s) * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, waveW, angle - 0.6, angle + 0.6);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 湖：一个绢面上的水色椭圆 + 几道波纹 */
function paintLake(ctx, view, lake) {
  const { x, y } = project(view, lake.lng, lake.lat);
  const rx = lake.rx * view.scale;
  const ry = lake.ry * view.scale;

  // 水面渐变：中心偏亮，边缘偏深
  const grad = ctx.createRadialGradient(x - rx * 0.2, y - ry * 0.15, 0, x, y, Math.max(rx, ry));
  grad.addColorStop(0, '#8ec8da');
  grad.addColorStop(0.6, PALETTE.water);
  grad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 水纹
  ctx.strokeStyle = 'rgba(40, 80, 100, 0.18)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const wavY = y - ry * 0.3 + i * ry * 0.22;
    const wavX = x - rx * 0.6 + hash(i * 5.3) * rx * 0.2;
    ctx.beginPath();
    ctx.moveTo(wavX, wavY);
    ctx.quadraticCurveTo(x, wavY + ry * 0.04, wavX + rx * 1.2, wavY - ry * 0.02);
    ctx.stroke();
  }
}

// ---------- 标注 ----------

const FONT_FAMILY = '"FangSong", "STFangsong", "SimSun", "Noto Serif SC", serif';

function paintCountyLabels(ctx, view, counties, zoom) {
  if (zoom < 0.95) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.max(10, Math.min(16, 12 / Math.sqrt(zoom)));
  ctx.font = `400 ${size}px ${FONT_FAMILY}`;
  for (const c of counties) {
    const { x, y } = project(view, c.seat[0], c.seat[1]);
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.fillText(c.name, x, y);
  }
}

function paintMountainLabels(ctx, view, zoom) {
  if (zoom < 1.4) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const size = Math.max(8, Math.min(11, 9 / Math.sqrt(zoom)));
  ctx.font = `400 ${size}px ${FONT_FAMILY}`;
  for (const m of MOUNTAINS) {
    if (!m.label) continue;
    const p = project(view, m.lng, m.lat);
    const unit = Math.max(12, view.scale * 0.032);
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.fillText(`▲ ${m.name}`, p.x, p.y - unit * 1.2);
  }
}

/** 景点标记：金色菱形 + 白色描边名字，选中的脉冲放大 */
function paintSpots(ctx, view, spots, selectedId, hoverId, zoom) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const big = Math.max(11, Math.min(15, 13 / Math.sqrt(zoom)));
  const small = Math.max(9, Math.min(12, 10 / Math.sqrt(zoom)));

  for (const s of spots) {
    const { x, y } = project(view, s.lng, s.lat);
    const hot = s.id === selectedId || s.id === hoverId;
    const cat = categoryOf(s.category);
    const r = hot ? 7.5 : 5;

    // 菱形标记
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = hot ? PALETTE.gold : (cat?.color ?? PALETTE.gold);
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.strokeStyle = PALETTE.silk;
    ctx.lineWidth = hot ? 2.4 : 1.5;
    ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.restore();

    // 名字
    ctx.font = `600 ${hot ? big : small}px ${FONT_FAMILY}`;
    ctx.strokeStyle = PALETTE.silk;
    ctx.lineWidth = 3;
    ctx.strokeText(s.name, x, y - r - 4);
    ctx.fillStyle = hot ? PALETTE.cinnabar : PALETTE.ink;
    ctx.fillText(s.name, x, y - r - 4);
  }
}

// ---------- 题名与印章 ----------

function paintTitle(ctx, w, h, zoom) {
  if (zoom > 1.5) return; // 放大后题名太大，让出来
  ctx.save();
  const size = Math.max(20, Math.min(32, 28 / Math.sqrt(zoom)));
  ctx.font = `700 ${size}px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.ink;
  ctx.globalAlpha = 0.72;
  // 竖排：逐字换行
  const title = '抚州山水行旅图';
  for (let i = 0; i < title.length; i++) {
    ctx.fillText(title[i], w - 28, 36 + i * (size + 6));
  }
  // 印章：一个方框里填两个字
  const stampSize = Math.max(14, size * 0.55);
  const sx = w - 28 - stampSize * 0.5;
  const sy = 36 + title.length * (size + 6) + 12;
  ctx.strokeStyle = PALETTE.cinnabar;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(sx - stampSize * 0.5, sy, stampSize, stampSize);
  ctx.fillStyle = PALETTE.cinnabar;
  ctx.font = `700 ${stampSize * 0.48}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('行', sx, sy + stampSize * 0.35);
  ctx.fillText('旅', sx, sy + stampSize * 0.75);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------- 主入口 ----------

import { COUNTIES } from '../data/taxonomy.js';
import { zoomOf } from './projection.js';

/**
 * 画一帧。调用方负责给 ctx 和 view，这里只负责「落笔」。
 * 画序就是传统山水画的叠法：底色 → 远山 → 水 → 近山 → 标注 → 景点 → 题名。
 */
export function paint(ctx, view, { spots, selectedId, hoverId }) {
  const { width, height } = view;
  const zoom = zoomOf(view);

  ctx.clearRect(0, 0, width, height);

  // 绢底
  ctx.drawImage(getSilk(width, height), 0, 0);

  // 远山（tier 0）
  MOUNTAINS.filter((m) => m.tier === 0).forEach((m) => paintMountain(ctx, view, m, zoom));

  // 水系
  for (const r of RIVERS) paintRiver(ctx, view, r);
  for (const l of LAKES) paintLake(ctx, view, l);

  // 中景山（tier 1）
  MOUNTAINS.filter((m) => m.tier === 1).forEach((m) => paintMountain(ctx, view, m, zoom));

  // 近景山（tier 2）
  MOUNTAINS.filter((m) => m.tier === 2).forEach((m) => paintMountain(ctx, view, m, zoom));

  // 标注
  paintCountyLabels(ctx, view, COUNTIES, zoom);
  paintMountainLabels(ctx, view, zoom);

  // 景点
  paintSpots(ctx, view, spots, selectedId, hoverId, zoom);

  // 题名与印章
  paintTitle(ctx, width, height, zoom);
}





