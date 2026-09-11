// 路网层：先生成中心线折线，再栅格化成一张占位图。街区就是占位图上剩下的连通空地。
import { createNoise2D, clamp } from './random.js';

export const ROAD_TRUNK = 3;
export const ROAD_STREET = 2;
export const ROAD_LANE = 1;

/**
 * 路宽跟着街区尺度走：水乡的巷子只有几米宽，超级街区的主干道要三十多米。
 * 如果写成固定值，小街区风格会被路面吃光，大街区风格又会显得路太细。
 */
export function roadWidths(spacing) {
  return {
    [ROAD_TRUNK]: clamp(spacing * 0.2, 15, 34),
    [ROAD_STREET]: clamp(spacing * 0.13, 9, 20),
    [ROAD_LANE]: clamp(spacing * 0.085, 5.5, 12),
  };
}

/** 栅格分辨率：一格 4 米，够分辨最窄的巷子 */
export const CELL = 4;


function pushLine(lines, pts, level) {
  if (pts.length >= 2) lines.push({ pts, level });
}

/** 棋盘路网：西安里坊、深圳超级街区都从这里出发，只是间距不同 */
function gridRoads(half, spacing, trunkEvery, warp, noise) {
  const lines = [];
  const count = Math.ceil((half * 2) / spacing);
  const start = -half - spacing * 0.5;
  for (let k = 0; k <= count + 1; k += 1) {
    const base = start + k * spacing;
    const level = k % trunkEvery === 0 ? ROAD_TRUNK : (k % 2 === 0 ? ROAD_STREET : ROAD_LANE);
    const vertical = [];
    const horizontal = [];
    const steps = 14;
    for (let s = 0; s <= steps; s += 1) {
      const t = -half - 40 + ((half * 2 + 80) * s) / steps;
      const wv = warp ? (noise.fractal(base * 0.004 + 7, t * 0.004, 2) - 0.5) * warp : 0;
      const wh = warp ? (noise.fractal(t * 0.004, base * 0.004 + 3, 2) - 0.5) * warp : 0;
      vertical.push([base + wv, t]);
      horizontal.push([t, base + wh]);
    }
    pushLine(lines, vertical, level);
    pushLine(lines, horizontal, level);
  }
  return lines;
}

/** 环形放射：陆家嘴那种内环 + 放射干道 */
function radialRoads(half, spacing, noise) {
  const lines = [];
  const rings = Math.max(3, Math.round((half * 1.05) / spacing));
  for (let r = 1; r <= rings; r += 1) {
    const radius = (half * 1.08 * r) / rings;
    const pts = [];
    const steps = 56;
    for (let s = 0; s <= steps; s += 1) {
      const a = (s / steps) * Math.PI * 2;
      const wobble = 1 + (noise.fractal(Math.cos(a) * 1.4 + r, Math.sin(a) * 1.4, 2) - 0.5) * 0.16;
      pts.push([Math.cos(a) * radius * wobble, Math.sin(a) * radius * wobble]);
    }
    pushLine(lines, pts, r % 2 === 1 ? ROAD_TRUNK : ROAD_STREET);
  }
  const spokes = 12;
  for (let s = 0; s < spokes; s += 1) {
    const a = (s / spokes) * Math.PI * 2 + 0.2;
    const pts = [];
    for (let k = 0; k <= 10; k += 1) {
      const rr = (half * 1.15 * k) / 10;
      const bend = (noise.fractal(k * 0.4 + s, s * 0.7, 2) - 0.5) * 0.12;
      pts.push([Math.cos(a + bend) * rr, Math.sin(a + bend) * rr]);
    }
    pushLine(lines, pts, s % 3 === 0 ? ROAD_TRUNK : ROAD_STREET);
  }
  // 外圈补一层次干道网格，免得远处大片空白
  for (const line of gridRoads(half, spacing * 1.6, 99, spacing * 0.3, noise)) {
    line.level = ROAD_LANE;
    lines.push(line);
  }
  return lines;
}

/**
 * 沿等高线走的盘山路。重庆和任何高差大的地形都用它：
 * 每步都取梯度的垂直方向，于是路自然绕着山腰走，再补几条垂直爬坡路。
 */
function contourRoads(terrain, half, spacing, noise) {
  const lines = [];
  const stepLen = 22;
  const maxSteps = Math.round((half * 2) / stepLen * 1.3);


  const walk = (sx, sz, sign) => {
    const pts = [[sx, sz]];
    let x = sx;
    let z = sz;
    let dirX = 0;
    let dirZ = 0;
    for (let i = 0; i < maxSteps; i += 1) {
      const d = 6;

      const gx = (terrain.heightAt(x + d, z) - terrain.heightAt(x - d, z)) / (2 * d);
      const gz = (terrain.heightAt(x, z + d) - terrain.heightAt(x, z - d)) / (2 * d);
      let tx = -gz * sign;
      let tz = gx * sign;
      const len = Math.hypot(tx, tz);
      if (len < 1e-4) {
        // 平地上梯度失效，改用噪声给一个连续方向
        const a = noise.fractal(x * 0.002, z * 0.002, 2) * Math.PI * 2;
        tx = Math.cos(a);
        tz = Math.sin(a);
      } else {
        tx /= len;
        tz /= len;
      }
      if (i > 0 && tx * dirX + tz * dirZ < 0) {
        tx = -tx;
        tz = -tz;
      }
      dirX = tx;
      dirZ = tz;
      x += tx * stepLen;
      z += tz * stepLen;
      if (Math.abs(x) > half + 30 || Math.abs(z) > half + 30) break;
      if (terrain.heightAt(x, z) < 1.5) break; // 走到水里就收尾
      pts.push([x, z]);
    }
    return pts;
  };

  // 在不同高程带上撒起点，保证山顶山脚都有路。条数按「等效棋盘路网」估，免得盘山路把整座山铺满
  const seeds = [];
  const tries = clamp(Math.round(((half * 2) / spacing) * 2.4), 10, 52);


  for (let i = 0; i < tries; i += 1) {
    const a = (i / tries) * Math.PI * 2 * 3.7;
    const rr = half * (0.12 + 0.85 * ((i * 0.37) % 1));
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (terrain.heightAt(x, z) < 2) continue;
    seeds.push([x, z]);
  }

  for (let i = 0; i < seeds.length; i += 1) {
    const [sx, sz] = seeds[i];
    const forward = walk(sx, sz, 1);
    const backward = walk(sx, sz, -1);
    const pts = backward.slice(1).reverse().concat(forward);
    pushLine(lines, pts, i % 4 === 0 ? ROAD_TRUNK : ROAD_STREET);
  }

  // 爬坡路：顺着梯度直上直下，就是山城那些「垂直街道」
  const climbs = clamp(Math.round(((half * 2) / spacing) * 1.8), 8, 36);


  for (let i = 0; i < climbs; i += 1) {
    const a = (i / climbs) * Math.PI * 2 + 0.4;

    let x = Math.cos(a) * half * 0.16;
    let z = Math.sin(a) * half * 0.16;
    const pts = [[x, z]];
    for (let k = 0; k < 90; k += 1) {
      const d = 6;
      const gx = (terrain.heightAt(x + d, z) - terrain.heightAt(x - d, z)) / (2 * d);
      const gz = (terrain.heightAt(x, z + d) - terrain.heightAt(x, z - d)) / (2 * d);
      const len = Math.hypot(gx, gz) || 1;
      x -= (gx / len) * stepLen;
      z -= (gz / len) * stepLen;
      if (Math.abs(x) > half + 20 || Math.abs(z) > half + 20) break;
      if (terrain.heightAt(x, z) < 1.5) break;
      pts.push([x, z]);
    }
    pushLine(lines, pts, ROAD_LANE);
  }
  return lines;
}

export function buildRoads({ seed, terrain, size, pattern, blockSize }) {
  const half = size / 2;
  const noise = createNoise2D(`${seed}:roads`);
  const spacing = clamp(blockSize, 0.2, 1.2) * 190;
  const widths = roadWidths(spacing);

  let lines;
  if (pattern === 'grid') {
    lines = gridRoads(half, spacing, 4, spacing * 0.06, noise);
  } else if (pattern === 'superblock') {
    // 主干道拉大间距，再补一层内部支路，否则超级街区内部会空成停车场
    lines = gridRoads(half, spacing * 1.8, 3, spacing * 0.1, noise);
    for (const line of gridRoads(half, spacing * 0.9, 99, spacing * 0.14, noise)) {
      line.level = ROAD_LANE;
      lines.push(line);
    }
  } else if (pattern === 'radial') {
    lines = radialRoads(half, spacing, noise);
  } else if (terrain.relief > 45) {
    lines = contourRoads(terrain, half, spacing, noise);
  } else {
    lines = gridRoads(half, spacing, 4, spacing * 0.75, noise);
  }

  return { lines, spacing, widths, half, noise };
}

/**
 * 把折线画进占位图。按「格心到线段的真实距离」判定，不做整格近似——
 * 否则窄巷会被膨胀成大马路，沿街退线全部落在路面上，楼就一栋也放不下。
 */
export function rasterizeRoads(lines, size, widths) {
  const cols = Math.ceil(size / CELL);
  const half = size / 2;
  const mask = new Uint8Array(cols * cols);
  const toCol = (v) => Math.floor((v + half) / CELL);
  const cellCenter = (c) => -half + (c + 0.5) * CELL;

  for (const line of lines) {
    const radius = widths[line.level] / 2;
    for (let i = 0; i < line.pts.length - 1; i += 1) {
      const [ax, az] = line.pts[i];
      const [bx, bz] = line.pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const gx0 = Math.max(0, toCol(Math.min(ax, bx) - radius - CELL));
      const gx1 = Math.min(cols - 1, toCol(Math.max(ax, bx) + radius + CELL));
      const gz0 = Math.max(0, toCol(Math.min(az, bz) - radius - CELL));
      const gz1 = Math.min(cols - 1, toCol(Math.max(az, bz) + radius + CELL));
      for (let gz = gz0; gz <= gz1; gz += 1) {
        const pz = cellCenter(gz);
        for (let gx = gx0; gx <= gx1; gx += 1) {
          const px = cellCenter(gx);
          let t = ((px - ax) * dx + (pz - az) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t;
          const qz = az + dz * t;
          if ((px - qx) ** 2 + (pz - qz) ** 2 > radius * radius) continue;
          const idx = gz * cols + gx;
          if (mask[idx] < line.level) mask[idx] = line.level;
        }
      }
    }
  }
  return { mask, cols, cell: CELL, half };
}

