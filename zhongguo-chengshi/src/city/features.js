// 特色构筑物层：层叠立交、轻轨穿楼、过江索道、跨江大桥、古城墙、水巷、山城步道。
// 这一层是「一眼认出是哪座城市」的关键，所以每种构筑物都按风格强度单独开关。
import { createRandom, clamp, lerp } from './random.js';
import { KINDS } from './styles.js';


/** 在地形上找一块够平、够高、离水远的地，用来放立交这种大占地构筑物 */
function findFlatSpot(terrain, rand, minRadius, taken = [], tries = 120) {
  let best = null;
  for (let i = 0; i < tries; i += 1) {
    const x = rand.range(-terrain.half * 0.66, terrain.half * 0.66);
    const z = rand.range(-terrain.half * 0.66, terrain.half * 0.66);
    const h = terrain.heightAt(x, z);
    if (h < 4) continue;
    let spread = 0;
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      spread = Math.max(spread, Math.abs(terrain.heightAt(x + Math.cos(a) * minRadius, z + Math.sin(a) * minRadius) - h));
    }
    // 已有立交附近重罚，几座立交才不会挤成一团
    let crowd = 0;
    for (const p of taken) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < minRadius * 4) crowd += (minRadius * 4 - d) * 0.6;
    }
    const score = -spread - crowd - (Math.hypot(x, z) / terrain.half) * 18;
    if (!best || score > best.score) best = { x, z, y: h, score };
  }
  return best;
}


/**
 * 层叠立交：底下两条正交主线，上面层层叠加的定向匝道和环形匝道。
 * 关键是主线只有两条——真实立交是「两条路交叉 + 一堆匝道」，
 * 每层都放一条直桥会变成放射星形，一看就假。
 */
function makeInterchange(spot, levels, rand, baseAngle) {
  const ramps = [];
  const pillars = [];
  const gapY = 10.5;
  const y0 = spot.y + 8.5;

  const addPillars = (pts, width) => {
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      pillars.push({ x: p[0], z: p[2], top: p[1] - 1.2, r: width * 0.16 });
    }
  };

  /** 一条主线：中段略微起拱，两端落坡 */
  const deck = (angle, y, width, len) => {
    const pts = [];
    const steps = 20;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps - 0.5;
      pts.push([
        spot.x + Math.cos(angle) * len * t,
        y + Math.cos(t * Math.PI) * 2.2,
        spot.z + Math.sin(angle) * len * t,
      ]);
    }
    ramps.push({ pts, width, kind: 'deck' });
    addPillars(pts, width);
  };

  /** 匝道：绕着一个偏心圆心转一段弧，同时爬升，出入口切向主线 */
  const ramp = (cx, cz, radius, a0, sweep, yFrom, yTo, width) => {
    const pts = [];
    const steps = 24;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const a = a0 + sweep * t;
      pts.push([cx + Math.cos(a) * radius, yFrom + (yTo - yFrom) * t, cz + Math.sin(a) * radius]);
    }
    ramps.push({ pts, width, kind: 'ramp' });
    addPillars(pts, width);
  };

  const mainLen = rand.range(300, 400);
  deck(baseAngle, y0, 17, mainLen);
  deck(baseAngle + Math.PI / 2, y0 + gapY, 16, mainLen * rand.range(0.85, 1.05));

  // 四个象限各挂一条定向匝道，把两条主线连起来
  const quadR = rand.range(52, 74);
  for (let q = 0; q < 4; q += 1) {
    const a = baseAngle + Math.PI / 4 + (q * Math.PI) / 2;
    const cx = spot.x + Math.cos(a) * quadR * 1.35;
    const cz = spot.z + Math.sin(a) * quadR * 1.35;
    const dir = q % 2 === 0 ? 1 : -1;
    ramp(cx, cz, quadR, a + Math.PI + (dir > 0 ? -0.9 : 0.9), dir * 2.0, y0 + 1, y0 + gapY - 1, 9.5);
  }

  // 第三层往上：大半径的高架环，一层比一层高，这是「层叠」的观感来源
  for (let k = 2; k < levels; k += 1) {
    const y = y0 + k * gapY;
    const radius = rand.range(78, 104) + k * 9;
    const a0 = baseAngle + k * 1.7;
    ramp(spot.x, spot.z, radius, a0, Math.PI * rand.range(1.2, 1.8), y - gapY * 0.45, y + gapY * 0.35, 11 - k * 0.6);
    // 再补一条反向的小环，层与层之间才有交织感
    ramp(
      spot.x + Math.cos(a0 + 1) * radius * 0.45, spot.z + Math.sin(a0 + 1) * radius * 0.45,
      radius * 0.42, a0 + 3.2, -Math.PI * 1.4, y + gapY * 0.3, y - gapY * 0.5, 9,
    );
  }

  return { x: spot.x, z: spot.z, y: y0, levels, ramps, pillars };
}

/** 轻轨：一条直线穿城，中途挑一栋楼从中间穿过去，站台就架在楼里 */

function makeMonorail(terrain, buildings, rand, index) {
  // 优先挑核心区一栋够高够宽的板楼，李子坝就是这么来的
  const target = buildings
    .filter((b) => b.height > 34 && b.w > 26 && b.core > 0.3 && !b.landmark
      && (b.kind === KINDS.slab || b.kind === KINDS.tile || b.kind === KINDS.podiumTower))
    .sort((a, b) => b.core - a.core)[index] ?? null;

  const angle = target ? target.rot : rand.range(0, Math.PI);
  const ox = target ? target.x : 0;
  const oz = target ? target.z : 0;
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const reach = terrain.half * 1.05;

  // 站台层：从 4 层左右穿过，既能看见车又不至于贴地
  const stationFloor = clamp(Math.floor(target ? target.floors * 0.42 : 5), 3, 9);
  const floorH = target ? target.height / target.floors : 3.2;
  const holeBottom = (target ? target.base : terrain.heightAt(ox, oz)) + stationFloor * floorH;
  const holeHeight = Math.max(9.5, floorH * 2.6);
  const railY = holeBottom + holeHeight * 0.42;

  const pts = [];
  const steps = 40;
  for (let s = 0; s <= steps; s += 1) {
    const t = (s / steps - 0.5) * 2;
    const x = ox + dirX * reach * t;
    const z = oz + dirZ * reach * t;
    // 轨道尽量维持一个恒定标高，只在地形太高的地方抬一点，于是山谷处自然变成高架
    const ground = terrain.heightAt(x, z);
    const y = Math.max(railY, ground + 11);
    pts.push([x, y, z]);
  }
  // 抹平轨道纵坡
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 1; i < pts.length - 1; i += 1) {
      pts[i][1] = (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4;
    }
  }

  const pillars = [];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const p = pts[i];
    const ground = terrain.heightAt(p[0], p[2]);
    if (p[1] - ground < 6) continue;
    if (target && Math.hypot(p[0] - target.x, p[2] - target.z) < Math.max(target.w, target.d) * 0.8) continue;
    pillars.push({ x: p[0], z: p[2], top: p[1] - 1.6, ground, r: 1.9 });
  }

  const station = target
    ? {
      x: target.x, z: target.z, rot: target.rot,
      w: Math.max(target.w * 1.16, 30), d: Math.max(target.d * 1.5, 22),
      y: holeBottom, height: holeHeight,
    }
    : null;

  if (target) {
    // 让渲染层把这栋楼拆成上下两段，中间留出轨道穿过的洞
    target.pierced = { y: holeBottom, height: holeHeight };
  }

  return { pts, pillars, station, target, railY };
}

/** 从水面上一点朝两侧推进，直到两边都上岸，得到一段跨水桥位 */
function spanWater(terrain, cx, cz, dirX, dirZ) {
  const march = (sign) => {
    let dist = 0;
    let lastWater = 0;
    for (let s = 0; s < 260; s += 1) {
      dist = s * 6;
      const x = cx + dirX * dist * sign;
      const z = cz + dirZ * dist * sign;
      if (Math.abs(x) > terrain.half || Math.abs(z) > terrain.half) return null;
      const h = terrain.heightAt(x, z);
      if (h < 2.5) lastWater = dist;
      else if (dist - lastWater > 34) return { dist: lastWater + 34, x, z, h };
    }
    return null;
  };
  const a = march(-1);
  const b = march(1);
  if (!a || !b) return null;
  return { a, b };
}

function makeBridge(terrain, rand, river, t, type) {
  const idx = clamp(Math.round(t * (river.pts.length - 1)), 1, river.pts.length - 2);
  const [cx, cz] = river.pts[idx];
  const [px, pz] = river.pts[idx - 1];
  const [nx2, nz2] = river.pts[idx + 1];
  const tx = nx2 - px;
  const tz = nz2 - pz;
  const len = Math.hypot(tx, tz) || 1;
  const dirX = -tz / len;
  const dirZ = tx / len;
  const span = spanWater(terrain, cx, cz, dirX, dirZ);
  if (!span) return null;

  const ax = cx - dirX * span.a.dist;
  const az = cz - dirZ * span.a.dist;
  const bx = cx + dirX * span.b.dist;
  const bz = cz + dirZ * span.b.dist;
  const total = Math.hypot(bx - ax, bz - az);
  if (total < 60) return null;

  const hA = Math.max(terrain.heightAt(ax, az), 3);
  const hB = Math.max(terrain.heightAt(bx, bz), 3);
  const clearance = type === 'arch' ? 4.5 : 16;
  const deckY = Math.max(hA, hB) + clearance * 0.35 + 4;

  const pts = [];
  const steps = 20;
  for (let s = 0; s <= steps; s += 1) {
    const k = s / steps;
    const x = ax + (bx - ax) * k;
    const z = az + (bz - az) * k;
    const arch = type === 'arch'
      ? Math.sin(k * Math.PI) * Math.min(14, total * 0.16)
      : Math.sin(k * Math.PI) * 3.5;
    pts.push([x, lerp(hA + 2, hB + 2, k) + arch + (type === 'arch' ? 1.5 : deckY - Math.max(hA, hB) - 2), z]);
  }

  const towers = [];
  if (type === 'cable') {
    for (const k of [0.3, 0.7]) {
      const x = ax + (bx - ax) * k;
      const z = az + (bz - az) * k;
      const baseIdx = Math.round(k * steps);
      towers.push({ x, z, base: pts[baseIdx][1], height: rand.range(58, 92) });
    }
  }
  const pillars = [];
  if (type !== 'cable') {
    for (let s = 3; s < steps - 2; s += 3) {
      const p = pts[s];
      pillars.push({ x: p[0], z: p[2], top: p[1] - 1.5, r: type === 'arch' ? 1.6 : 3.4 });
    }
  }
  return { pts, towers, pillars, type, width: type === 'arch' ? 7 : rand.range(20, 28), length: total };
}

/** 过江索道：两岸各一座塔，缆绳带下垂，轿厢在上面来回跑 */
function makeCableCar(terrain, rand, river, t) {
  const idx = clamp(Math.round(t * (river.pts.length - 1)), 1, river.pts.length - 2);
  const [cx, cz] = river.pts[idx];
  const [px, pz] = river.pts[idx - 1];
  const [nx2, nz2] = river.pts[idx + 1];
  const len = Math.hypot(nx2 - px, nz2 - pz) || 1;
  const dirX = -(nz2 - pz) / len;
  const dirZ = (nx2 - px) / len;
  const span = spanWater(terrain, cx, cz, dirX, dirZ);
  if (!span) return null;
  const pad = rand.range(40, 110);
  const ax = cx - dirX * (span.a.dist + pad);
  const az = cz - dirZ * (span.a.dist + pad);
  const bx = cx + dirX * (span.b.dist + pad);
  const bz = cz + dirZ * (span.b.dist + pad);
  const ha = terrain.heightAt(ax, az);
  const hb = terrain.heightAt(bx, bz);
  if (ha < 2 || hb < 2) return null;
  const towerH = rand.range(46, 68);
  return {
    a: { x: ax, z: az, base: ha, height: towerH },
    b: { x: bx, z: bz, base: hb, height: towerH * rand.range(0.85, 1.15) },
    sag: Math.hypot(bx - ax, bz - az) * 0.045,
    length: Math.hypot(bx - ax, bz - az),
  };
}

/** 古城墙：方形环城 + 四座城门楼，西安的轮廓全靠它 */
function makeCityWall(terrain, rand, half) {
  const r = half * 0.5;
  const thickness = 16;
  const height = 13;
  const corners = [[-r, -r], [r, -r], [r, r], [-r, r]];
  const segments = [];
  const gates = [];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    segments.push({ a, b, thickness, height });
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    gates.push({
      x: mx, z: mz,
      rot: Math.atan2(b[1] - a[1], b[0] - a[0]),
      base: terrain.heightAt(mx, mz),
      width: 46, depth: thickness + 14, height: height + 20,
    });
  }
  const towers = corners.map(([x, z]) => ({
    x, z, base: terrain.heightAt(x, z), width: 26, height: height + 14,
  }));
  return { segments, gates, towers, r, thickness, height, moat: rand.chance(0.9) };
}

/** 水巷：细窄河道织成网，两侧压石岸，杭州靠它把街区切成水乡尺度 */
function makeCanals(terrain, rand, half, noise, count) {
  const canals = [];
  for (let c = 0; c < count; c += 1) {
    const angle = rand.range(0, Math.PI * 2);
    const width = rand.range(12, 20);
    const raw = [];
    let x = Math.cos(angle) * half * 0.85 * -1;
    let z = Math.sin(angle) * half * 0.85 * -1;
    let dir = angle;
    for (let s = 0; s < 90; s += 1) {
      raw.push([x, z]);
      dir += (noise.fractal(s * 0.09 + c * 3, c * 1.7, 2) - 0.5) * 0.42;
      x += Math.cos(dir) * 26;
      z += Math.sin(dir) * 26;
      if (Math.abs(x) > half * 0.98 || Math.abs(z) > half * 0.98) break;
    }
    // 落进江河湖面的段直接丢掉，河道只在陆地上开
    let run = [];
    const runs = [];
    for (const p of raw) {
      if (terrain.heightAt(p[0], p[1]) > 2.5) run.push(p);
      else {
        if (run.length >= 6) runs.push(run);
        run = [];
      }
    }
    if (run.length >= 6) runs.push(run);

    for (const pts of runs) {
      const before = terrain.carveChannel(pts, width, 3.6);
      canals.push({ pts, width, surface: before.map((h) => h - 1.4) });
    }
  }
  return canals;
}


/** 山城步道：顺着最陡的方向一路下坡，做成一段段踏步 */
function makeStairs(terrain, rand, count) {
  const flights = [];
  for (let i = 0; i < count; i += 1) {
    let x = rand.range(-terrain.half * 0.6, terrain.half * 0.6);
    let z = rand.range(-terrain.half * 0.6, terrain.half * 0.6);
    if (terrain.slopeAt(x, z) < 0.22) continue;
    const pts = [];
    for (let s = 0; s < 40; s += 1) {
      const h = terrain.heightAt(x, z);
      if (h < 2) break;
      pts.push([x, h, z]);
      const d = 6;
      const gx = (terrain.heightAt(x + d, z) - terrain.heightAt(x - d, z)) / (2 * d);
      const gz = (terrain.heightAt(x, z + d) - terrain.heightAt(x, z - d)) / (2 * d);
      const len = Math.hypot(gx, gz);
      if (len < 0.06) break;
      x -= (gx / len) * 14;
      z -= (gz / len) * 14;
    }
    if (pts.length > 6) flights.push({ pts, width: rand.range(4.5, 8) });
  }
  return flights;
}

/**
 * 跨沟高架：在城里拉几条笔直的快速路弦线，凡是弦线离地超过一定高度的区段就架起来。
 * 山地地形上这一步会自然生成大量「路在半空」的高架桥，也就是重庆那种立体交通感。
 */
function makeViaducts(terrain, rand, count, minLift) {
  const viaducts = [];
  const half = terrain.half;
  for (let i = 0; i < count * 4 && viaducts.length < count; i += 1) {
    const angle = rand.range(0, Math.PI * 2);
    const offset = rand.range(-half * 0.55, half * 0.55);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const perpX = -dirZ;
    const perpZ = dirX;
    const steps = 44;
    const pts = [];
    const ground = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = (s / steps - 0.5) * 2 * half * 0.98;
      const x = perpX * offset + dirX * t;
      const z = perpZ * offset + dirZ * t;
      pts.push([x, z]);
      ground.push(terrain.heightAt(x, z));
    }
    // 两端必须落在陆地上，弦线才有意义
    let a = 0;
    let b = steps;
    while (a < steps && ground[a] < 6) a += 1;
    while (b > a && ground[b] < 6) b -= 1;
    if (b - a < 10) continue;

    const deckAt = (s) => {
      const k = (s - a) / (b - a);
      return ground[a] + (ground[b] - ground[a]) * k + Math.sin(k * Math.PI) * 6;
    };
    let run = null;
    const flush = () => {
      if (run && run.length > 3) viaducts.push({ pts: run, width: rand.range(13, 17) });
      run = null;
    };
    for (let s = a; s <= b; s += 1) {
      const y = deckAt(s);
      if (y - ground[s] > minLift) {
        if (!run) run = [];
        run.push([pts[s][0], y + 1.2, pts[s][1]]);
        // 一段高架跨过一条沟就够了，太长会变成横穿全城的白条
        if (run.length >= 10) flush();
      } else {
        flush();
      }
    }
    flush();
  }
  return viaducts;
}



/**
 * 建楼之前先定下大占地构筑物，并把它们盖进占位图，
 * 否则楼会长在城墙上、河道里、立交底下。
 */
export function planFeatures({ seed, style, params, terrain, noise }) {
  const rand = createRandom(`${seed}:plan`);
  const half = terrain.half;

  const interchangeCount = clamp(Math.round(params.interchange), 0, 4);
  const interchanges = [];
  for (let i = 0; i < interchangeCount; i += 1) {
    const spot = findFlatSpot(terrain, rand, 95, interchanges);
    if (!spot) continue;
    const levels = clamp(Math.round(params.interchange) + (i === 0 ? 2 : 1), 2, 5);
    interchanges.push(makeInterchange(spot, levels, rand, rand.range(0, Math.PI)));
  }


  const wall = params.cityWall ? makeCityWall(terrain, rand, half) : null;
  const canals = params.canal ? makeCanals(terrain, rand, half, noise, style.id === 'hangzhou' ? 7 : 3) : [];
  const stairs = style.features.stairs && terrain.relief > 40
    ? makeStairs(terrain, rand, 16) : [];

  /** 把这些构筑物占的地盖进 raster.mask，值 4 表示「非道路但不可建」 */
  const stampBlockers = (raster) => {
    const { mask, cols, cell } = raster;
    const toCol = (v) => Math.round((v + half) / cell - 0.5);
    const disc = (x, z, r) => {
      const rc = Math.ceil(r / cell);
      const gx0 = toCol(x);
      const gz0 = toCol(z);
      for (let j = -rc; j <= rc; j += 1) {
        for (let i = -rc; i <= rc; i += 1) {
          if (i * i + j * j > rc * rc + rc) continue;
          const gx = gx0 + i;
          const gz = gz0 + j;
          if (gx < 0 || gz < 0 || gx >= cols || gz >= cols) continue;
          const idx = gz * cols + gx;
          if (mask[idx] === 0) mask[idx] = 4;
        }
      }
    };
    // 折线可能是 [x,z] 也可能是 [x,y,z]，统一取平面坐标
    const planar = (p) => (p.length === 3 ? [p[0], p[2]] : [p[0], p[1]]);
    const ribbon = (pts, width, sampleStep = 10) => {
      for (let i = 0; i < pts.length - 1; i += 1) {
        const [ax, az] = planar(pts[i]);
        const [bx, bz] = planar(pts[i + 1]);
        const dist = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(dist / sampleStep));
        for (let s = 0; s <= steps; s += 1) {
          const t = s / steps;
          disc(ax + (bx - ax) * t, az + (bz - az) * t, width / 2);
        }
      }
    };


    for (const ic of interchanges) disc(ic.x, ic.z, 142);


    for (const canal of canals) ribbon(canal.pts, canal.width + 16);
    for (const flight of stairs) ribbon(flight.pts, flight.width + 8);
    if (wall) {
      for (const seg of wall.segments) {
        ribbon([seg.a, seg.b], seg.thickness + 24, 12);
      }
    }
  };

  return { interchanges, wall, canals, stairs, stampBlockers };
}

/** 建楼之后才能定的东西：轻轨要挑一栋楼穿过去，桥和索道要知道岸在哪 */
export function finishFeatures({ seed, style, params, terrain, buildings }) {

  const rand = createRandom(`${seed}:finish`);
  const monorails = [];
  const monoCount = clamp(Math.round(params.monorail), 0, 3);
  for (let i = 0; i < monoCount; i += 1) {
    monorails.push(makeMonorail(terrain, buildings, rand, i));
  }

  const rivers = terrain.rivers ?? [];
  const bridges = [];
  const bridgeCount = clamp(Math.round(params.bridges), 0, 6);
  const bridgeType = style.id === 'hangzhou' ? 'arch' : style.id === 'xian' ? 'beam' : 'cable';
  for (let i = 0; i < bridgeCount && rivers.length > 0; i += 1) {
    const river = rivers[i % rivers.length];
    const t = 0.22 + ((i * 0.37) % 0.6);
    const type = bridgeType === 'cable' && i % 3 === 2 ? 'beam' : bridgeType;
    const bridge = makeBridge(terrain, rand, river, t, type);
    if (bridge) bridges.push(bridge);
  }

  const cableCars = [];
  const cableCount = clamp(Math.round(params.cableCar), 0, 3);
  for (let i = 0; i < cableCount && rivers.length > 0; i += 1) {
    const car = makeCableCar(terrain, rand, rivers[i % rivers.length], 0.35 + i * 0.2);
    if (car) cableCars.push(car);
  }

  const viaducts = terrain.relief > 30
    ? makeViaducts(terrain, rand, clamp(Math.round(terrain.relief / 34), 1, 4), terrain.relief > 70 ? 10 : 8)
    : [];



  return { monorails, bridges, cableCars, viaducts };
}


