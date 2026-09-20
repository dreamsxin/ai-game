// 地图本体：地形、海面与各自高度的湖江、海岸墨线、印章式诗词标记、行迹缎带、地名山名。
// 配色走《千里江山图》的矿物色：平原绢黄赭石、丘陵石绿、高山石青，海是淡石绿罩石青。
// 只读 atlas/ 的纯数据，不反过来改它。

import * as THREE from 'three';
import {
  BBOX, MAP_WIDTH, MAP_DEPTH, MAP_SIZE, metersToUnits, wetToUnits,

  lngToX, latToZ, UNITS_PER_DEG_LNG,
} from '../atlas/projection.js';
import { buildHeightField, elevationAt, KIND } from '../atlas/terrain.js';
import { LAND, ISLANDS, LAKES, RIVERS, TOWNS, PEAKS } from '../atlas/geo.js';
import { themeOf, dynastyOf, PALETTE } from '../atlas/taxonomy.js';
import { clusterSpots, spotToCluster } from '../atlas/clusters.js';
import { LAND_RAMP, SEA_RAMP, WATER_SILK, WET_BED, rampHex } from '../atlas/palette.js';
import { makeLabel, makeRippleTexture, retitle } from './labels.js';


/** 地形网格密度。三十度经差摊在三百多列上，一格约三十公里 —— 再密采样就要跑过一秒 */
const COLS = 340;
const ROWS = 280;


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
    pos.setY(i, h < 0 ? wetToUnits(h) : metersToUnits(h));
    c.setHex(h < 0 ? rampHex(SEA_RAMP, h) : rampHex(LAND_RAMP, h));
    // 湖底河床往水色上靠一点，退水时也还看得出那里是水
    if (field.kinds[i] === KIND.LAKE || field.kinds[i] === KIND.RIVER) {
      c.lerp(new THREE.Color(WET_BED), 0.55);
    }

    // 同一色带里加一点抖动，避免大片色块发死
    const jitter = 0.955 + (((i * 2654435761) % 1000) / 1000) * 0.09;
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
  const floor = wetToUnits(Math.min(-10, field.minH)) - 40;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(MAP_WIDTH * 1.012, 46, MAP_DEPTH * 1.012),
    new THREE.MeshStandardMaterial({ color: 0xcdbb92, roughness: 0.98 }),
  );
  mesh.position.y = floor + 23;
  mesh.name = 'base';
  return mesh;
}

/** 某点地表在场景里的高度。水面上的点抬到水面之上，标记才不会插进水里 */
export function surfaceY(lng, lat) {
  const s = elevationAt(lng, lat);
  if (s.kind === KIND.SEA) return 0.8;
  if (s.kind === KIND.LAKE || s.kind === KIND.RIVER) return metersToUnits(s.surface ?? s.h) + 0.8;
  return metersToUnits(s.h);
}

/**
 * 水面。海、湖、江各在不同高度上，所以分三种造法：
 *   海 —— 沿网格取出四角全是海的格子，拼成一张零高度的面（整张大平面会盖住低地）
 *   湖 —— 每个湖一张椭圆面，摆在自己的 surface 上
 *   江 —— 每条江一条缎带，高度按节点水面线性插值
 */
export function buildWater(field) {
  const group = new THREE.Group();
  group.name = 'water';
  const ripple = makeRippleTexture();
  ripple.repeat.set(26, 22);
  const material = new THREE.MeshStandardMaterial({
    map: ripple, color: WATER_SILK, transparent: true, opacity: 0.88,
    roughness: 0.22, metalness: 0.08, side: THREE.DoubleSide,
  });


  group.add(buildSeaSurface(field, material));
  for (const lake of LAKES) group.add(lakeSurface(lake, material));
  for (const river of RIVERS) group.add(riverRibbon(river, material));
  return { group, material, ripple };
}

/** 海面：只铺在四角全为海的格子上 */
function buildSeaSurface(field, material) {
  const { cols, rows, kinds } = field;
  const positions = [];
  const uvs = [];
  const stepX = MAP_WIDTH / (cols - 1);
  const stepZ = MAP_DEPTH / (rows - 1);
  const x0 = -MAP_WIDTH / 2;
  const z0 = -MAP_DEPTH / 2;
  const wet = (i, j) => kinds[j * cols + i] === KIND.SEA;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      if (!wet(i, j) || !wet(i + 1, j) || !wet(i, j + 1) || !wet(i + 1, j + 1)) continue;
      const xa = x0 + i * stepX;
      const xb = xa + stepX;
      const za = z0 + j * stepZ;
      const zb = za + stepZ;
      positions.push(xa, 0, za, xb, 0, za, xa, 0, zb);
      positions.push(xb, 0, za, xb, 0, zb, xa, 0, zb);
      const u = i / (cols - 1);
      const v = j / (rows - 1);
      const du = 1 / (cols - 1);
      uvs.push(u, v, u + du, v, u, v + du, u + du, v, u + du, v + du, u, v + du);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 2;
  mesh.name = 'sea';
  return mesh;
}

/** 一个湖：椭圆面摆在自己的水面海拔上 */
function lakeSurface(lake, material) {
  const shape = new THREE.Shape();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = lngToX(lake.lng + Math.cos(a) * lake.rx);
    const z = latToZ(lake.lat + Math.sin(a) * lake.ry);
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = metersToUnits(lake.surface) + 0.5;
  mesh.renderOrder = 2;
  mesh.name = `lake-${lake.id}`;
  return mesh;
}

/**
 * 一条江：沿折线铺一条等宽的带。高度不直接取数据里的水面海拔，
 * 而是问 elevationAt 要"切完之后的水面" —— 地形那边会把水面压到不高过两岸，
 * 两处各算一遍就会错开，缎带浮在河谷之上。
 */
function riverRibbon(river, material) {
  const pts = river.pts;
  const left = [];
  const right = [];
  const halfW = (river.width / 2) * UNITS_PER_DEG_LNG;
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
    const here = elevationAt(pts[i][0], pts[i][1]);
    const y = metersToUnits(here.surface ?? pts[i][2]) + 0.5;

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
  mesh.renderOrder = 3;
  mesh.name = `river-${river.id}`;
  return mesh;
}

const EPS = 0.002;
const onFrame = ([lng, lat]) =>
  lng <= BBOX.minLng + EPS || lng >= BBOX.maxLng - EPS
  || lat <= BBOX.minLat + EPS || lat >= BBOX.maxLat - EPS;

/**
 * 海岸墨线。LAND 这一圈里有一半是图框，只给真正的海岸勾线 ——
 * 沿图框也描一道的话，整张画会被框成一个方块，留白就没了。
 * 线用 TubeGeometry 而不是 LineBasicMaterial：一像素的线在这个尺度上根本看不见。
 */
export function buildCoast() {
  const group = new THREE.Group();
  group.name = 'coast';
  const material = new THREE.MeshBasicMaterial({ color: PALETTE.mo, transparent: true, opacity: 0.5 });
  const runs = [];
  let run = [];
  for (const p of LAND) {
    if (onFrame(p)) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) runs.push(run);
  for (const isle of ISLANDS) runs.push([...isle.ring, isle.ring[0]]);

  for (const line of runs) {
    const pts = line.map(([lng, lat]) => new THREE.Vector3(lngToX(lng), 1.6, latToZ(lat)));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 5, 1.6, 5, false), material));
  }
  return group;
}

/**
 * 印章的杆高。四档交错，让挤在一处的印章分层错开 ——
 * 关键是**按经度排序之后再轮换**，而不是按数据表里的顺序：
 * 表是按作者排的，金陵一带几处地方在表里前后隔得很远，
 * 照表序轮换等于随机发牌，几百首下来江南准会叠成一团。
 */
const PIN_H = [38, 54, 70, 86];

const pinTiers = (clusters) => {
  const tier = new Map();
  [...clusters]
    .sort((a, b) => a.lng - b.lng || a.lat - b.lat)
    .forEach((c, i) => tier.set(c.id, PIN_H[i % PIN_H.length]));
  return tier;
};


/**
 * 题签上的诗名要短。"破阵子·为陈同甫赋壮词以寄之"整着写出来是一条二百多像素的横幅，
 * 十几首这样的诗就能把江南糊成一堵字墙。词曲有词牌曲牌，截到牌名正好还认得出；
 * 但牌名短过三个字就不行了（"哨遍"两个字谁也猜不出是《高祖还乡》），
 * 这种连没有间隔号的长题一起硬截，后面用省略号交代还有下文。全名在详情卡里，不会丢。
 */
export function briefTitle(name, max = 8) {
  if (name.length <= max) return name;
  const head = name.split('·')[0];
  if (head.length >= 3 && head.length <= max) return `${head}…`;
  return `${name.slice(0, max - 1)}…`;
}

/** 一处地方的题签：只有一首就写诗名，不止一首就写"地名 · N 首" */
const labelOf = (cluster, visible) => (
  visible.length === 1
    ? `${briefTitle(visible[0].name)}·${visible[0].author}`
    : `${cluster.place} · ${visible.length} 首`
);


/** 藏一个实例：三没有逐实例的 visible，把矩阵压成零体积并挪到图外是最省的办法 */
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -1e5, 0);

/**
 * 诗词标记：一处地方一根墨色细杆，顶上一枚印章（印色按朝代、印文按主题），
 * 地面一圈主题色的晕，杆边一块绢色题签。
 *
 * 晕圈、杆、拾取体都用 InstancedMesh：**印章数量要能上到几百枚**，
 * 一处一个 Mesh 的话光这三样就是上千个 draw call。sprite 没法实例化，
 * 所以题签与印章仍是一处一个 —— 但它们有避让和距离上限兜着，多半是隐藏的。
 * 拾取体做成一个 InstancedMesh 之后 raycast 只需要打一个对象，返回 instanceId。
 */
export function buildMarkers(clusters) {
  const group = new THREE.Group();
  group.name = 'marks';
  const tier = pinTiers(clusters);
  const n = clusters.length;

  const haloMesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(5, 11, 28),
    new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false,
    }),
    n,
  );
  const poleMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.9, 0.9, 1, 6),
    new THREE.MeshStandardMaterial({ color: PALETTE.mo, roughness: 0.7 }),
    n,
  );
  const pickMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(12, 12, 1, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    n,
  );
  pickMesh.userData.clusterIds = clusters.map((c) => c.id);
  group.add(haloMesh, poleMesh, pickMesh);

  // 选中／悬停那一枚的晕圈单独做一个 Mesh：它要脉动，而实例化的那批是画死的
  const hotHalo = new THREE.Mesh(
    new THREE.RingGeometry(5, 11, 28),
    new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  hotHalo.rotation.x = -Math.PI / 2;
  hotHalo.visible = false;
  group.add(hotHalo);

  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  const entries = clusters.map((cluster, i) => {
    const theme = themeOf(cluster.theme);
    const dyn = dynastyOf(cluster.dynasty);
    const h = tier.get(cluster.id);
    const base = new THREE.Vector3(
      lngToX(cluster.lng), surfaceY(cluster.lng, cluster.lat), latToZ(cluster.lat),
    );

    haloMesh.setMatrixAt(i, m.makeRotationX(-Math.PI / 2).setPosition(base.x, base.y + 1.2, base.z));
    haloMesh.setColorAt(i, color.set(theme.color));
    poleMesh.setMatrixAt(i, m.makeScale(1, h, 1).setPosition(base.x, base.y + h / 2, base.z));
    pickMesh.setMatrixAt(i, m.makeScale(1, h + 22, 1).setPosition(base.x, base.y + (h + 22) / 2, base.z));

    // 一处地方压着几十首诗时，印章要大一点 —— 分量看得见，才知道这里值得点开
    const weight = 1 + Math.min(0.55, (cluster.spots.length - 1) * 0.07);
    const seal = makeLabel(theme.glyph, {
      variant: 'seal', height: 0.028 * weight,
      cinnabar: `#${dyn.color.toString(16).padStart(6, '0')}`,
    });
    seal.position.set(base.x, base.y + h + 7, base.z);

    const label = makeLabel(labelOf(cluster, cluster.spots), { height: 0.0225 });
    label.position.set(base.x, base.y + h + 20, base.z);

    group.add(seal, label);
    // 印章是 sprite，基准 scale 很小（屏幕固定字号），放大时必须乘在基准上 ——
    // 直接 setScalar(1.3) 会把基准冲掉，印章会瞬间涨到糊住整屏。
    return {
      cluster, index: i, base, poleH: h, color: theme.color,
      seal, sealScale: seal.scale.clone(), label,
      visible: cluster.spots, shown: true,
    };
  });
  haloMesh.instanceMatrix.needsUpdate = true;
  poleMesh.instanceMatrix.needsUpdate = true;
  pickMesh.instanceMatrix.needsUpdate = true;
  if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;

  /** 按筛选结果重排：藏掉整处都不在结果里的，并把还剩几首写回题签 */
  const applyVisible = (keep) => {
    for (const e of entries) {
      const visible = keep ? e.cluster.spots.filter((s) => keep.has(s.id)) : e.cluster.spots;
      const changed = visible.length !== e.visible.length;
      e.visible = visible;
      e.shown = visible.length > 0;
      if (!e.shown) {
        haloMesh.setMatrixAt(e.index, HIDDEN);
        poleMesh.setMatrixAt(e.index, HIDDEN);
        pickMesh.setMatrixAt(e.index, HIDDEN);
        continue;
      }
      if (changed) {
        retitle(e.label, labelOf(e.cluster, visible), { height: 0.0225 });
      }
      const h = e.poleH;
      haloMesh.setMatrixAt(e.index, m.makeRotationX(-Math.PI / 2).setPosition(e.base.x, e.base.y + 1.2, e.base.z));
      poleMesh.setMatrixAt(e.index, m.makeScale(1, h, 1).setPosition(e.base.x, e.base.y + h / 2, e.base.z));
      pickMesh.setMatrixAt(e.index, m.makeScale(1, h + 22, 1).setPosition(e.base.x, e.base.y + (h + 22) / 2, e.base.z));
    }
    haloMesh.instanceMatrix.needsUpdate = true;
    poleMesh.instanceMatrix.needsUpdate = true;
    pickMesh.instanceMatrix.needsUpdate = true;
  };

  return { group, entries, haloMesh, poleMesh, pickMesh, hotHalo, applyVisible };
}


/** 古地名：墨字题签，都城用朱字 */
export function buildTownLabels() {
  const group = new THREE.Group();
  group.name = 'towns';
  const entries = [];
  for (const town of TOWNS) {
    const label = makeLabel(town.name, {
      height: town.major ? 0.026 : 0.0205,
      size: 34,
      paper: 'rgba(240,231,205,0.62)',
      edge: 'rgba(59,58,52,0.3)',
      ink: town.major ? '#8e2f20' : '#3b3a34',
    });
    label.position.set(lngToX(town.lng), surfaceY(town.lng, town.lat) + 10, latToZ(town.lat));
    group.add(label);
    entries.push({ sprite: label, rank: town.major ? 3 : 4, wanted: true, reach: 2.6 });

  }
  return { group, entries };
}

/** 名山标高：诗里"会当凌绝顶"到底多高，写上去比一片绿好读 */
export function buildPeakLabels() {
  const group = new THREE.Group();
  group.name = 'peaks';
  const entries = [];
  for (const peak of PEAKS) {
    const label = makeLabel(`▲${peak.name} ${peak.h}`, {
      height: 0.0175, size: 28,
      paper: 'rgba(232,222,193,0.5)',
      edge: 'rgba(59,58,52,0.22)',
      ink: '#4a4536',
    });
    label.position.set(lngToX(peak.lng), surfaceY(peak.lng, peak.lat) + 16, latToZ(peak.lat));
    group.add(label);
    entries.push({ sprite: label, rank: 5, wanted: true, reach: 2.6 });

  }
  return { group, entries };
}

/** 行迹缎带：一位诗人走过的站点连成一条平滑曲线，站上放一枚编号印章 */
export function buildRoute(detail) {
  const group = new THREE.Group();
  group.name = `route-${detail.id}`;
  const pts = detail.stops.map((s) => new THREE.Vector3(
    lngToX(s.lng), surfaceY(s.lng, s.lat) + 34, latToZ(s.lat),
  ));
  if (pts.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.22);
    group.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, pts.length * 24, 2.4, 8, false),
      new THREE.MeshStandardMaterial({
        color: detail.color, roughness: 0.5, transparent: true, opacity: 0.92,
      }),
    ));
  }
  pts.forEach((p, i) => {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.6 }),
    );
    bead.position.copy(p);
    const num = makeLabel(`${i + 1}`, {
      variant: 'seal', height: 0.022,
      cinnabar: `#${detail.color.toString(16).padStart(6, '0')}`,
    });
    num.position.copy(p).add(new THREE.Vector3(0, 11, 0));
    group.add(bead, num);
  });
  return group;
}

/**
 * 屏幕空间避让：把所有题签按优先级排队，投影到屏幕上，压到别人身上的先不显示。
 * 七十多首诗加古地名、名山，全卷视角下不避让就是一堵字墙 ——
 * 纸质地图一百年前就在做这件事，只是这里每帧重算一次。
 */
function declutter(entries, camera, width, height, camDist) {
  const v = new THREE.Vector3();
  const placed = [];
  const rows = [];
  // 太远的题签不摆：飞到江南之后，幽州、泰山、沛县仍落在视锥里，
  // 于是一排北方的诗名会贴在画面顶端的地平线上，跟眼前这一带毫无关系。
  // 门槛按镜头距离算，而且诗名比地名收得紧得多 ——
  // 地图上远处出现古地名是常态（那是方位感），远处冒出一句诗名却只是噪声。
  const reach = (e) => (camDist > 0 ? camDist * e.reach : Infinity);
  for (const e of entries) {
    if (!e.wanted) {
      e.sprite.visible = false;
      continue;
    }
    e.sprite.getWorldPosition(v);
    const dist = v.distanceTo(camera.position);
    if (dist > reach(e)) {
      e.sprite.visible = false;
      continue;
    }
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

const disposeTree = (obj) => {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mat = o.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
};

/**
 * 拼出整张图，并对外留下「显示哪些诗 / 选中了谁 / 走哪条行迹 / 要不要题签」四个开关。
 * 地形和水面只造一次；筛选只改印章的可见性与题签上的数目，不重建几何。
 *
 * 对外的 id 仍然一律是**诗的 id**（App 不必知道有"堆"这回事）；
 * 堆只在这一层里存在，拾取时再把 instanceId 翻回诗的 id。
 */
export function buildAtlas(spots) {
  const group = new THREE.Group();
  const terrain = buildTerrain();
  const base = buildBase(terrain.field);
  const water = buildWater(terrain.field);
  const coast = buildCoast();
  const towns = buildTownLabels();
  const peaks = buildPeakLabels();
  const clusters = clusterSpots(spots);
  const markers = buildMarkers(clusters);
  const routeHolder = new THREE.Group();
  group.add(terrain.mesh, base, water.group, coast, towns.group, peaks.group, markers.group, routeHolder);

  const clusterOf = spotToCluster(clusters);
  const byCluster = new Map(markers.entries.map((e) => [e.cluster.id, e]));
  const entryOf = (spotId) => {
    const cluster = clusterOf.get(spotId);
    return cluster ? byCluster.get(cluster.id) : null;
  };
  // 避让优先级：选中 > 悬停 > 诗词 > 都城 > 州县 > 山峰
  const spotLabels = markers.entries.map((e) => ({ sprite: e.label, rank: 2, wanted: true, reach: 1.35, entry: e }));

  const labelEntries = [...spotLabels, ...towns.entries, ...peaks.entries];

  let routeGroup = null;
  let selectedId = null;
  let hoverId = null;
  let showLabels = true;
  let onRoute = new Set();
  // 全卷视角下几百首诗的题签就是一堵字墙，避让只能让它变成"几百首里随机的三十首"。
  // 所以远看只留印章（副标题写的正是"点印章读诗"），走近了、点中了、或者它在当前行迹上
  // 才把诗名铺开 —— 古地名与山名一直留着，那是远看时唯一需要读的字。
  let farView = true;

  const isHot = (e) => (
    (selectedId && clusterOf.get(selectedId) === e.cluster)
    || (hoverId && clusterOf.get(hoverId) === e.cluster)
  );

  const refreshLabels = () => {
    for (const s of spotLabels) {
      const hot = isHot(s.entry);
      const near = !farView || hot || s.entry.cluster.spots.some((sp) => onRoute.has(sp.id));
      s.wanted = s.entry.shown && near && (showLabels || hot);
      s.rank = hot ? 0 : 2;
    }
    for (const t of towns.entries) t.wanted = showLabels;
    for (const p of peaks.entries) p.wanted = showLabels;
  };
  refreshLabels();


  return {
    group,
    terrain,
    clusters,
    entries: markers.entries,
    setVisibleSpots(ids) {
      const keep = ids instanceof Set ? ids : new Set(ids);
      markers.applyVisible(keep);
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
      onRoute = new Set(detail ? detail.stops.map((s) => s.id) : []);
      refreshLabels();
      if (detail) {
        routeGroup = buildRoute(detail);
        routeHolder.add(routeGroup);
      }
    },
    /** 拾取只需要打一个 InstancedMesh；藏起来的那些实例被压成了零体积，打不中 */
    pickTargets: () => [markers.pickMesh],
    /** instanceId → 这一处叫什么、压着哪几首。一处压着好几首时，交给上层去列 */
    spotsAtInstance(instanceId) {
      const id = markers.pickMesh.userData.clusterIds[instanceId];
      const e = id ? byCluster.get(id) : null;
      if (!e || !e.shown) return { place: '', spots: [] };
      return { place: e.cluster.place, spots: e.visible };
    },

    positionOf(id) {
      const e = entryOf(id);
      return e ? e.base.clone() : null;
    },
    layout(camera, width, height, camDist = 0) {
      const far = camDist > MAP_SIZE * 0.42;
      if (far !== farView) {
        farView = far;
        refreshLabels();
      }
      declutter(labelEntries, camera, width, height, camDist);

    },

    animate(t) {
      // 水波缓缓流动，是这张图上唯一"动"的东西，动得慢才像画
      water.ripple.offset.y = (t * 0.01) % 1;
      water.ripple.offset.x = Math.sin(t * 0.05) * 0.008;
      const hot = entryOf(selectedId) ?? entryOf(hoverId);
      for (const e of markers.entries) {
        if (!e.shown) continue;
        const k = e === hot ? 1.3 : 1;
        e.seal.scale.set(e.sealScale.x * k, e.sealScale.y * k, 1);
        e.seal.position.y = e.base.y + e.poleH + 7
          + (e === hot && selectedId ? Math.sin(t * 2.6) * 2.4 : 0);
      }
      // 脉动的晕圈只有一个，挪到当前那一枚印章底下去
      const halo = markers.hotHalo;
      halo.visible = Boolean(hot && hot.shown);
      if (halo.visible) {
        halo.position.set(hot.base.x, hot.base.y + 1.4, hot.base.z);
        halo.material.color.set(hot.color);
        const selected = Boolean(selectedId) && entryOf(selectedId) === hot;
        halo.scale.setScalar(selected ? 1 + ((t * 0.85) % 1) * 1.8 : 1.25);
        halo.material.opacity = selected ? 0.52 * (1 - ((t * 0.85) % 1)) + 0.2 : 0.62;
      }
    },
    dispose() {
      disposeTree(group);
      water.ripple.dispose();
    },
  };
}




