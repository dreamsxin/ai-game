// 千年江山图——长卷绘制。只读版面数据，自己不改判定层的任何东西。
//
// 画法上照《千里江山图》的两条：
//   1. 天就是绢。天空、雾、远山的淡入全用绢色系；蓝色只留给峰顶的石青。
//   2. 远山不是变灰，是**淡入绢底**，所以三层山峦的 hazed 深度差要拉得开。
//
// 交互：横向拖动／滚轮平移，点标记选中。竖向不动——长卷的高度就是一屏。

import {
  SILK, SILK_DEEP, SILK_PALE, INK, INK_SOFT, CINNABAR,
  KIND_COLOR, ridgeColor, hazed, mix,
} from '../atlas/palette.js';
import { WORLD_H, HORIZON, yForHeight } from '../atlas/timeline.js';
import { hash01, seedOf } from '../atlas/terrain.js';
import { placeLabels } from './labels.js';

const MARK_R = 6;
const MARK_R_ON = 9;
const HIT_R = 15;
const EASE = 0.18;

function rgba(hex, alpha) {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createScroll(canvas, layout) {
  const ctx = canvas.getContext('2d');
  let viewW = 1;
  let viewH = 1;
  let scale = 1;
  let camera = 0;
  let target = 0;
  let labels = [];
  let marks = layout.marks;

  function maxCamera() {
    return Math.max(0, layout.width - viewW / scale);
  }

  function clamp() {
    camera = Math.max(0, Math.min(maxCamera(), camera));
    target = Math.max(0, Math.min(maxCamera(), target));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = Math.max(1, Math.round(rect.width));
    viewH = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = viewH / WORLD_H;
    clamp();
  }

  const sxOf = (worldX, parallax = 1) => (worldX - camera * parallax) * scale;
  const syOf = (worldY) => worldY * scale;

  function drawSilk() {
    const g = ctx.createLinearGradient(0, 0, 0, syOf(HORIZON));
    g.addColorStop(0, SILK_PALE);
    g.addColorStop(0.62, SILK);
    g.addColorStop(1, mix(SILK, SILK_DEEP, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawLayer(layer) {
    const line = layer.line;
    const horizonY = syOf(HORIZON);
    let started = false;
    let lastSx = 0;
    ctx.beginPath();
    for (let i = 0; i < line.length; i += 1) {
      const p = line[i];
      const sx = sxOf(p.x, layer.parallax);
      if (sx < -80) continue;
      if (sx > viewW + 80) break;
      const sy = syOf(yForHeight(p.h));
      if (!started) {
        ctx.moveTo(sx, horizonY);
        ctx.lineTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
      lastSx = sx;
    }
    if (!started) return;
    ctx.lineTo(lastSx, horizonY);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, syOf(yForHeight(1)), 0, horizonY);
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      g.addColorStop(t, hazed(ridgeColor(1 - t), layer.depth));
    }
    ctx.fillStyle = g;
    ctx.fill();


    // 墨线只给近中两层，远山靠淡入绢底表示距离
    if (layer.depth > 0.5) return;
    ctx.beginPath();
    started = false;
    for (let i = 0; i < line.length; i += 1) {
      const p = line[i];
      const sx = sxOf(p.x, layer.parallax);
      if (sx < -80) continue;
      if (sx > viewW + 80) break;
      const sy = syOf(yForHeight(p.h));
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = rgba(INK_SOFT, 0.34 * (1 - layer.depth));
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  /** 乱世那几段的谷口铺云雾——山断成几截，中间是水与云。 */
  function drawMist() {
    for (const seg of layout.segments) {
      if (seg.kind !== 'divided') continue;
      const seed = seedOf(`mist:${seg.id}`);
      for (let i = 0; i < 3; i += 1) {
        const wx = seg.x0 + seg.width * (0.18 + 0.3 * i + 0.1 * hash01(seed + i * 17));
        const sx = sxOf(wx);
        if (sx < -260 || sx > viewW + 260) continue;
        const wy = HORIZON - 40 - 90 * hash01(seed + i * 31 + 5);
        const rw = (120 + 150 * hash01(seed + i * 47 + 9)) * scale;
        const rh = (16 + 14 * hash01(seed + i * 59 + 3)) * scale;
        const g = ctx.createRadialGradient(sx, syOf(wy), 0, sx, syOf(wy), Math.max(rw, rh));
        g.addColorStop(0, rgba(SILK_PALE, 0.85));
        g.addColorStop(1, rgba(SILK_PALE, 0));
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(sx, syOf(wy));
        ctx.scale(1, Math.max(0.2, rh / Math.max(rw, 1)));
        ctx.beginPath();
        ctx.arc(0, 0, rw, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawWater() {
    const horizonY = syOf(HORIZON);
    const g = ctx.createLinearGradient(0, horizonY, 0, viewH);
    g.addColorStop(0, mix(SILK, SILK_PALE, 0.5));
    g.addColorStop(0.45, SILK);
    g.addColorStop(1, SILK_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY, viewW, viewH - horizonY);

    // 水纹跟着卷面走，不然平移时水面像贴纸；近处的纹粗而密，远处细
    const rows = 9;
    for (let r = 0; r < rows; r += 1) {
      const t = r / (rows - 1);
      const wy = HORIZON + 10 + t * (WORLD_H - HORIZON - 18);
      const sy = syOf(wy);
      const seed = seedOf(`wave:${r}`);
      ctx.strokeStyle = rgba(INK_SOFT, 0.1 + 0.16 * t);
      ctx.lineWidth = 0.8 + t * 0.8;
      for (let k = 0; k < 26; k += 1) {
        const wx = (hash01(seed + k * 13) * layout.width + r * 311) % layout.width;
        const sx = sxOf(wx);
        const len = (70 + 220 * hash01(seed + k * 29)) * scale;
        if (sx + len < 0 || sx > viewW) continue;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + len, sy);
        ctx.stroke();
      }
    }

    // 岸线：山脚与水面之间压一道淡墨，江面才有边
    ctx.strokeStyle = rgba(INK_SOFT, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(viewW, horizonY);
    ctx.stroke();
  }

  /** 段界的一道雾带：不画线也能看出「这里换了一朝」。只浮在山腰以上，不然像根白柱子。 */
  function drawSegmentSeams() {
    const skyBottom = syOf(HORIZON);
    for (const seg of layout.segments) {
      if (seg.x0 === 0) continue;
      const sx = sxOf(seg.x0);
      const half = 40 * scale;
      if (sx < -half || sx > viewW + half) continue;
      const band = ctx.createLinearGradient(sx - half, 0, sx + half, 0);
      band.addColorStop(0, rgba(SILK_PALE, 0));
      band.addColorStop(0.5, rgba(SILK_PALE, 0.3));
      band.addColorStop(1, rgba(SILK_PALE, 0));
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - half, 0, half * 2, skyBottom);
      ctx.clip();
      // 竖向也淡出：上端最浓，到江面已经几乎没有了
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = band;
      ctx.fillRect(sx - half, 0, half * 2, skyBottom * 0.72);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(sx - half, skyBottom * 0.72, half * 2, skyBottom * 0.28);
      ctx.restore();
    }
  }

  /** 题签：竖排段名 + 朝代自己的印。 */
  function drawCartouches(activeId) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const seg of layout.segments) {
      const sx = sxOf((seg.x0 + seg.x1) / 2);
      if (sx < -70 || sx > viewW + 70) continue;
      const chars = [...seg.name];
      const active = seg.id === activeId;
      const step = 17;
      const boxW = 26;
      const boxH = chars.length * step + 30;
      const top = 16;
      roundRect(ctx, sx - boxW / 2, top, boxW, boxH, 5);
      ctx.fillStyle = rgba(SILK_PALE, active ? 0.95 : 0.78);
      ctx.fill();
      ctx.strokeStyle = active ? rgba(CINNABAR, 0.75) : rgba(INK_SOFT, 0.45);
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.font = '13px "Songti SC", "SimSun", serif';
      chars.forEach((ch, i) => ctx.fillText(ch, sx, top + 14 + i * step));

      const sealY = top + chars.length * step + 16;
      ctx.fillStyle = seg.tint;
      roundRect(ctx, sx - 5, sealY - 5, 10, 10, 2);
      ctx.fill();
    }
  }

  function markPath(kind, sx, sy, r) {
    ctx.beginPath();
    if (kind === 'event') {
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r, sy);
      ctx.lineTo(sx, sy + r);
      ctx.lineTo(sx - r, sy);
      ctx.closePath();
    } else if (kind === 'book') {
      ctx.rect(sx - r * 0.86, sy - r * 0.86, r * 1.72, r * 1.72);
    } else {
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
    }
  }

  function drawMarks(state) {
    for (const m of marks) {
      const sx = sxOf(m.x);
      if (sx < -30 || sx > viewW + 30) continue;
      const sy = syOf(m.y);
      const on = m.id === state.selectedId;
      const hot = m.id === state.hoverId;
      const r = on ? MARK_R_ON : hot ? MARK_R + 1.5 : MARK_R;

      ctx.strokeStyle = rgba(INK_SOFT, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy + r);
      ctx.lineTo(sx, syOf(m.anchorY));
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, r + 3.5, 0, Math.PI * 2);
      ctx.fillStyle = rgba(SILK_PALE, 0.9);
      ctx.fill();

      markPath(m.item.kind, sx, sy, r);
      ctx.fillStyle = KIND_COLOR[m.item.kind];
      ctx.fill();
      ctx.strokeStyle = on ? CINNABAR : rgba(INK, 0.55);
      ctx.lineWidth = on ? 2 : 1;
      ctx.stroke();

      if (on) {
        ctx.beginPath();
        ctx.arc(sx, sy, r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(CINNABAR, 0.7);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
  }

  function drawLabels(state) {
    ctx.font = '13px "Songti SC", "SimSun", serif';
    ctx.textBaseline = 'middle';
    const candidates = [];
    for (const m of marks) {
      const sx = sxOf(m.x);
      if (sx < 0 || sx > viewW) continue;
      const priority = m.id === state.selectedId ? 3 : m.id === state.hoverId ? 2 : 1;
      candidates.push({ id: m.id, text: m.item.name, sx, sy: syOf(m.y), priority });
    }
    labels = placeLabels(ctx, candidates, { width: viewW, height: viewH });
    for (const box of labels) {
      const on = box.id === state.selectedId;
      roundRect(ctx, box.x, box.y, box.w, box.h, 4);
      ctx.fillStyle = rgba(SILK_PALE, on ? 0.96 : 0.82);
      ctx.fill();
      if (on) {
        ctx.strokeStyle = rgba(CINNABAR, 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = on ? CINNABAR : INK;
      ctx.textAlign = 'left';
      ctx.fillText(box.text, box.x + 6, box.y + box.h / 2 + 0.5);
    }
  }

  function drawRuler() {
    ctx.font = '11px "Songti SC", "SimSun", serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (const tick of layout.ticks) {
      const sx = sxOf(tick.x);
      if (sx < -60 || sx > viewW + 60) continue;
      ctx.strokeStyle = rgba(INK_SOFT, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, viewH - 26);
      ctx.lineTo(sx, viewH - 8);
      ctx.stroke();
      ctx.fillStyle = rgba(INK, 0.72);
      const text = tick.year < 0 ? `前 ${-tick.year}` : `${tick.year}`;
      ctx.fillText(text, sx + 4, viewH - 12);
    }
  }

  /** 视口中心落在哪一段——题签高亮和 HUD 的「此刻在看」都用它。 */
  function centerSegment() {
    const wx = camera + viewW / scale / 2;
    return layout.segments.find((s) => wx >= s.x0 && wx < s.x1) ?? layout.segments[layout.segments.length - 1];
  }

  function draw(state = {}) {
    if (!viewW || !viewH) return;
    ctx.clearRect(0, 0, viewW, viewH);
    drawSilk();
    for (const layer of layout.layers) drawLayer(layer);
    drawMist();
    drawSegmentSeams();
    drawWater();
    drawCartouches(centerSegment().id);
    drawMarks(state);
    drawLabels(state);
    drawRuler();
  }

  /** 相机缓动。返回是否还在动，App 侧据此决定要不要继续重画。 */
  function step() {
    const dx = target - camera;
    if (Math.abs(dx) < 0.4) {
      camera = target;
      return false;
    }
    camera += dx * EASE;
    return true;
  }

  function setVisible(items) {
    const keep = new Set(items.map((it) => it.id));
    marks = layout.marks.filter((m) => keep.has(m.id));
  }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const box = labels.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    if (box) return box.id;
    let best = null;
    let bestD = HIT_R * HIT_R;
    for (const m of marks) {
      const dx = sxOf(m.x) - px;
      const dy = syOf(m.y) - py;
      const d = dx * dx + dy * dy;
      if (d <= bestD) {
        bestD = d;
        best = m.id;
      }
    }
    return best;
  }

  return {
    resize,
    draw,
    step,
    setVisible,
    hitTest,
    centerSegment,
    panBy(dxScreen) {
      target = camera - dxScreen / scale;
      camera = target;
      clamp();
    },
    panTo(worldX, { instant = false } = {}) {
      target = worldX - viewW / scale / 2;
      clamp();
      if (instant) camera = target;
    },
    scrollBy(dxWorld) {
      target += dxWorld;
      clamp();
    },
    get camera() {
      return camera;
    },
    get progress() {
      const max = maxCamera();
      return max <= 0 ? 0 : camera / max;
    },
    worldWidth: layout.width,
  };
}
