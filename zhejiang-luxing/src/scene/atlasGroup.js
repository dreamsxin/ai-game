// 地图本体：地形 mesh、水面、省界、景点标记、行程缎带、城市标注。
// 只读 atlas/ 里的纯数据，不反过来改它 —— 表现层永远是判定层的一个投影。

import * as THREE from 'three';
import { BBOX, MAP_WIDTH, MAP_DEPTH, metersToUnits, lngToX, latToZ } from '../atlas/projection.js';
import { buildHeightField, elevationAt, KIND } from '../atlas/terrain.js';
import { PROVINCE, CITIES } from '../atlas/geo.js';
import { categoryOf } from '../atlas/taxonomy.js';
import { makeLabel } from './labels.js';

/** 地形网格密度。260×230 ≈ 6 万顶点，一次性生成约 100ms，之后完全静态 */
const COLS = 260;
const ROWS = 230;

export const WATER_Y = 1.1;

// 高程配色：稻田绿 → 丘陵深绿 → 山地褐 → 高处岩灰。
// 浙江没有雪线，1900 米那一档只到浅岩灰，不给纯白，否则整片浙南会糊成一块白。
const LAND_RAMP = [
  [0, 0x6cb45f], [40, 0x5da555], [140, 0x4f9450], [320, 0x5b8f4a],
  [600, 0x7f8a4c], [1000, 0x8a7a58], [1450, 0x96876f], [1900, 0xaaa290],
];
const SEA_RAMP = [[-2, 0x3d8fb0], [-18, 0x24628c], [-40, 0x17456b], [-60, 0x0f3355]];
const WATER_TINT = 0x2f86ab;

function rampColor(ramp, value, out = new THREE.Color()) {
  const asc = ramp[0][0] < ramp[ramp.length - 1][0];
  const v = value;
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, ca] = ramp[i];
    const [b, cb] = ramp[i + 1];
    const inSeg = asc ? v >= a && v <= b : v <= a && v >= b;
    if (inSeg) {
      const t = (v - a) / (b - a);
      return out.set(ca).lerp(new THREE.Color(cb), Math.min(1, Math.max(0, t)));
    }
  }
  return out.set(asc ? (v < ramp[0][0] ? ramp[0][1] : ramp[ramp.length - 1][1]) : (v > ramp[0][0] ? ramp[0][1] : ramp[ramp.length - 1][1]));
}

/** 水下夸张倍数：海和湖只有几十米深，按真实比例挖出来在这个尺度上是一张平板 */
const WATER_EXAGGERATION = 6;
const SEA_FLOOR_M = -55;

const wetY = (h) => metersToUnits(Math.max(SEA_FLOOR_M, h) * WATER_EXAGGERATION);

/** 地形：一张带顶点色的 plane，旋转后铺在 XZ 上，local z 装高度 */
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
    pos.setY(i, h < 0 ? wetY(h) : metersToUnits(h));
    if (kind === KIND.SEA) rampColor(SEA_RAMP, Math.min(-2, h), c);
    else if (kind === KIND.LAKE || kind === KIND.RIVER) c.set(WATER_TINT);
    else rampColor(LAND_RAMP, h, c);
    // 同一高度带里加一点明暗抖动，免得大片平原看起来像塑料
    const jitter = 0.94 + ((i * 2654435761) % 1000) / 1000 * 0.12;
    colors[i * 3] = c.r * jitter;
    colors[i * 3 + 1] = c.g * jitter;
    colors[i * 3 + 2] = c.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, flatShading: false }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return { mesh, field };
}

/** 底座：把地形下面封住，低角度看过去是一块托盘而不是一张纸的背面 */
export function buildBase() {
  const floor = metersToUnits(SEA_FLOOR_M * WATER_EXAGGERATION);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_WIDTH * 1.02, 26, MAP_DEPTH * 1.02),
    new THREE.MeshStandardMaterial({ color: 0x0a1a28, roughness: 0.95, metalness: 0.05 }),
  );
  mesh.position.y = floor - 13.4;
  mesh.name = 'base';
  return mesh;
}

/** 景点/标记落在地表上的高度（场景单位）。水面上的景点抬到水面之上 */
export function surfaceY(lng, lat) {
  const { h } = elevationAt(lng, lat);
  return Math.max(WATER_Y + 0.4, metersToUnits(h));
}

/**
 * 水面：盖住海、湖、江的一整张半透明面，边界和地形托盘对齐 ——
 * 铺成无限大海面反而会露出「海到一半就没了」的接缝，收在托盘里更像一件模型。
 */
export function buildWater() {
  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH, 80, 80);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x2e7fa6, transparent: true, opacity: 0.74, roughness: 0.14, metalness: 0.42,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  const base = Float32Array.from(geo.attributes.position.array);
  return {
    mesh,
    animate: (t) => {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.setY(i, Math.sin(x * 0.01 + t * 0.9) * 0.55 + Math.sin(z * 0.013 - t * 0.7) * 0.45);
      }
      pos.needsUpdate = true;
    },
  };
}

/** 省界：沿轮廓拉一根发光的管子，比 LineBasicMaterial 的一像素线好认 */
export function buildBorder() {
  const pts = PROVINCE.map(([lng, lat]) => new THREE.Vector3(lngToX(lng), surfaceY(lng, lat) + 1.2, latToZ(lat)));
  pts.push(pts[0].clone());
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.3);
  const geo = new THREE.TubeGeometry(curve, PROVINCE.length * 6, 1.5, 6, true);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.72 }),
  );
  mesh.name = 'border';
  return mesh;
}

const PIN_H = 42;

/**
 * 景点标记：地面光环 + 竖杆 + 宝石头 + 名字。
 * 另外挂一个看不见的粗圆柱当拾取代理 —— 直接点宝石头在手机上太难命中。
 */
export function buildMarkers(spots) {
  const group = new THREE.Group();
  group.name = 'markers';
  const entries = spots.map((spot, i) => {
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

    const head = new THREE.Mesh(
      new THREE.OctahedronGeometry(7.5, 0),
      new THREE.MeshStandardMaterial({ color: cat.color, emissive: cat.color, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.35 }),
    );
    head.position.y = PIN_H + 5.5;

    const label = makeLabel(spot.name, { height: 0.027, color: '#f3f9ff' });
    // 名字按序错开六档高度：杭嘉湖那一带景点挨得很近，不错开会叠成一团糊字。
    // 全省视角下最密的那几处仍会轻微相叠 —— 标注是屏幕固定字号的，拉近一点就分开了。
    label.position.y = PIN_H + 14 + (i % 6) * 22;

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
  }
  return group;
}

/** 行程缎带：站点连成一条平滑曲线，站点上再放一个编号珠子 */
export function buildRoute(detail) {
  const group = new THREE.Group();
  group.name = `route-${detail.id}`;
  const pts = detail.stops.map((s) => new THREE.Vector3(lngToX(s.lng), surfaceY(s.lng, s.lat) + PIN_H * 0.55, latToZ(s.lat)));
  if (pts.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, pts.length * 24, 3.2, 8, false),
      new THREE.MeshStandardMaterial({
        color: detail.color, emissive: detail.color, emissiveIntensity: 0.65, roughness: 0.3, transparent: true, opacity: 0.92,
      }),
    );
    group.add(tube);
  }
  pts.forEach((p, i) => {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(5, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: detail.color, emissiveIntensity: 0.5, roughness: 0.3 }),
    );
    bead.position.copy(p);
    const num = makeLabel(`${i + 1}`, { height: 0.021, size: 30, color: '#0b1220', halo: 'rgba(255,240,200,0.95)' });
    num.position.copy(p).add(new THREE.Vector3(0, 11, 0));
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
 * 把整张地图拼起来，并给外面留下「哪些景点可见 / 选中了谁 / 走哪条线」三个开关。
 * 地形只造一次；筛选只改标记的可见性，不重建几何。
 */
export function buildAtlas(spots) {
  const group = new THREE.Group();
  const terrain = buildTerrain();
  const base = buildBase();
  const water = buildWater();
  const border = buildBorder();
  const cities = buildCityLabels();
  const markers = buildMarkers(spots);
  const routeHolder = new THREE.Group();
  group.add(terrain.mesh, base, water.mesh, border, cities, markers.group, routeHolder);

  const byId = new Map(markers.entries.map((e) => [e.spot.id, e]));
  let routeGroup = null;
  let selectedId = null;
  let hoverId = null;
  let showLabels = true;

  const refreshLabels = () => {
    for (const e of markers.entries) {
      e.label.visible = e.pin.visible && (showLabels || e.spot.id === selectedId || e.spot.id === hoverId);
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
    animate(t) {
      water.animate(t);
      for (const e of markers.entries) {
        if (!e.pin.visible) continue;
        const selected = e.spot.id === selectedId;
        const hot = selected || e.spot.id === hoverId;
        e.head.rotation.y = t * (selected ? 1.5 : 0.5);
        e.head.position.y = PIN_H + 5.5 + (selected ? Math.sin(t * 3) * 2.2 : 0);
        const scale = hot ? 1.35 : 1;
        e.head.scale.setScalar(scale);
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


