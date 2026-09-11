// 地形层：一张高度场 + 水域。水面永远在 y=0，高度为负就是水下，这样「哪里能盖楼」只需比较高度。
import { createNoise2D, clamp, lerp, smoothstep } from './random.js';

export const RES = 240; // 每边采样数，(RES+1)^2 个顶点
/** 高度场比城市范围大这么多倍：多出来的一圈被雾吃掉，视野里就不会看到地形的方形边界 */
export const FIELD_SCALE = 1.9;
const WATER_LEVEL = 0;


/** 沿折线的最近距离，用来把江河刻进高度场 */
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const ax = pts[i][0];
    const az = pts[i][1];
    const bx = pts[i + 1][0];
    const bz = pts[i + 1][1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}

/** 生成一条带弯曲的江：从一侧穿到另一侧，弯度由噪声控制 */
function makeRiver(noise, half, angle, bend, phase, samples = 26) {
  const pts = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const span = half * 2.6;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const along = (t - 0.5) * span;
    const off = (noise.fractal(t * 2.4 + phase, phase * 1.7, 3) - 0.5) * bend
      + Math.sin(t * Math.PI * 1.6 + phase) * bend * 0.7;
    pts.push([cos * along - sin * off, sin * along + cos * off]);
  }
  return pts;
}

export function createTerrain(options) {
  const {
    seed, size, style, relief, roughness, riverStrength, terraces = false,
  } = options;
  const half = size / 2; // 城市可建范围
  const fieldSize = size * FIELD_SCALE;
  const fieldHalf = fieldSize / 2;
  const noise = createNoise2D(`${seed}:terrain`);
  const step = fieldSize / RES;

  // 江河骨架。重庆是两江汇流，其余风格各自一条主水系。
  const rivers = [];
  const lakes = [];
  let sea = null;
  const riverAmount = clamp(riverStrength, 0, 1);

  if (riverAmount > 0.08) {
    if (style === 'mountain') {
      // 长江从西南进、嘉陵江从西北来，在东侧汇合成半岛
      rivers.push({ pts: makeRiver(noise, fieldHalf, 0.18, half * 0.42, 1.3), width: size * 0.075, depth: relief * 0.55 + 26 });
      rivers.push({ pts: makeRiver(noise, fieldHalf, -1.02, half * 0.3, 4.1), width: size * 0.055, depth: relief * 0.45 + 20 });
    } else if (style === 'delta') {
      rivers.push({ pts: makeRiver(noise, fieldHalf, 1.42, half * 0.62, 2.2), width: size * 0.1, depth: 26 });
    } else if (style === 'coast') {
      rivers.push({ pts: makeRiver(noise, fieldHalf, 0.4, half * 0.22, 5.5), width: size * 0.05, depth: 20 });
      sea = { angle: 0.32, offset: half * 0.34, depth: 30 };
    } else if (style === 'watertown') {
      rivers.push({ pts: makeRiver(noise, fieldHalf, 0.9, half * 0.34, 3.4), width: size * 0.035, depth: 12 });
      lakes.push({ x: -half * 0.42, z: -half * 0.3, r: size * 0.19, depth: 14 });
    } else {
      // 平原：一条护城河式的窄河
      rivers.push({ pts: makeRiver(noise, fieldHalf, 1.1, half * 0.18, 0.7), width: size * 0.028, depth: 10 });
    }
  }

  const heights = new Float32Array((RES + 1) * (RES + 1));
  const terraceStep = Math.max(8, relief * 0.13);

  for (let j = 0; j <= RES; j += 1) {
    const z = -fieldHalf + j * step;
    for (let i = 0; i <= RES; i += 1) {
      const x = -fieldHalf + i * step;
      const nx = (x / size) * 3.2;
      const nz = (z / size) * 3.2;


      let base;
      if (style === 'mountain') {
        // 山脊噪声堆出连续山梁，再叠一层缓丘，山城的骨架就是这两层
        const r = noise.ridge(nx * 1.35, nz * 1.35, 5);
        const rolling = noise.fractal(nx * 0.55, nz * 0.55, 3);
        base = (r * 0.82 + rolling * 0.28) ** 1.35;
      } else if (style === 'plain') {

        base = noise.fractal(nx * 0.7, nz * 0.7, 3) * 0.6 + 0.2;
      } else if (style === 'delta') {
        base = noise.fractal(nx * 0.5, nz * 0.5, 2) * 0.5 + 0.25;
      } else if (style === 'coast') {
        // along 越大越靠内陆，海在 along 为负的那一侧
        const along = Math.cos(0.32) * x + Math.sin(0.32) * z;
        const inland = smoothstep(-half * 0.55, half * 0.7, along);
        base = noise.fractal(nx * 0.95, nz * 0.95, 4) * 0.72 * inland + inland * 0.26;
      } else {

        // 水网湖区：大片低平 + 零星孤山（宝石山那种）
        const hills = Math.max(0, noise.ridge(nx * 1.5 + 4, nz * 1.5 + 4, 3) - 0.45) / 0.55;
        base = noise.fractal(nx * 0.7, nz * 0.7, 3) * 0.22 + hills * 0.85;
      }

      const detail = (noise.fractal(nx * 4.5, nz * 4.5, 3) - 0.5) * roughness * 0.32;
      let h = clamp(base + detail, 0, 1.4) * relief;

      if (terraces && relief > 30) {
        // 依山切台地：把高度量化出踏步感，再保留一点原始起伏
        const q = Math.round(h / terraceStep) * terraceStep;
        h = lerp(h, q, 0.4);

      }

      h += 4; // 岸线抬一点，免得平原风格整片贴着水面

      // 城市之外过渡成起伏的郊野。不能直接切断——地形网格之外还会接一圈背景板，
      // 两者必须在边界上高度一致，接缝才看不出来。
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const lowland = 5 + noise.fractal(nx * 1.1 + 9, nz * 1.1 + 9, 3) * 17;
      h = lerp(lowland, h, 1 - smoothstep(fieldHalf * 0.55, fieldHalf * 0.9, edge));





      // 刻江：河床压到水面以下，岸坡宽度决定是缓滩还是崖壁
      for (const river of rivers) {
        const w = river.width * (0.45 + riverAmount * 0.75) * 0.5;
        const d = distToPolyline(x, z, river.pts);
        const bank = style === 'mountain' ? w * 1.35 : w * 2.3;
        const t = smoothstep(w * 0.72, w + bank, d);
        h = lerp(-river.depth, h, t);
      }
      for (const lake of lakes) {
        const d = Math.hypot(x - lake.x, z - lake.z) - lake.r * (0.6 + riverAmount * 0.5);
        const t = smoothstep(0, lake.r * 0.42, d);
        h = lerp(-lake.depth, h, t);
      }
      if (sea) {
        const along = Math.cos(sea.angle) * x + Math.sin(sea.angle) * z;
        // -along 越大越往海里，t=1 就是深水区
        const t = smoothstep(sea.offset - size * 0.05, sea.offset + size * 0.12, -along);
        h = lerp(h, -sea.depth, t);
      }


      heights[j * (RES + 1) + i] = h;
    }
  }

  const heightAtIndex = (i, j) => heights[clamp(j, 0, RES) * (RES + 1) + clamp(i, 0, RES)];

  /** 双线性采样，渲染层和布局层都用它对齐 */
  const heightAt = (x, z) => {
    const fx = clamp((x + fieldHalf) / step, 0, RES);
    const fz = clamp((z + fieldHalf) / step, 0, RES);

    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = heightAtIndex(i, j);
    const h10 = heightAtIndex(i + 1, j);
    const h01 = heightAtIndex(i, j + 1);
    const h11 = heightAtIndex(i + 1, j + 1);
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  };

  /** 坡度（米/米）。陡坡上不放大楼，只放吊脚楼和挡墙 */
  const slopeAt = (x, z) => {
    const d = step;
    const dx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
    const dz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
    return Math.hypot(dx, dz);
  };

  const isWater = (x, z) => heightAt(x, z) < WATER_LEVEL + 0.6;

  /**
   * 把一条水巷刻进高度场。地形网格不刻开的话，河道水面只能浮在地表上，
   * 远看就是一条飘着的彩带；刻开之后水面才真的落在沟里。
   * 返回每个点被刻之前的地面高度，渲染层拿它定水面标高。
   */
  const carveChannel = (pts, width, depth) => {
    const before = pts.map(([x, z]) => heightAt(x, z));
    const rad = width / 2;
    const reach = rad + width * 0.7;
    const cuts = new Map();
    for (let s = 0; s < pts.length - 1; s += 1) {
      const [ax, az] = pts[s];
      const [bx, bz] = pts[s + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + fieldHalf) / step));
      const i1 = Math.min(RES, Math.ceil((Math.max(ax, bx) + reach + fieldHalf) / step));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + fieldHalf) / step));
      const j1 = Math.min(RES, Math.ceil((Math.max(az, bz) + reach + fieldHalf) / step));
      for (let j = j0; j <= j1; j += 1) {
        const z = -fieldHalf + j * step;
        for (let i = i0; i <= i1; i += 1) {
          const x = -fieldHalf + i * step;
          let t = ((x - ax) * dx + (z - az) * dz) / len2;
          t = clamp(t, 0, 1);
          const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
          if (d > reach) continue;
          const cut = depth * (1 - smoothstep(rad, reach, d));
          const idx = j * (RES + 1) + i;
          if (cut > (cuts.get(idx) ?? 0)) cuts.set(idx, cut);
        }
      }
    }
    for (const [idx, cut] of cuts) heights[idx] -= cut;
    return before;
  };


  let min = Infinity;
  let max = -Infinity;
  for (const h of heights) {
    if (h < min) min = h;
    if (h > max) max = h;
  }

  return {
    res: RES, size, half, fieldSize, fieldHalf, step, heights, heightAt, slopeAt, isWater, carveChannel,

    waterLevel: WATER_LEVEL, rivers, lakes, sea, style,
    minHeight: min, maxHeight: max, relief: max - Math.max(0, min),
  };

}
