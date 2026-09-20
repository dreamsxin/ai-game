// 地图本体：地形 mesh、各自水位的水面、省界、景点标记、行程缎带、城市与山峰标注。
// 只读 atlas/ 里的纯数据，不反过来改它 —— 表现层永远是判定层的一个投影。

import * as THREE from 'three';
import { BBOX, MAP_WIDTH, MAP_DEPTH, PLINTH, UNITS_PER_DEG_LAT, metersToUnits, lngToX, latToZ } from '../atlas/projection.js';
import { buildHeightField, elevationAt, lakeBounds, lakeContains, KIND } from '../atlas/terrain.js';
import { PROVINCE, LAKES, RIVERS, CITIES, PEAKS } from '../atlas/geo.js';
import { categoryOf } from '../atlas/taxonomy.js';
import { makeLabel } from './labels.js';

/** 地形网格密度。320×350 ≈ 11 万顶点，一次性生成约 400ms，之后完全静态 */
const COLS = 320;
const ROWS = 350;

// 高程配色：圩田绿 → 丘陵深绿 → 山地褐 → 高处岩灰。
// 江西没有雪线，2158 米那一档只到浅岩灰，不给纯白。
const LAND_RAMP = [
  [13, 0x76c065], [60, 0x63b058], [180, 0x54a052], [420, 0x5b9349],
  [820, 0x868c4c], [1250, 0x8f7d59], [1650, 0xa39880], [2160, 0xcfc9b8],
];
// 省外：同一套地形，抽掉颜色。灰蓝的邻省 + 绿的江西，省界不用画粗线也看得出来
const OUTSIDE_RAMP = [
  [20, 0x4e5c68], [300, 0x586773], [900, 0x63727e], [1800, 0x71808c],
];
const LAKE_BED = 0x1f5d80;
const RIVER_BED = 0x276f95;

function rampColor(ramp, value, out = new THREE.Color()) {
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, ca] = ramp[i];
    const [b, cb] = ramp[i + 1];
    if (value >= a && value <= b) {
      const t = (value - a) / (b - a);
      return out.set(ca).lerp(new THREE.Color(cb), Math.min(1, Math.max(0, t)));
    }
  }
  return out.set(value < ramp[0][0] ? ramp[0][1] : ramp[ramp.length - 1][1]);
}

/** 水下地形也要夸张一点，否则 11 米深的鄱阳湖底就是一张平板 */
const BED_EXAGGERATION = 2.4;

/** 一个顶点的场景高度：省外整块压低 PLINTH，江西因此像一块托起来的浮雕板 */
function vertexY(h, kind) {
  if (kind === KIND.OUTSIDE) return metersToUnits(h) - PLINTH;
  if (kind === KIND.LAKE || kind === KIND.RIVER) return metersToUnits(h) * BED_EXAGGERATION;
  return metersToUnits(h);
}

/** 地形：一张带顶点色的 plane，旋转后铺在 XZ 上，local y 装高度 */
export function buildTerrain() {
  const field = buildHeightField(COLS, ROWS, BBOX);
  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH, COLS - 1, ROWS - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const h = field.heights[i];
    const kind = field.kinds[i];
    pos.setY(i, vertexY(h, kind));
    if (kind === KIND.OUTSIDE) rampColor(OUTSIDE_RAMP, h, c);
    else if (kind === KIND.LAKE) c.set(LAKE_BED);
    else if (kind === KIND.RIVER) c.set(RIVER_BED);
    else rampColor(LAND_RAMP, h, c);
    // 同一高度带里加一点明暗抖动，免得大片圩田看起来像塑料
    const jitter = 0.94 + ((i * 2654435761) % 1000) / 1000 * 0.12;
    colors[i * 3] = c.r * jitter;
    colors[i * 3 + 1] = c.g * jitter;
    colors[i * 3 + 2] = c.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 }),
  );
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, field };
}

/** 底座：把地形下面封住，低角度看过去是一块托盘而不是一张纸的背面 */
export function buildBase() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_WIDTH * 1.02, 30, MAP_DEPTH * 1.02),
    new THREE.MeshStandardMaterial({ color: 0x0a1a26, roughness: 0.95, metalness: 0.06 }),
  );
  mesh.position.y = -PLINTH - 15.5;
  mesh.name = 'base';
  return mesh;
}

/** 景点/标记落在地表上的高度（场景单位）。站在水上的景点抬到水面之上 */
export function surfaceY(lng, lat) {
  const { h, kind, level } = elevationAt(lng, lat);
  if (kind === KIND.LAKE || kind === KIND.RIVER) return metersToUnits(level) + 0.5;
  if (kind === KIND.OUTSIDE) return metersToUnits(h) - PLINTH;
  return metersToUnits(h);
}

/**
 * 湖面：按湖的真实形状铺一张网格，而不是一个圆片 ——
 * 鄱阳湖是北窄南宽的葫芦形，圆片会把它糊成一个盘子。
 * 做法是在湖的包围盒里撒格点，四角都在湖内的格子才生成三角面。
 */
export function buildLakeSurface(lake) {
  const b = lakeBounds(lake);
  const cell = lake.shape === 'poly' ? 0.014 : 0.008;
  const nx = Math.max(2, Math.ceil((b.maxLng - b.minLng) / cell) + 1);
  const ny = Math.max(2, Math.ceil((b.maxLat - b.minLat) / cell) + 1);
  const verts = [];
  const inside = [];
  for (let j = 0; j < ny; j++) {
    const lat = b.minLat + ((b.maxLat - b.minLat) * j) / (ny - 1);
    for (let i = 0; i < nx; i++) {
      const lng = b.minLng + ((b.maxLng - b.minLng) * i) / (nx - 1);
      verts.push(lngToX(lng), 0, latToZ(lat));
      inside.push(lakeContains(lng, lat, lake, 1.02));
    }
  }
  const index = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b2 = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (!(inside[a] && inside[b2] && inside[c] && inside[d])) continue;
      index.push(a, c, b2, b2, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, waterMaterial());
  mesh.position.y = metersToUnits(lake.level);
  mesh.renderOrder = 2;
  mesh.name = `lake-${lake.id}`;
  return { mesh, geo, base: Float32Array.from(geo.attributes.position.array), empty: index.length === 0 };
}

const waterMaterial = () => new THREE.MeshStandardMaterial({
  color: 0x2f8ab4, transparent: true, opacity: 0.86, roughness: 0.12, metalness: 0.45,
  emissive: 0x0d3d5c, emissiveIntensity: 0.35, depthWrite: false, side: THREE.DoubleSide,
});

/**
 * 河：沿中心线铺一条缎带，高度取那一段的真实水位 ——
 * 所以赣江从赣州（水面约 105 米）一路斜着下降到吴城入湖（约 16 米），
 * 而不是像沿海省份那样所有水面都躺在海平面上。
 */
export function buildRiverRibbon(river) {
  const half = (river.width / 2) * UNITS_PER_DEG_LAT * 1.2;
  const line = [];
  const STEPS = 14; // 每段再分这么多份，弯道才不会出现折角
  for (let i = 0; i < river.pts.length - 1; i++) {
    const [aLng, aLat, aH] = river.pts[i];
    const [bLng, bLat, bH] = river.pts[i + 1];
    const last = i === river.pts.length - 2;
    for (let s = 0; s < STEPS + (last ? 1 : 0); s++) {
      const t = s / STEPS;
      line.push({
        x: lngToX(aLng + (bLng - aLng) * t),
        z: latToZ(aLat + (bLat - aLat) * t),
        y: metersToUnits(aH + (bH - aH) * t) + 0.35,
      });
    }
  }

  const verts = [];
  const index = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    // 越往下游越宽，是河该有的样子
    const w = half * (0.55 + 0.45 * (i / Math.max(1, line.length - 1)));
    const p = line[i];
    verts.push(p.x + nx * w, p.y, p.z + nz * w, p.x - nx * w, p.y, p.z - nz * w);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, waterMaterial());
  mesh.renderOrder = 2;
  mesh.name = `river-${river.id}`;
  return mesh;
}

/** 省界：沿轮廓拉一根发光的管子，扣在被压低的邻省与江西之间那道台阶上 */
export function buildBorder() {
  const pts = PROVINCE.map(([lng, lat]) => new THREE.Vector3(lngToX(lng), surfaceY(lng, lat) + 1.4, latToZ(lat)));
  pts.push(pts[0].clone());
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.3);
  const geo = new THREE.TubeGeometry(curve, PROVINCE.length * 6, 1.8, 6, true);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.75 }),
  );
  mesh.name = 'border';
  return mesh;
}

const PIN_H = 40;

/**
 * 景点标记：地面光环 + 竖杆 + 宝石头 + 名字。
 * 另外挂一个看不见的粗圆柱当拾取代理 —— 直接点宝石头在手机上太难命中。
 */
export function buildMarkers(spots) {
  const group = new THREE.Group();
  group.name = 'markers';
  const entries = spots.map((spot) => {
    const cat = categoryOf(spot.category);
    const pin = new THREE.Group();
    pin.position.set(lngToX(spot.lng), surfaceY(spot.lng, spot.lat), latToZ(spot.lat));

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7, 12, 34),
      new THREE.MeshBasicMaterial({ color: cat.color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.8;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, PIN_H, 8),
      new THREE.MeshStandardMaterial({ color: cat.color, emissive: cat.color, emissiveIntensity: 0.3, roughness: 0.45 }),
    );
    stem.position.y = PIN_H / 2;
    stem.castShadow = true;

    const head = new THREE.Mesh(
      new THREE.OctahedronGeometry(7.2, 0),
      new THREE.MeshStandardMaterial({ color: cat.color, emissive: cat.color, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.35 }),
    );
    head.position.y = PIN_H + 5;
    head.castShadow = true;

    const label = makeLabel(spot.name, { height: 0.027, color: '#f3f9ff' });
    label.position.y = PIN_H + 16;

    const pick = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 15, PIN_H + 22, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    pick.position.y = (PIN_H + 22) / 2;
    pick.userData.spotId = spot.id;

    pin.add(ring, stem, head, label, pick);
    group.add(pin);
    return { spot, pin, ring, stem, head, label, pick, color: cat.color };
  });
  return { group, entries };
}

/** 城市地名：比景点标注小一号、颜色更淡，只是让人知道自己在看哪一带 */
export function buildCityLabels() {
  const group = new THREE.Group();
  group.name = 'cities';
  const entries = [];
  for (const city of CITIES) {
    const label = makeLabel(city.name, {
      height: city.major ? 0.026 : 0.021,
      size: 30,
      weight: 400,
      color: city.major ? 'rgba(255,246,222,0.95)' : 'rgba(226,238,250,0.8)',
      halo: 'rgba(6,14,24,0.5)',
    });
    label.position.set(lngToX(city.lng), surfaceY(city.lng, city.lat) + 9, latToZ(city.lat));
    group.add(label);
    entries.push({ sprite: label, rank: city.major ? 2 : 3 });
  }
  return { group, entries };
}

/** 山峰标高：江西的骨架是环着盆地的一圈山，把高度写上去比一片绿好读得多 */
export function buildPeakLabels() {
  const group = new THREE.Group();
  group.name = 'peaks';
  const entries = [];
  for (const peak of PEAKS) {
    const label = makeLabel(`▲ ${peak.name} ${peak.h}m`, {
      height: 0.019, size: 26, weight: 400,
      color: 'rgba(255,236,206,0.9)', halo: 'rgba(24,16,8,0.55)',
    });
    label.position.set(lngToX(peak.lng), surfaceY(peak.lng, peak.lat) + 14, latToZ(peak.lat));
    group.add(label);
    entries.push({ sprite: label, rank: 4 });
  }
  return { group, entries };
}

/**
 * 屏幕空间避让：把所有标注按优先级排队，投影到屏幕上，压到别人身上的就先不显示。
 * 江西有 46 个景点加城市和山峰，不做这一步全省视角下会糊成一堵字墙 ——
 * 这是纸质地图上一百年前就在做的事，只是这里每帧重算一次。
 */
function declutter(entries, camera, width, height) {
  const v = new THREE.Vector3();
  const placed = [];
  const rows = [];
  for (const e of entries) {
    if (!e.wanted) {
      e.sprite.visible = false;
      continue;
    }
    e.sprite.getWorldPosition(v);
    const dist = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) {
      e.sprite.visible = false;
      continue;
    }
    const w = e.sprite.scale.x * height;
    const h = e.sprite.scale.y * height;
    const cx = (v.x * 0.5 + 0.5) * width;
    const cy = (1 - (v.y * 0.5 + 0.5)) * height;
    rows.push({ e, dist, rect: [cx - w / 2 - 3, cy - h / 2 - 2, cx + w / 2 + 3, cy + h / 2 + 2] });
  }
  // 同优先级里离镜头近的先摆，这样前排的名字不会被后山的名字抢掉
  rows.sort((a, b) => a.e.rank - b.e.rank || a.dist - b.dist);
  for (const row of rows) {
    const [x1, y1, x2, y2] = row.rect;
    const hit = placed.some(([a1, b1, a2, b2]) => x1 < a2 && x2 > a1 && y1 < b2 && y2 > b1);
    row.e.sprite.visible = !hit;
    if (!hit) placed.push(row.rect);
  }
}

// __NEXT__


/**
 * 鄱阳湖上的候鸟。每年冬天几十万只从西伯利亚下来，是这片水域最该被画出来的东西；
 * 三组同心圆盘旋，整组慢慢转，远看就是湖面上有东西在动。
 */
export function buildBirds() {
  const group = new THREE.Group();
  group.name = 'birds';
  group.position.set(lngToX(116.2), metersToUnits(15) + 30, latToZ(29.15));
  const geo = new THREE.ConeGeometry(2.6, 8, 3);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf6fbff, transparent: true, opacity: 0.8 });
  const birds = [];
  for (let i = 0; i < 30; i++) {
    const bird = new THREE.Mesh(geo, mat);
    const ring = i % 3;
    const r = 70 + ring * 55;
    const a = (i / 30) * Math.PI * 2 + ring;
    bird.position.set(Math.cos(a) * r, ring * 12, Math.sin(a) * r * 0.7);
    bird.rotation.z = Math.PI / 2;
    bird.rotation.y = -a;
    group.add(bird);
    birds.push({ bird, a, r, ring });
  }
  return {
    group,
    animate: (t) => {
      group.rotation.y = t * 0.05;
      for (const b of birds) b.bird.position.y = b.ring * 12 + Math.sin(t * 1.6 + b.a * 3) * 3.5;
    },
  };
}

/** 行程缎带：站点连成一条平滑曲线，站点上再放一个编号珠子 */
export function buildRoute(detail) {
  const group = new THREE.Group();
  group.name = `route-${detail.id}`;
  const pts = detail.stops.map((s) => new THREE.Vector3(lngToX(s.lng), surfaceY(s.lng, s.lat) + PIN_H * 0.55, latToZ(s.lat)));
  if (pts.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    const tube = new THREE.Mesh(
      // 半径按全省视角能看见来定：2 个单位的管子在 1600 单位宽的地图上只有一两个像素，等于没画
      new THREE.TubeGeometry(curve, pts.length * 24, 5.5, 8, false),
      new THREE.MeshStandardMaterial({
        color: detail.color, emissive: detail.color, emissiveIntensity: 0.65, roughness: 0.3, transparent: true, opacity: 0.92,
      }),
    );
    group.add(tube);
  }
  pts.forEach((p, i) => {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(7, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: detail.color, emissiveIntensity: 0.5, roughness: 0.3 }),
    );
    bead.position.copy(p);
    // 站点编号。height 是「占视口高度的比例」，不是世界尺寸 ——
    // 这里写成 9 的话，一个数字就会铺满整块屏幕，画面看着像黑屏。
    const num = makeLabel(`${i + 1}`, { height: 0.02, size: 30, color: '#0b1220', halo: 'rgba(255,240,200,0.95)' });
    num.position.copy(p).add(new THREE.Vector3(0, 8, 0));
    group.add(bead, num);
  });
  return group;
}

const disposeTree = (obj) => {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mat = o.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
};

/**
 * 把整张地图拼起来，并给外面留下「哪些景点可见 / 选中了谁 / 走哪条线 / 标注开不开」几个开关。
 * 地形和水面只造一次；筛选只改标记的可见性，不重建几何。
 */
export function buildAtlas(spots) {
  const group = new THREE.Group();
  const terrain = buildTerrain();
  const base = buildBase();
  const border = buildBorder();
  const cities = buildCityLabels();
  const peaks = buildPeakLabels();
  const markers = buildMarkers(spots);
  const birds = buildBirds();
  const routeHolder = new THREE.Group();

  const waters = new THREE.Group();
  waters.name = 'waters';
  const lakeSurfaces = LAKES.map(buildLakeSurface).filter((l) => !l.empty);
  for (const l of lakeSurfaces) waters.add(l.mesh);
  for (const river of RIVERS) waters.add(buildRiverRibbon(river));

  group.add(terrain.mesh, base, waters, border, cities.group, peaks.group, markers.group, birds.group, routeHolder);

  const byId = new Map(markers.entries.map((e) => [e.spot.id, e]));
  // 标注的优先级：选中/悬停的景点最高，然后是景点名，再是城市，山峰垫底
  const labels = [
    ...markers.entries.map((e) => ({ sprite: e.label, rank: 1, spot: e.spot, pin: e.pin, wanted: true })),
    ...cities.entries.map((e) => ({ ...e, wanted: true })),
    ...peaks.entries.map((e) => ({ ...e, wanted: true })),
  ];
  let routeGroup = null;
  let selectedId = null;
  let hoverId = null;
  let showLabels = true;

  const refreshLabels = () => {
    for (const l of labels) {
      if (!l.spot) {
        l.wanted = showLabels;
        continue;
      }
      const hot = l.spot.id === selectedId || l.spot.id === hoverId;
      l.wanted = l.pin.visible && (showLabels || hot);
      l.rank = hot ? 0 : 1;
    }
  };


  return {
    group,
    terrain,
    entries: markers.entries,
    /** 只留下这批 id 的标记，其余隐藏 */
    setVisibleSpots(ids) {
      const keep = ids instanceof Set ? ids : new Set(ids);
      for (const e of markers.entries) e.pin.visible = keep.has(e.spot.id);
      refreshLabels();
    },
    setLabels(show) {
      showLabels = show;
      refreshLabels();
    },
    setSelection(nextSelected, nextHover) {
      selectedId = nextSelected ?? null;
      hoverId = nextHover ?? null;
      refreshLabels();
    },
    setRoute(detail) {
      if (routeGroup) {
        routeHolder.remove(routeGroup);
        disposeTree(routeGroup);
        routeGroup = null;
      }
      if (detail) {
        routeGroup = buildRoute(detail);
        routeHolder.add(routeGroup);
      }
    },
    /** 可见标记的拾取代理。Raycaster 不看 visible，所以这里自己筛 */
    pickTargets: () => markers.entries.filter((e) => e.pin.visible).map((e) => e.pick),
    positionOf(id) {
      const e = byId.get(id);
      return e ? e.pin.position.clone() : null;
    },
    animate(t, camera, width, height) {
      // 湖面的涌浪。江面缎带不动 —— 河那么窄，晃起来只会像抖动
      for (const l of lakeSurfaces) {
        const pos = l.geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = l.base[i * 3];
          const z = l.base[i * 3 + 2];
          pos.setY(i, Math.sin(x * 0.012 + t * 0.9) * 0.5 + Math.sin(z * 0.015 - t * 0.7) * 0.4);
        }
        pos.needsUpdate = true;
      }
      birds.animate(t);
      if (camera && width && height) declutter(labels, camera, width, height);

      for (const e of markers.entries) {
        if (!e.pin.visible) continue;
        const selected = e.spot.id === selectedId;
        const hot = selected || e.spot.id === hoverId;
        e.head.rotation.y = t * (selected ? 1.5 : 0.5);
        e.head.position.y = PIN_H + 3.4 + (selected ? Math.sin(t * 3) * 1.6 : 0);
        e.head.scale.setScalar(hot ? 1.35 : 1);
        e.head.material.emissiveIntensity = hot ? 1.1 : 0.5;
        // 选中的景点地面光环一圈圈往外扩，远看也知道自己点到了哪
        const pulse = selected ? 1 + ((t * 0.9) % 1) * 1.6 : hot ? 1.25 : 1;
        e.ring.scale.setScalar(pulse);
        e.ring.material.opacity = selected ? 0.55 * (1 - ((t * 0.9) % 1)) + 0.2 : hot ? 0.7 : 0.45;
        e.stem.material.emissiveIntensity = hot ? 0.8 : 0.3;
      }
    },
    dispose() {
      disposeTree(group);
    },
  };
}







