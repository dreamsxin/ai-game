// 生成管线：地形 → 路网 → 占位图 → 大型构筑物占地 → 建筑 → 轻轨/桥/索道 → 统计。
// 顺序不能乱：楼要避开城墙和河道，轻轨要挑一栋已经存在的楼穿过去。
import { styleOf, kindTable } from './styles.js';
import { createTerrain } from './terrain.js';
import { buildRoads, rasterizeRoads } from './roads.js';

import { placeBuildings } from './buildings.js';
import { planFeatures, finishFeatures } from './features.js';
import { createNoise2D, createRandom, clamp } from './random.js';
import { DISTRICT_PRESETS } from './params.js';

/** 路不能画在江面上，所以把落水的点切掉，剩下的段各自成线 */
function clipLinesToLand(lines, terrain) {
  const out = [];
  for (const line of lines) {
    let run = [];
    for (const p of line.pts) {
      if (terrain.heightAt(p[0], p[1]) > 1.8) {
        run.push(p);
      } else {
        if (run.length >= 2) out.push({ pts: run, level: line.level });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ pts: run, level: line.level });
  }
  return out;
}

/** 分区预设覆盖三个滑块，并把比例归一化 */
export function resolveZones(params) {
  const preset = DISTRICT_PRESETS[params.districtPreset];
  const c = preset ? preset.commercial : params.commercial;
  const r = preset ? preset.residential : params.residential;
  const i = preset ? preset.industrial : params.industrial;
  const total = c + r + i || 1;
  return { commercial: c / total, residential: r / total, industrial: i / total };
}

export function generateCity(rawParams) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const style = styleOf(rawParams.style);
  const zones = resolveZones(rawParams);
  const params = { ...rawParams, ...zones };
  const seed = `${params.seed}|${style.id}`;
  const size = clamp(params.citySize, 600, 3000);

  const terrain = createTerrain({
    seed,
    size,
    style: params.terrainStyle,
    relief: Math.max(2, params.terrainRelief),
    roughness: params.terrainRoughness,
    riverStrength: params.riverStrength,
    terraces: style.terrain.terraces && params.terrainStyle === 'mountain',
  });

  // 水巷、城墙、立交要先定下来：水巷会把河道刻进地形，路网和建筑必须看到刻过之后的地形
  const noise = createNoise2D(`${seed}:features`);
  const plan = planFeatures({ seed, style, params, terrain, noise });

  const { lines, widths, spacing } = buildRoads({
    seed, terrain, size, pattern: params.streetPattern, blockSize: params.blockSize,
  });
  const roadLines = clipLinesToLand(lines, terrain);
  const raster = rasterizeRoads(roadLines, size, widths);
  plan.stampBlockers(raster);


  const { buildings, props } = placeBuildings({
    seed, style, params, terrain, roadLines, raster, widths, spacing,
  });

  const finish = finishFeatures({ seed, style, params, terrain, buildings });


  // 街灯与行道树：贴着干道放，夜景全靠它们把路网点出来
  if (params.showProps) {
    const rand = createRandom(`${seed}:props`);
    for (const line of roadLines) {
      if (line.level < 2) continue;
      const offset = widths[line.level] / 2 + 2.5;

      for (let i = 0; i < line.pts.length - 1; i += 1) {
        const [ax, az] = line.pts[i];
        const [bx, bz] = line.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const count = Math.floor(len / 34);
        const rot = Math.atan2(bz - az, bx - ax);
        const nx = -Math.sin(rot);
        const nz = Math.cos(rot);
        for (let k = 0; k < count; k += 1) {
          const t = (k + 0.5) / Math.max(1, count);
          const side = k % 2 === 0 ? 1 : -1;
          const x = ax + (bx - ax) * t + nx * offset * side;
          const z = az + (bz - az) * t + nz * offset * side;
          const h = terrain.heightAt(x, z);
          if (h < 2) continue;
          props.lamps.push({ x, z, y: h, rot });
          if (rand.chance(0.45)) {
            props.trees.push({ x: x + nx * side * 3, z: z + nz * side * 3, y: h, s: rand.range(0.6, 1.1) });
          }
        }
      }
    }
  }

  let maxTop = 0;
  let floors = 0;
  for (const b of buildings) {
    floors += b.floors;
    const top = b.base + b.plinth + b.height;
    if (top > maxTop) maxTop = top;
  }
  const tallest = buildings.reduce((acc, b) => (b.height > acc ? b.height : acc), 0);

  const stats = {
    buildings: buildings.length,
    floors,
    tallest: Math.round(tallest),
    highestPoint: Math.round(maxTop),
    relief: Math.round(terrain.relief),
    population: Math.round(floors * 26),
    roadKm: Math.round(roadLines.reduce((sum, line) => {
      let d = 0;
      for (let i = 0; i < line.pts.length - 1; i += 1) {
        d += Math.hypot(line.pts[i + 1][0] - line.pts[i][0], line.pts[i + 1][1] - line.pts[i][1]);
      }
      return sum + d;
    }, 0) / 100) / 10,
    interchanges: plan.interchanges.length,
    interchangeLevels: plan.interchanges.reduce((m, ic) => Math.max(m, ic.levels), 0),
    bridges: finish.bridges.length,
    cableCars: finish.cableCars.length,
    viaducts: finish.viaducts.length,
    monorailPierced: finish.monorails.filter((m) => m && m.station).length,
    genMs: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0),
  };

  return {
    style, params, seed, size, terrain, roadLines, raster, widths, spacing,

    buildings, props,
    interchanges: plan.interchanges,
    wall: plan.wall,
    canals: plan.canals,
    stairs: plan.stairs,
    monorails: finish.monorails.filter(Boolean),
    bridges: finish.bridges,
    cableCars: finish.cableCars,
    viaducts: finish.viaducts,
    kinds: kindTable(style),
    stats,
  };
}
