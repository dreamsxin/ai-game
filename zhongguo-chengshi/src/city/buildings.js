// 建筑层：沿街面排楼。逐条道路走一遍，两侧退线后落地块，这样弯路上的楼会跟着路转向，
// 山地上的楼会自动长出高低不等的基座——「依山而建」就是从这里来的。
import { CELL } from './roads.js';
import { KINDS, kindTable } from './styles.js';
import { createRandom, createNoise2D, clamp, lerp, smoothstep } from './random.js';


export const ZONE_COMMERCIAL = 'commercial';
export const ZONE_RESIDENTIAL = 'residential';
export const ZONE_INDUSTRIAL = 'industrial';
export const ZONE_PARK = 'park';

const ZONE_HEIGHT_MUL = {
  [ZONE_COMMERCIAL]: 1.45,
  [ZONE_RESIDENTIAL]: 0.92,
  [ZONE_INDUSTRIAL]: 0.34,
  [ZONE_PARK]: 0,
};

/** 每种形态的进深与开间倾向，单位米 */
const KIND_LOT = {
  [KINDS.glassTower]: { w: [34, 58], d: [34, 54] },
  [KINDS.podiumTower]: { w: [46, 78], d: [40, 62] },
  [KINDS.crown]: { w: [40, 66], d: [40, 62] },
  [KINDS.slab]: { w: [46, 92], d: [15, 22] },
  [KINDS.tile]: { w: [24, 44], d: [16, 26] },
  [KINDS.stilt]: { w: [26, 52], d: [14, 24] },
  [KINDS.courtyard]: { w: [40, 66], d: [34, 54] },
  [KINDS.hall]: { w: [34, 56], d: [22, 34] },
  [KINDS.pagoda]: { w: [22, 30], d: [22, 30] },
  [KINDS.waterHouse]: { w: [14, 26], d: [12, 20] },
  [KINDS.factory]: { w: [56, 104], d: [36, 62] },
};

export function placeBuildings({ seed, style, params, terrain, roadLines, raster, widths, spacing }) {

  const rand = createRandom(`${seed}:buildings`);
  const noise = createNoise2D(`${seed}:zones`);
  const { mask, cols, half } = raster;
  const claim = new Uint8Array(cols * cols);
  const table = kindTable(style);
  const floorHeight = style.skyline.floorHeight;
  const buildings = [];
  const props = { trees: [], lamps: [], signs: [] };

  const toCol = (v) => Math.round((v + half) / CELL - 0.5);
  const cellFree = (gx, gz) => {
    if (gx < 0 || gz < 0 || gx >= cols || gz >= cols) return false;
    const idx = gz * cols + gx;
    return mask[idx] === 0 && claim[idx] === 0;
  };

  /** 检查矩形足迹（已按 rot 旋转）是否可用，同时取回四角地形高度 */
  const footprint = (cx, cz, w, d, rot) => {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const hw = w / 2;
    const hd = d / 2;
    let minH = Infinity;
    let maxH = -Infinity;
    const stepsU = Math.max(2, Math.ceil(w / CELL));
    const stepsV = Math.max(2, Math.ceil(d / CELL));
    const cells = [];
    for (let iv = 0; iv <= stepsV; iv += 1) {
      const v = -hd + (d * iv) / stepsV;
      for (let iu = 0; iu <= stepsU; iu += 1) {
        const u = -hw + (w * iu) / stepsU;
        const x = cx + u * cos - v * sin;
        const z = cz + u * sin + v * cos;
        const gx = toCol(x);
        const gz = toCol(z);
        if (!cellFree(gx, gz)) return null;
        const h = terrain.heightAt(x, z);
        if (h < 1.2) return null; // 落水里
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
        cells.push(gz * cols + gx);
      }
    }
    return { minH, maxH, cells };
  };

  const zoneAt = (x, z) => {
    const dist = Math.hypot(x, z) / half;
    const core = 1 - smoothstep(0.05, 0.72, dist);
    const n = noise.fractal(x * 0.0016 + 5, z * 0.0016 + 5, 3);
    const wCom = params.commercial * (0.25 + core * 2.1) * (0.6 + n * 0.8);
    const wRes = params.residential * (0.7 + (1 - core) * 0.7) * (0.6 + (1 - n) * 0.8);
    const wInd = params.industrial * (0.15 + smoothstep(0.45, 1.05, dist) * 2.4) * (0.5 + n * 1.0);
    const wPark = params.parksPercent * 2.4 * (0.4 + (1 - Math.abs(n - 0.5) * 2) * 1.2);
    return rand.weighted(
      [ZONE_COMMERCIAL, ZONE_RESIDENTIAL, ZONE_INDUSTRIAL, ZONE_PARK],
      [wCom, wRes, wInd, wPark],
    );
  };

  const pickKind = (zone, core) => {
    if (zone === ZONE_INDUSTRIAL) {
      return rand.chance(0.75) ? KINDS.factory : KINDS.slab;
    }
    let kind = rand.weighted(table.list, table.weights);
    // 市中心不该出现厂房，郊区也不该扎堆玻璃塔
    if (zone === ZONE_COMMERCIAL && kind === KINDS.factory) kind = KINDS.podiumTower;
    if (core < 0.35 && (kind === KINDS.crown || kind === KINDS.glassTower) && rand.chance(0.7)) {
      kind = style.id === 'hangzhou' ? KINDS.waterHouse : KINDS.slab;
    }
    if (kind === KINDS.pagoda && rand.chance(0.7)) kind = KINDS.hall;
    return kind;
  };

  const heightFor = (zone, kind, core, slope) => {
    if (zone === ZONE_PARK) return 0;
    const spread = 1 + (rand.bell() - 0.5) * 2.6 * params.heightVariance;
    let h = params.avgHeight * (0.4 + core * 1.5) * ZONE_HEIGHT_MUL[zone] * spread;
    if (kind === KINDS.courtyard || kind === KINDS.waterHouse) h = Math.min(h, floorHeight * 2.4);
    if (kind === KINDS.hall) h = Math.min(h, floorHeight * 3.2);
    if (kind === KINDS.factory) h = clamp(h, floorHeight, floorHeight * 4);
    if (kind === KINDS.pagoda) h = Math.max(h, style.skyline.landmarkHeight * 0.5);
    if (kind === KINDS.tile) h = Math.min(h, floorHeight * 12);
    // 陡坡上不放超高层，改成中等体量，视觉上更像真实山地城市
    if (slope > 0.5) h = Math.min(h, floorHeight * 14);
    const floors = Math.max(1, Math.round(h / floorHeight));
    return floors * floorHeight;
  };

  // 干道优先，让主街先占到好地块
  const ordered = [...roadLines].sort((a, b) => b.level - a.level);
  const gap = lerp(18, 2, clamp(params.density, 0, 1));

  // 进深不能超过「街区半宽减掉退线」，否则楼会一路顶到对面那条街上，判定必废
  const maxDepth = Math.max(11, spacing * 0.28);
  const maxWidth = Math.max(14, spacing * 0.62);


  for (const line of ordered) {
    const setback = widths[line.level] / 2 + lerp(8, 2.5, params.density);
    for (let i = 0; i < line.pts.length - 1; i += 1) {
      const [ax, az] = line.pts[i];
      const [bx, bz] = line.pts[i + 1];
      const segLen = Math.hypot(bx - ax, bz - az);
      if (segLen < 6) continue;
      const rot = Math.atan2(bz - az, bx - ax);
      const nx = -Math.sin(rot);
      const nz = Math.cos(rot);
      let travelled = rand.range(0, 16);

      while (travelled < segLen) {
        const t = travelled / segLen;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const core = 1 - smoothstep(0.05, 0.72, Math.hypot(px, pz) / half);
        // 步进必须至少等于已放下的最宽那栋楼，否则下一栋一定压在它身上、全被判废
        let stride = 0;


        for (const side of [1, -1]) {
          if (!rand.chance(clamp(params.density * 1.2, 0.24, 1))) continue;
          // 一侧最多排两排：临街一排 + 街区内部一排，后者就是院落深处和小区里那些楼
          let offset = setback;
          for (let row = 0; row < 2; row += 1) {
            const zone = zoneAt(px + nx * side * (offset + 30), pz + nz * side * (offset + 30));
            const kind = pickKind(zone, core);
            const lot = KIND_LOT[kind] ?? KIND_LOT[KINDS.tile];
            const w0 = Math.min(rand.range(lot.w[0], lot.w[1]) * lerp(0.82, 1.08, params.density), maxWidth);
            const d0 = Math.min(rand.range(lot.d[0], lot.d[1]), maxDepth);

            // 放不下就缩一档再试，这样窄地块也能被填上，不至于整条街空着
            let fp = null;
            let w = w0;
            let d = d0;
            let cx = 0;
            let cz = 0;
            for (let attempt = 0; attempt < 4; attempt += 1) {
              const shrink = 1 - attempt * 0.18;
              w = w0 * shrink;
              d = d0 * shrink;
              cx = px + nx * side * (offset + d / 2);
              cz = pz + nz * side * (offset + d / 2);
              if (Math.abs(cx) > half - 12 || Math.abs(cz) > half - 12) break;
              fp = footprint(cx, cz, w, d, rot);
              if (fp) break;
            }
            if (!fp) break;
            offset += d + lerp(11, 4, params.density);
            stride = Math.max(stride, w);
            const slope = (fp.maxH - fp.minH) / Math.max(w, d);
            for (const idx of fp.cells) claim[idx] = 1;

            if (zone === ZONE_PARK) {
              const trees = Math.max(2, Math.round((w * d) / 260));
              for (let k = 0; k < trees; k += 1) {
                const tx = cx + rand.range(-w / 2, w / 2) * 0.85;
                const tz = cz + rand.range(-d / 2, d / 2) * 0.85;
                props.trees.push({ x: tx, z: tz, y: terrain.heightAt(tx, tz), s: rand.range(0.7, 1.5) });
              }
              continue;
            }

            const height = heightFor(zone, kind, core, slope);
            if (height <= 0) continue;
            buildings.push({
              x: cx, z: cz, w, d, rot, kind, zone, height,
              floors: Math.max(1, Math.round(height / floorHeight)),
              base: fp.minH, // 基座坐在最低角，高差用 plinth 补
              plinth: fp.maxH - fp.minH,
              color: rand.int(0, style.palette.buildings.length - 1),
              lit: rand.next(),
              landmark: false,
              core,
              row,
            });
          }
        }

        travelled += (stride > 0 ? stride : 14) + gap;
      }

    }
  }

  // 地标：从核心区最高的几栋里挑出来拔高，保证每座城市都有可辨认的制高点
  const landmarkKind = style.id === 'xian' ? KINDS.pagoda
    : style.id === 'hangzhou' ? KINDS.pagoda
      : style.id === 'shenzhen' ? KINDS.crown : KINDS.glassTower;
  const candidates = buildings
    .filter((b) => b.core > 0.45 && b.zone !== ZONE_INDUSTRIAL)
    .sort((a, b) => b.core - a.core);
  const wanted = Math.round(style.skyline.landmarks * clamp(params.landmarkBoost, 0, 2));
  let placed = 0;
  for (let i = 0; i < candidates.length && placed < wanted; i += 8) {
    const b = candidates[i];
    const factor = 1 - placed * 0.16;
    b.height = style.skyline.landmarkHeight * clamp(params.landmarkBoost, 0.05, 2) * factor;
    b.floors = Math.max(1, Math.round(b.height / floorHeight));
    b.kind = landmarkKind;
    b.landmark = true;
    if (landmarkKind === KINDS.pagoda) {
      b.w = Math.min(b.w, 34);
      b.d = Math.min(b.d, 34);
    } else {
      b.w = Math.max(b.w, 44);
      b.d = Math.max(b.d, 44);
    }
    placed += 1;
  }

  return { buildings, props, claim };
}
