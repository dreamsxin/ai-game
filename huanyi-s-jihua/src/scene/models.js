// 模型工厂：这一版所有东西都是程序生成的低多边形体，不引任何第三方素材。
//
// 两条贯穿全文件的约定：
// 1. **朝向**：-Z 是远方（敌人来的方向），+Z 是近处（屏幕下方）。所以战机的尖端指 -Z，
//    俯冲机的锥尖指 +Z（它正扑向你）。
// 2. **相机是固定的**，所以要「正对镜头」的东西（血条、文字）只要绕 X 转一个常数就行，
//    不用每帧做 billboard。这个常数就是 BILLBOARD_X。

import * as THREE from 'three';
import { HAZARD, TIER_COLOR } from './palette.js';
import { TILT } from './view.js';

const RAD = Math.PI / 180;

/** 正对镜头要转的角度。相机俯角定死，所以这是一个常数而不是每帧的计算。 */
export const BILLBOARD_X = -TILT * RAD;

const flat = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(opts.emissive ?? color),
    emissiveIntensity: opts.glow ?? 0.34,
    roughness: opts.roughness ?? 0.42,
    metalness: opts.metalness ?? 0.3,
    flatShading: true,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });

const glowMat = (color, opacity = 0.9) =>
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

/** 池子：用多少露多少，剩下的藏起来。每帧 begin / take… / end。 */
export function createPool(parent, factory) {
  const items = [];
  let used = 0;
  return {
    begin() {
      used = 0;
    },
    take() {
      if (used >= items.length) {
        const made = factory();
        parent.add(made);
        items.push(made);
      }
      const item = items[used];
      used += 1;
      item.visible = true;
      return item;
    },
    end() {
      for (let i = used; i < items.length; i += 1) items[i].visible = false;
    },
    dispose() {
      for (const item of items) parent.remove(item);
      items.length = 0;
    },
  };
}

const textureCache = new Map();

/**
 * 一点点辉光贴图，火花和敌弹的光晕都用它。
 *
 * 这个文件里**没有任何文字**：斜俯视下道具约 20 像素、运载火箭约 30 像素，
 * 把字做成贴图缩到那个尺寸只会是一团糊的方块（试过 128 贴图、加描边、抬到壳外，都糊）。
 * 所有文字改由 `render.js` 的 2D 叠层按投影位置画成原生分辨率的字。
 */
export function glowTexture() {
  const hit = textureCache.get('#glow');
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set('#glow', texture);
  return texture;
}

// ---- 玄鸟：空天战机的外形 ----
//
// 参照南天门计划里那架空天战机（玄鸟）的几个识别特征，全部用程序生成：
// 乘波体（腹部是一整块平底，靠激波托着走）、翼身融合的边条、背脊、双外倾垂尾、尾部三喷口。
// 「玄」是黑：机身本体压到近黑的石墨色，靠**边缘灯带**和尾焰把轮廓亮出来——
// 纯黑机身在同样暗的栅格地面上会直接消失，所以这一版的可读性全靠那圈亮边。

// 机身的横截面：z 是纵向（-Z 是机头方向），w 半宽，top/bot 是脊背与腹面。
// 从机头一路放大到机翼交汇处再收进尾喷口，这条曲线就是乘波体的侧影。
const HULL_SECTIONS = [
  { z: -6.4, w: 0.18, top: 0.14, bot: -0.1 },
  { z: -4.6, w: 0.85, top: 0.55, bot: -0.42 },
  { z: -2.4, w: 1.65, top: 1.05, bot: -0.64 },
  { z: 0.2, w: 2.35, top: 1.42, bot: -0.8 },
  { z: 2.6, w: 2.0, top: 1.15, bot: -0.68 },
  { z: 4, w: 1.45, top: 0.78, bot: -0.5 },
];

// 一圈八个点：脊背、上肩、边条（最宽处，乘波体的那道锐边）、下肩、腹心，左右对称。
const hullRing = ({ w, top, bot, z }) =>
  [
    [0, top],
    [w * 0.6, top * 0.62],
    [w, 0.02],
    [w * 0.6, bot * 0.86],
    [0, bot],
    [-w * 0.6, bot * 0.86],
    [-w, 0.02],
    [-w * 0.6, top * 0.62],
  ].map(([x, y]) => [x, y, z]);

/** 把横截面一环一环缝成机身。面朝哪边不讲究——材质开了双面，缝反也不会露洞。 */
function hullGeometry() {
  const rings = HULL_SECTIONS.map(hullRing);
  const position = [];
  const push = (point) => position.push(point[0], point[1], point[2]);
  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i];
    const b = rings[i + 1];
    for (let k = 0; k < a.length; k += 1) {
      const n = (k + 1) % a.length;
      push(a[k]);
      push(b[k]);
      push(b[n]);
      push(a[k]);
      push(b[n]);
      push(a[n]);
    }
  }
  // 机头与机尾各封一个口。
  for (const [section, ring] of [
    [HULL_SECTIONS[0], rings[0]],
    [HULL_SECTIONS.at(-1), rings.at(-1)],
  ]) {
    const center = [0, (section.top + section.bot) / 2, section.z];
    for (let k = 0; k < ring.length; k += 1) {
      const n = (k + 1) % ring.length;
      push(center);
      push(ring[n]);
      push(ring[k]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** 大后掠三角翼。翼展仍然是 12.8 格——这条不能动，它等于受击面积。 */
function wingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(1.4, -2.6);
  shape.lineTo(6.4, 1.4);
  shape.lineTo(6.4, 2.5);
  shape.lineTo(1.4, 3.3);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
  // 在 XY 平面画的平面图，转到水平：shape 的 y 就成了世界的 z（往机尾为正）。
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.28, 0);
  return geometry;
}

/**
 * 边条灯带：沿着机身最宽处那道锐边（乘波体的 chine）铺一条会发光的薄带。
 * 为什么不用 `LineSegments`：WebGL 里线宽恒为 1 像素，斜俯视下那一像素等于没画——
 * 第一版就是靠线画轮廓，截图上整架飞机糊成一团黑。薄带是实体，会跟着透视一起缩放。
 */
function chineGeometry() {
  const position = [];
  const push = (x, y, z) => position.push(x, y, z);
  const rib = 0.17;
  for (const side of [-1, 1]) {
    for (let i = 0; i < HULL_SECTIONS.length - 1; i += 1) {
      const a = HULL_SECTIONS[i];
      const b = HULL_SECTIONS[i + 1];
      const ax = side * a.w;
      const bx = side * b.w;
      // 一段薄带：上下各一条边，两个三角。
      push(ax, rib, a.z);
      push(ax, -rib, a.z);
      push(bx, -rib, b.z);
      push(ax, rib, a.z);
      push(bx, -rib, b.z);
      push(bx, rib, b.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// 几何体全场共用一份：机身、残影、分身都是同一架飞机。
const HULL_GEOMETRY = hullGeometry();
const WING_GEOMETRY = wingGeometry();
const CHINE_GEOMETRY = chineGeometry();

const edgeGlow = () => glowMat('#7fe3ff', 0.9);

/**
 * 战机。机翼是**单独一层**（group.userData.wing），因为「有没有翅膀」是这游戏最关键的一位信息：
 * 带翼的机身更宽，那多出来的一截正是多出来的受击面积。
 */
export function makeShip({ ghost = false } = {}) {
  const group = new THREE.Group();
  const mats = [];

  if (ghost) {
    // 残影与量子分身只留轮廓：一具半透明的玄鸟，比实体更省也更像「不在这儿」。
    const shade = glowMat('#7fe3ff', 0.3);
    const body = new THREE.Mesh(HULL_GEOMETRY, shade);
    body.material.side = THREE.DoubleSide;
    group.add(body);
    const outline = glowMat('#bff4ff', 0.5);
    group.add(new THREE.Mesh(CHINE_GEOMETRY, outline));
    const wing = new THREE.Group();
    const tips = [];
    const pips = [];
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(WING_GEOMETRY, shade);
      panel.scale.x = side;
      wing.add(panel);
    }
    group.add(wing);
    const plume = new THREE.Group();
    group.add(plume);
    // 分身也要有护盾环：渲染层对本体和分身走同一套上色逻辑，这里给个 Group 会当场崩。
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.3, 6, 32), glowMat('#7fe3ff', 0.4));
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    mats.push(shade, outline);
    group.userData = { wing, tips, pips, flame: plume, ring, mats };
    return group;
  }

  // 机身：深石墨蓝。「玄」是黑，但纯黑在同样暗的栅格地面上会直接消失，
  // 所以本体压暗、自发光给足，真正把轮廓亮出来的是下面那两条边条灯带。
  const hullMat = flat('#38456b', { emissive: '#2a3a72', glow: 0.85, metalness: 0.55, roughness: 0.34, opacity: 1 });
  hullMat.side = THREE.DoubleSide;
  mats.push(hullMat);
  group.add(new THREE.Mesh(HULL_GEOMETRY, hullMat));

  // 边条灯带：沿着乘波体那道锐边，从机头一直亮到尾喷口。
  const edgeMat = glowMat('#7fe3ff', 0.95);
  mats.push(edgeMat);
  group.add(new THREE.Mesh(CHINE_GEOMETRY, edgeMat));

  // 座舱盖压得很低，和背脊连成一条线。
  const canopyMat = flat('#8ff0ff', { glow: 1.4, metalness: 0.2, opacity: 1 });
  mats.push(canopyMat);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), canopyMat);
  canopy.scale.set(1, 0.8, 2.1);
  canopy.position.set(0, 1.15, -2.1);
  group.add(canopy);

  // 腹部进气道：乘波体的平底上开一道亮缝。
  const intakeMat = glowMat('#4f7bff', 0.55);
  mats.push(intakeMat);
  const intake = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 2.6), intakeMat);
  intake.position.set(0, -0.82, 0.6);
  group.add(intake);

  // 双外倾垂尾：弃翼之后它们还在，所以「裸机」仍然是一架飞机而不是一块砖。
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.3, 2.4), hullMat);
    fin.position.set(side * 1.5, 1.15, 3);
    fin.rotation.z = side * 0.42;
    fin.rotation.x = -0.12;
    group.add(fin);
    const finEdge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 2.5), edgeGlow());
    finEdge.position.set(side * 2.05, 2.2, 3);
    finEdge.rotation.z = side * 0.42;
    finEdge.rotation.x = -0.12;
    mats.push(finEdge.material);
    group.add(finEdge);
  }

  // 组合循环发动机：三个喷口，中间那个抬在背脊上。
  const nozzleMat = flat('#2a3350', { glow: 0.3, metalness: 0.8, opacity: 1 });
  mats.push(nozzleMat);
  const plume = new THREE.Group();
  const plumeSpots = [
    [-0.95, -0.05, 0],
    [0.95, -0.05, 0],
    [0, 0.85, -0.3],
  ];
  for (const [x, y, z] of plumeSpots) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 1.1, 8), nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(x, y, 4.1 + z);
    group.add(nozzle);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 8), glowMat('#8fd4ff', 0.9));
    fire.rotation.x = Math.PI / 2;
    fire.position.set(x, y, 1.7);
    plume.add(fire);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 6), glowMat('#ffffff', 0.85));
    core.rotation.x = Math.PI / 2;
    core.position.set(x, y, 1);
    plume.add(core);
  }
  plume.position.z = 4.6;
  group.add(plume);

  // 机翼层：两片大后掠翼加翼尖灯与挂舱。阶级越高翼尖越亮。
  const wing = new THREE.Group();
  const panelMat = flat('#3c4c7d', { emissive: '#2d3f84', glow: 0.8, metalness: 0.5, opacity: 1 });
  // **必须双面**。两处都会把面翻过去：ExtrudeGeometry 转平之后朝上的是它的背面盖，
  // 而左翼是靠 scale.x = -1 镜像出来的（负缩放同样翻绕序）。
  // 单面材质下这两片翼会被整片剔掉——斜俯视下就是「战机没有机翼」，而判定里它明明还在。
  panelMat.side = THREE.DoubleSide;
  mats.push(panelMat);
  const leadMat = glowMat('#7fe3ff', 0.75);
  mats.push(leadMat);
  const tips = [];
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(WING_GEOMETRY, panelMat);
    panel.scale.x = side;
    wing.add(panel);

    // 前缘灯带：翼型在斜俯视下靠这条亮线读出后掠角。
    const lead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 6.4), leadMat);
    lead.position.set(side * 3.9, 0.32, -0.6);
    lead.rotation.y = side * 0.896;
    wing.add(lead);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.6), flat(TIER_COLOR[0], { glow: 1.6, opacity: 1 }));
    tip.position.set(side * 6.15, 0.3, 0.9);
    mats.push(tip.material);
    wing.add(tip);
    tips.push(tip);

    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 3.2, 6), panelMat);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 3.9, -0.35, 0.9);
    wing.add(pod);
  }
  // 阶级用三颗灯珠表示，不用文字：机身在斜俯视下只有十几个像素高，字一定糊成一团白块
  // （第一版真的在机翼上刻了 C 和 III，截图上就是两个白斑）。灯珠亮几颗，任何尺寸都读得出来。
  const pips = [];
  for (let i = 0; i < 3; i += 1) {
    const pip = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.75), flat(TIER_COLOR[0], { glow: 1.8, opacity: 1 }));
    pip.position.set((i - 1) * 1.3, 1.05, 2.5);
    mats.push(pip.material);
    wing.add(pip);
    pips.push(pip);
  }
  group.add(wing);

  // 两种无敌看得出区别：挨打换来的是白环，弃翼换来的下潜是蓝环。
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.35, 6, 40), glowMat('#f6f4ee', 0.8));
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  group.userData = { wing, tips, pips, flame: plume, ring, mats };
  return group;
}

/** 相位残影：下潜时拖在身后的一串半透明机身，本身就是「现在打不到我」。 */
export function makeGhostHull() {
  const mesh = new THREE.Mesh(HULL_GEOMETRY, glowMat('#7fe3ff', 0.26));
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

const ENEMY_ART = {
  zako: { body: '#6b7bff', trim: '#c7d0ff' },
  diver: { body: '#ff7a3c', trim: '#ffd0b0' },
  turret: { body: '#9a5cff', trim: '#e2ccff' },
  ground: { body: '#b07a34', trim: '#ffd88a' },
  carrier: { body: '#ffc21f', trim: '#fff2b8' },
  wall: { body: '#48607e', trim: '#9fc0e6' },
};

/** 六种敌人六种轮廓：形状比颜色更早被认出来，远处那一半靠的就是轮廓。 */
export function makeEnemy(kind) {
  const art = ENEMY_ART[kind] ?? ENEMY_ART.zako;
  const group = new THREE.Group();
  // 敌人要在发光的地面上认得出来，所以自发光给得比机身高（第一版 0.42，远处读成一团灰）。
  const body = flat(art.body, { glow: 0.85, roughness: 0.34 });
  const trim = flat(art.trim, { glow: 1.25 });
  let spin = null;

  if (kind === 'zako') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(3.2), body);
    group.add(core);
    spin = core;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.26, 5, 12), trim);
    belt.rotation.x = -Math.PI / 2;
    group.add(belt);
  } else if (kind === 'diver') {
    // 锥尖朝 +Z：它正扑向你。
    const core = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7, 5), body);
    core.rotation.x = Math.PI / 2;
    group.add(core);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.8), trim);
      fin.position.set(side * 2.2, 0, -1.8);
      group.add(fin);
    }
  } else if (kind === 'turret') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4, 2.6, 8), body);
    group.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), trim);
    dome.position.y = 1.2;
    group.add(dome);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 4, 6), trim);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.8, 2.4);
    group.add(barrel);
    spin = dome;
  } else if (kind === 'ground') {
    // 贴地堡垒：矮、宽、压在地上。平射会从它头上飞过去，只有炸弹打得着。
    const slab = new THREE.Mesh(new THREE.BoxGeometry(9, 2.4, 7), body);
    group.add(slab);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 2, 6), trim);
    cap.position.y = 2;
    group.add(cap);
  } else if (kind === 'carrier') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(8, 4.6, 12), body);
    group.add(hull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 6), trim);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 8;
    group.add(nose);
    // 它装的是哪一型：由 2D 叠层按投影位置写在它上方（世界里的字一定糊）。
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, 4), trim);
    fin.position.set(0, 3.4, -3);
    group.add(fin);
  } else {
    const block = new THREE.Mesh(new THREE.BoxGeometry(11, 7, 8), body);
    group.add(block);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.2, 8.4), trim);
    edge.position.y = 3.2;
    group.add(edge);
  }

  // 血条正对镜头。相机不动，所以这个角度是常数。
  const barBack = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), glowMat('#000000', 0.5));
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), glowMat(HAZARD.warm, 0.95));
  barBack.rotation.x = BILLBOARD_X;
  bar.rotation.x = BILLBOARD_X;
  barBack.position.set(0, 6, 0);
  bar.position.set(0, 6, 0.05);
  group.add(barBack);
  group.add(bar);

  group.userData = { ...group.userData, spin, bar, barBack, art };
  return group;
}

/**
 * Boss。弱点环是这一具模型上最重要的零件：它是关卡简报里那句话的画面形态。
 * 环按 weakSpots() 给的位置摆，所以「弱点在哪」永远和判定一致。
 */
export function makeBoss() {
  const group = new THREE.Group();
  const shellMat = flat('#2f4fb0', { glow: 0.55, metalness: 0.55 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellMat);
  group.add(shell);

  const plates = [];
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), flat('#8fa6d8', { glow: 0.4, metalness: 0.7 }));
    plates.push(plate);
    group.add(plate);
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), flat('#c3d2ff', { glow: 0.5 }));
  group.add(crown);
  // 正面那道光边：Boss 体型大、颜色又暗，没有这道边它在夜色地面上就是一块方砖。
  const rimMat = glowMat(HAZARD.cool, 0.85);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rimMat);
  group.add(rim);

  const spots = [];
  for (let i = 0; i < 2; i += 1) {
    const spot = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.5, 8, 24), glowMat(HAZARD.gold, 0.95));
    const core = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 10), glowMat(HAZARD.gold, 0.4));
    ring.rotation.x = BILLBOARD_X;
    spot.add(ring);
    spot.add(core);
    spot.userData = { ring, core };
    spot.visible = false;
    group.add(spot);
    spots.push(spot);
  }

  group.userData = { shell, shellMat, plates, crown, rim, rimMat, spots };
  return group;
}

/** 菱形道具。能不能打进本关弱点直接写在它身上：能的描金环，不能的整枚压暗。 */
export function makeDrop() {
  const group = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(4.2), flat(HAZARD.gold, { glow: 0.8 }));
  group.add(gem);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.4, 6, 24), glowMat(HAZARD.gold, 0.95));
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);
  // 型号与阶级由 2D 叠层写在它上方：道具在屏幕上只有二十像素，贴图文字必糊。
  group.userData = { gem, halo };
  return group;
}

/** 跳关门：一道发光的框。撞进去省 4 关，但跳过去的 Boss 一点没削弱。 */
export function makeGate() {
  const group = new THREE.Group();
  const frameMat = glowMat(HAZARD.cool, 0.95);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 1.2), frameMat);
    post.position.set(side, 5, 0);
    post.userData.side = side;
    group.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1.2), frameMat);
  lintel.position.y = 10;
  group.add(lintel);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat(HAZARD.cool, 0.2));
  veil.rotation.x = BILLBOARD_X;
  veil.position.y = 5;
  group.add(veil);
  // 「跳关」两个字由 2D 叠层写在门框上方。
  group.userData = { posts: group.children.filter((item) => item.userData.side), lintel, veil };
  return group;
}

/** 绕机自转的铁球。攻守兼备那一路机翼的招牌。 */
export function makeOrb() {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), flat('#d8d8e6', { glow: 0.3, metalness: 0.8 }));
  group.add(ball);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.18, 5, 12), glowMat(HAZARD.gold, 0.8));
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  group.userData = { ball, ring };
  return group;
}

/** 曳光弹：一根细芯加一团光晕。光晕让它在发光的地面上也看得见，而细芯保证它不像车道线。 */
function tracer(color, length, width = 0.5) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(width, width, length), glowMat(color, 1));
  group.add(core);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.setScalar(length * 0.9);
  group.add(halo);
  return group;
}

/** 我方子弹。每种火力一种形状加一种颜色，屏幕上同时飞十几种也认得出来。 */
export function makeShot(kind) {
  if (kind === 'well') {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40), glowMat(HAZARD.lab, 0.8));
    ring.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 8, 32), glowMat('#ffffff', 0.5));
    inner.rotation.x = -Math.PI / 2;
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), glowMat('#e0d0ff', 0.95));
    group.add(ring);
    group.add(inner);
    group.add(core);
    group.userData = { ring, inner, core };
    return group;
  }
  if (kind === 'beam') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 14), glowMat('#8cfff0', 0.95));
    return mesh;
  }
  if (kind === 'flame') {
    return new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), glowMat('#ff9c40', 0.8));
  }
  if (kind === 'anti') {
    return new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 0), glowMat(HAZARD.lab, 0.95));
  }
  if (kind === 'shard') {
    return new THREE.Mesh(new THREE.TetrahedronGeometry(1.8), glowMat(HAZARD.lab, 0.9));
  }
  if (kind === 'pierce') {
    return tracer(HAZARD.pierce, 6.4, 0.7);
  }
  if (kind === 'bomb') {
    return new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), glowMat(HAZARD.ground, 0.95));
  }
  return tracer(HAZARD.shot, 3.2, 0.5);
}

export { ENEMY_ART, flat, glowMat };
