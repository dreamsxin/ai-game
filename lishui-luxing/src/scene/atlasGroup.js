// 地图本体：地形、各自高度的水面、市界墨线、印章式景点标记、行程缎带、县名。
// 配色走《千里江山图》的矿物色：谷底绢黄赭石、山腰石绿、山顶石青，界外一律洗淡。
// 只读 atlas/ 的纯数据，不反过来改它。

import * as THREE from 'three';
import { BBOX, MAP_WIDTH, MAP_DEPTH, metersToUnits, lngToX, latToZ, UNITS_PER_DEG_LNG } from '../atlas/projection.js';
import { buildHeightField, elevationAt, KIND } from '../atlas/terrain.js';
import { BOUNDARY, LAKES, RIVERS, TOWNS } from '../atlas/geo.js';
import { categoryOf, PALETTE } from '../atlas/taxonomy.js';
import { makeLabel, makeRippleTexture } from './labels.js';

/** 地形网格密度。丽水范围小，密度可以给得比全省图更高 */
const COLS = 300;
const ROWS = 270;

// 高程配色：这张 ramp 就是这张图的"画风"本身 ——
// 谷底绢黄、山腰石绿、峰顶石青，和画里"青绿山水"的层次一致。
// 高程配色：这张 ramp 就是这张图的"画风"本身 ——
// 谷底绢黄、山腰石绿、峰顶石青。丽水平均海拔约六百米，
// 所以石青要压到 1300 米以上才出现，否则整个市会糊成一片蓝。
const LAND_RAMP = [
  [0, 0xe6d9b0], [250, 0xd2c589], [500, 0xb3c273], [800, 0x8ab468],
  [1100, 0x63a06a], [1350, 0x44867e], [1600, 0x356f8e], [1929, 0x2a5c88],
];
const WASH = new THREE.Color(0xeadfc0); // 界外的洗淡色（绢底）

function rampColor(ramp, value, out = new THREE.Color()) {
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, ca] = ramp[i];
    const [b, cb] = ramp[i + 1];
    if (value >= a && value <= b) {
      const t = (value - a) / (b - a);
      return out.set(ca).lerp(new THREE.Color(cb), t);
    }
  }
  return out.set(value < ramp[0][0] ? ramp[0][1] : ramp[ramp.length - 1][1]);
}

/** 地形：带顶点色的 plane，旋转后铺在 XZ 上 */
export function buildTerrain() {
  const field = buildHeightField(COLS, ROWS, BBOX);
  const geo = new THREE.PlaneGeometry(MAP_WIDTH, MAP_DEPTH, COLS - 1, ROWS - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const h = field.heights[i];
    pos.setY(i, metersToUnits(h));
    rampColor(LAND_RAMP, h, c);
    if (field.kinds[i] !== KIND.LAND) c.lerp(new THREE.Color(0xd8e8de), 0.6);
    // 界外洗淡：画卷不在市界上裁断，但一眼能看出哪里是丽水
    if (!field.inside[i]) c.lerp(WASH, 0.75);
    // 同一色带里加一点抖动，避免大片色块发死
    const jitter = 0.95 + (((i * 2654435761) % 1000) / 1000) * 0.1;
    colors[i * 3] = c.r * jitter;
    colors[i * 3 + 1] = c.g * jitter;
    colors[i * 3 + 2] = c.b * jitter;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return { mesh, field };
}

/** 托盘：把地形下面封住，低角度看过去像一卷摊开的画而不是一张纸的背面 */
export function buildBase(field) {
  const floor = metersToUnits(Math.min(0, field.minH)) - 26;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_WIDTH * 1.015, 30, MAP_DEPTH * 1.015),
    new THREE.MeshStandardMaterial({ color: 0xcdbb92, roughness: 0.98 }),
  );
  mesh.position.y = floor + 15;
  mesh.name = 'base';
  return mesh;
}

/** 景点落在地表上的高度（场景单位）。水面上的点抬到水面之上 */
export function surfaceY(lng, lat) {
  const s = elevationAt(lng, lat);
  const h = s.kind === KIND.LAND ? s.h : Math.max(s.h, s.surface ?? s.h) + 1.5;
  return metersToUnits(h);
}

/**
 * 水面。丽水的水各在不同海拔上（云和湖 184m、千峡湖 160m、南明湖 50m、
 * 瓯江从 190m 降到 8m），所以每个湖一张面、每条江一条带，各按自己的 surface 摆高度。
 */
export function buildWater() {
  const group = new THREE.Group();
  group.name = 'water';
  const ripple = makeRippleTexture();
  const material = new THREE.MeshStandardMaterial({
    map: ripple, color: 0xeaf3ec, transparent: true, opacity: 0.95,
    roughness: 0.28, metalness: 0.06, side: THREE.DoubleSide,
  });

  for (const lake of LAKES) {
    const shape = new THREE.Shape();
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const lng = lake.lng + Math.cos(a) * lake.rx;
      const lat = lake.lat + Math.sin(a) * lake.ry;
      const x = lngToX(lng);
      const z = latToZ(lat);
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = metersToUnits(lake.surface) + 0.6;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  for (const river of RIVERS) {
    group.add(riverRibbon(river, material));
  }
  return { group, material, ripple };
}

/** 一条江：沿折线铺一条等宽的带，高度按节点水面线性插值 */
function riverRibbon(river, material) {
  const pts = river.pts;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const x = lngToX(pts[i][0]);
    const z = latToZ(pts[i][1]);
    const dx = lngToX(next[0]) - lngToX(prev[0]);
    const dz = latToZ(next[1]) - latToZ(prev[1]);
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const halfW = (river.width / 2) * UNITS_PER_DEG_LNG;
    const y = metersToUnits(pts[i][2]) + 0.6;
    left.push(new THREE.Vector3(x + nx * halfW, y, z + nz * halfW));
    right.push(new THREE.Vector3(x - nx * halfW, y, z - nz * halfW));
  }
  const positions = [];
  const uvs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = left[i];
    const b = right[i];
    const cc = left[i + 1];
    const d = right[i + 1];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z);
    positions.push(b.x, b.y, b.z, d.x, d.y, d.z, cc.x, cc.y, cc.z);
    uvs.push(0, i, 1, i, 0, i + 1, 1, i, 1, i + 1, 0, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  mesh.name = `river-${river.id}`;
  return mesh;
}

/** 市界：一道墨线，像画上勾的边 */
export function buildBoundary() {
  const pts = BOUNDARY.map(([lng, lat]) => new THREE.Vector3(lngToX(lng), surfaceY(lng, lat) + 3, latToZ(lat)));
  pts.push(pts[0].clone());
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.25);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, BOUNDARY.length * 6, 2.2, 5, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.mo, transparent: true, opacity: 0.55 }),
  );
  mesh.name = 'boundary';
  return mesh;
}

const PIN_H = 34;

/**
 * 景点标记：一根墨色细杆，顶上挂一枚朱砂印章（印文是类别字），
 * 地面一圈类别色的晕，杆边一块绢色题签写名字。
 * 另挂一个看不见的粗圆柱当拾取代理 —— 直接点印章在手机上太难命中。
 */
export function buildMarkers(spots) {
  const group = new THREE.Group();
  group.name = 'markers';
  const entries = spots.map((spot, i) => {
    const cat = categoryOf(spot.category);
    const pin = new THREE.Group();
    pin.position.set(lngToX(spot.lng), surfaceY(spot.lng, spot.lat), latToZ(spot.lat));

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(5, 10, 32),
      new THREE.MeshBasicMaterial({ color: cat.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.8;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, PIN_H, 6),
      new THREE.MeshStandardMaterial({ color: PALETTE.mo, roughness: 0.7 }),
    );
    pole.position.y = PIN_H / 2;

    const seal = makeLabel(cat.glyph, { variant: 'seal', height: 0.03, cinnabar: `#${cat.color.toString(16).padStart(6, '0')}` });
    seal.position.y = PIN_H + 6;

    // 题签按序错开三档高度：松阳、景宁那几处村子挨得很近，不错开会叠成一团
    const label = makeLabel(spot.name, { height: 0.025 });
    label.position.y = PIN_H + 17 + (i % 3) * 16;

    const pick = new THREE.Mesh(
      new THREE.CylinderGeometry(13, 13, PIN_H + 20, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    pick.position.y = (PIN_H + 20) / 2;
    pick.userData.spotId = spot.id;

    pin.add(halo, pole, seal, label, pick);
    group.add(pin);
    // 印章是 sprite，基准 scale 很小（屏幕固定字号），放大时必须乘在基准上 ——
    // 直接 setScalar(1) 会把基准冲掉，印章会瞬间涨到糊住整屏。
    return { spot, pin, halo, pole, seal, sealScale: seal.scale.clone(), label, pick, color: cat.color };
  });
  return { group, entries };
}

/** 县名：墨字题签，比景点小一号、淡一档 */
export function buildTownLabels() {
  const group = new THREE.Group();
  group.name = 'towns';
  for (const town of TOWNS) {
    const label = makeLabel(town.name, {
      height: town.major ? 0.028 : 0.023,
      size: 36,
      paper: 'rgba(240,231,205,0.7)',
      edge: 'rgba(59,58,52,0.35)',
      ink: town.major ? '#7a2f22' : '#3b3a34',
    });
    label.position.set(lngToX(town.lng), surfaceY(town.lng, town.lat) + 8, latToZ(town.lat));
    group.add(label);
  }
  return group;
}

/** 行程缎带：站点连成一条平滑曲线，站点上放一枚编号印章 */
export function buildRoute(detail) {
  const group = new THREE.Group();
  group.name = `route-${detail.id}`;
  const pts = detail.stops.map((s) => new THREE.Vector3(lngToX(s.lng), surfaceY(s.lng, s.lat) + PIN_H * 0.5, latToZ(s.lat)));
  if (pts.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, pts.length * 26, 2.6, 8, false),
      new THREE.MeshStandardMaterial({ color: detail.color, roughness: 0.5, transparent: true, opacity: 0.9 }),
    );
    group.add(tube);
  }
  pts.forEach((p, i) => {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(4, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.6 }),
    );
    bead.position.copy(p);
    const num = makeLabel(`${i + 1}`, {
      variant: 'seal', height: 0.024, cinnabar: `#${detail.color.toString(16).padStart(6, '0')}`,
    });
    num.position.copy(p).add(new THREE.Vector3(0, 9, 0));
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
 * 拼出整张图，并对外留下「哪些景点可见 / 选中了谁 / 走哪条线」三个开关。
 * 地形和水面只造一次；筛选只改标记可见性，不重建几何。
 */
export function buildAtlas(spots) {
  const group = new THREE.Group();
  const terrain = buildTerrain();
  const base = buildBase(terrain.field);
  const water = buildWater();
  const boundary = buildBoundary();
  const towns = buildTownLabels();
  const markers = buildMarkers(spots);
  const routeHolder = new THREE.Group();
  group.add(terrain.mesh, base, water.group, boundary, towns, markers.group, routeHolder);

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
    /** Raycaster 不看 visible，所以可见标记自己筛一遍 */
    pickTargets: () => markers.entries.filter((e) => e.pin.visible).map((e) => e.pick),
    positionOf(id) {
      const e = byId.get(id);
      return e ? e.pin.position.clone() : null;
    },
    animate(t) {
      // 水面的波纹缓缓流动，是这张图上唯一"动"的东西，动得慢才像画
      water.ripple.offset.y = (t * 0.012) % 1;
      water.ripple.offset.x = Math.sin(t * 0.06) * 0.01;
      for (const e of markers.entries) {
        if (!e.pin.visible) continue;
        const selected = e.spot.id === selectedId;
        const hot = selected || e.spot.id === hoverId;
        const k = hot ? 1.3 : 1;
        e.seal.scale.set(e.sealScale.x * k, e.sealScale.y * k, 1);
        e.seal.position.y = PIN_H + 6 + (selected ? Math.sin(t * 2.6) * 2 : 0);
        const pulse = selected ? 1 + ((t * 0.85) % 1) * 1.7 : hot ? 1.2 : 1;
        e.halo.scale.setScalar(pulse);
        e.halo.material.opacity = selected ? 0.5 * (1 - ((t * 0.85) % 1)) + 0.18 : hot ? 0.6 : 0.4;
      }
    },
    dispose() {
      disposeTree(group);
      water.ripple.dispose();
    },
  };
}
