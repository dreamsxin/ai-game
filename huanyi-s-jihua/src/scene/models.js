// 模型工厂：这一版所有东西都是程序生成的低多边形体，不引任何第三方素材。
//
// 两条贯穿全文件的约定：
// 1. **朝向**：-Z 是远方（敌人来的方向），+Z 是近处（屏幕下方）。所以战机的尖端指 -Z，
//    俯冲机的锥尖指 +Z（它正扑向你）。
// 2. **相机是固定的**，所以要「正对镜头」的东西（血条、文字）只要绕 X 转一个常数就行，
//    不用每帧做 billboard。这个常数就是 BILLBOARD_X。

import * as THREE from 'three';
import { WINGS } from '../game/wings.js';
import { GEAR } from '../game/gear.js';
import { HAZARD, TIER_COLOR, PHASE_COLOR, gearSkin, wingSkin } from './palette.js';
import { TILT } from './view.js';
import { wingProfile, wingSeats, wingTraits, wingTrim, boltAim, boltBarrel, WING_TIP_X } from './wingIcon.js';

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
  if (hit !== undefined) return hit;
  // Node（models.test 直接在进程里造模型量尺寸）没有 DOM。这里退成 null，
  // SpriteMaterial 允许没有贴图，只是画出来会是方块——测试不渲染，浏览器里永远走下面这条。
  // 不这么写的话，机身与机翼一加精灵，整份模型测试就会变成 'document is not defined'。
  if (typeof document === 'undefined') {
    textureCache.set('#glow', null);
    return null;
  }
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

/**
 * 一片翼面。轮廓由 `wingProfile(spec)` 给（八种翼型，见 wingIcon.js），
 * 所以**选翼界面那张小图和场上这片翼是同一条轮廓**。
 * 翼尖仍然钉在 6.4 格 → 翼展 12.8 格，这条不能动：它等于受击面积。
 * 按轮廓缓存，同型号的机翼共用一份几何体。
 */
const wingGeometries = new Map();

function wingGeometry(profile) {
  const key = profile.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).join('|');
  const cached = wingGeometries.get(key);
  if (cached) return cached;
  const shape = new THREE.Shape();
  shape.moveTo(profile[0][0], profile[0][1]);
  for (const [x, z] of profile.slice(1)) shape.lineTo(x, z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
  // 在 XY 平面画的平面图，转到水平：shape 的 y 就成了世界的 z（往机尾为正）。
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.28, 0);
  wingGeometries.set(key, geometry);
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

// 几何体全场共用一份：机身、残影、分身都是同一架飞机。翼面按翼型分别缓存（见 wingGeometry）。
const HULL_GEOMETRY = hullGeometry();
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
    // 分身的机翼也按型号现造，只是套上同一层半透明皮。
    const wingSlot = new THREE.Group();
    group.add(wingSlot);
    const plume = new THREE.Group();
    group.add(plume);
    // 分身也要有护盾环：渲染层对本体和分身走同一套上色逻辑，这里给个 Group 会当场崩。
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.3, 6, 32), glowMat('#7fe3ff', 0.4));
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    mats.push(shade, outline);
    group.userData = { wingSlot, wings: new Map(), flame: plume, ring, mats, ghost: true };
    for (const mat of mats) mat.userData.baseOpacity = mat.opacity;
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

  // 背脊：从座舱盖一直拉到尾喷口的一道隆起。斜俯视下机身本来是一块扁板，
  // 有了这条脊线才有厚度；脊上再嵌一条冷光缝，读起来就是一根能量导管。
  // 这两件都压在 |x| ≤ 0.35 的中线上，动不到「裸机有多宽」。
  const spineMat = flat('#4b5c93', { emissive: '#33509f', glow: 0.95, metalness: 0.62, roughness: 0.28, opacity: 1 });
  mats.push(spineMat);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 4.8), spineMat);
  spine.position.set(0, 1.46, 1.6);
  group.add(spine);
  const seamMat = glowMat('#a9f0ff', 0.9);
  mats.push(seamMat);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 4.4), seamMat);
  seam.position.set(0, 1.74, 1.6);
  group.add(seam);

  // 肩部装甲板：沿脊背两侧铺两块薄板，比机身亮一档并各带一条描边。
  // 作用只有一个——让机身在二十来像素时仍有「拼装」的层次，不再是一整块纯色。
  const plateMat = flat('#55679e', { emissive: '#37509f', glow: 0.75, metalness: 0.5, roughness: 0.36, opacity: 1 });
  const plateEdgeMat = glowMat('#8fd6ff', 0.5);
  mats.push(plateMat, plateEdgeMat);
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 3.4), plateMat);
    plate.position.set(side * 1.05, 1.12, 0.4);
    plate.rotation.z = side * -0.34;
    group.add(plate);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.5), plateEdgeMat);
    lip.position.set(side * 1.62, 1.34, 0.4);
    lip.rotation.z = side * -0.34;
    group.add(lip);
  }

  // 翼根进气缝：两侧各一道向内收的光缝，暗示「这副翼从这儿接进机体」。
  for (const side of [-1, 1]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 1.9), intakeMat);
    slot.position.set(side * 1.72, 0.72, -0.7);
    group.add(slot);
  }

  // 机首传感器：一枚发亮的小棱体加一团光晕。玄鸟的机头本来就尖，
  // 加这一个亮点之后「哪头是前」在缩到十几像素时也不会有歧义。
  const sensorMat = glowMat('#d8fbff', 0.95);
  mats.push(sensorMat);
  const sensor = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), sensorMat);
  sensor.position.set(0, 0.28, -6.1);
  group.add(sensor);
  const sensorHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color('#8fe6ff'),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sensorHalo.scale.setScalar(2.4);
  sensorHalo.position.copy(sensor.position);
  sensorHalo.material.userData.driven = true;
  mats.push(sensorHalo.material);
  group.add(sensorHalo);

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
  // 每个喷口配三件东西：喇叭口、一圈会随推力脉动的辉光环、两层火焰（外柔内硬）。
  // 上一版只有一层锥火焰，缩到手机上是一条静止的蓝线——发动机「没在工作」。
  const nozzleMat = flat('#2a3350', { glow: 0.3, metalness: 0.8, opacity: 1 });
  mats.push(nozzleMat);
  const plume = new THREE.Group();
  const nozzleRings = [];
  const plumeFires = [];
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

    // 辉光环的轴正对 +Z（Torus 默认躺在 XY 平面，不用转），
    // 三枚环一起呼吸，比三团火更像「反应堆在推」。
    const ringMat = glowMat('#9fe4ff', 0.7);
    ringMat.userData.driven = true;
    mats.push(ringMat);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.1, 6, 22), ringMat);
    halo.position.set(x, y, 4.62 + z);
    group.add(halo);
    nozzleRings.push({ mesh: halo, base: 1 });

    const soft = new THREE.Mesh(new THREE.ConeGeometry(0.95, 4.6, 8), glowMat('#4f9bff', 0.3));
    soft.rotation.x = Math.PI / 2;
    soft.position.set(x, y, 0.6);
    plume.add(soft);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 8), glowMat('#8fd4ff', 0.9));
    fire.rotation.x = Math.PI / 2;
    fire.position.set(x, y, 1.7);
    plume.add(fire);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 6), glowMat('#ffffff', 0.85));
    core.rotation.x = Math.PI / 2;
    core.position.set(x, y, 1);
    plume.add(core);
    plumeFires.push({ fire, core, soft });
  }
  plume.position.z = 4.6;
  group.add(plume);

  // 机翼层：外形按型号现造（见 makeWing），这里只留一个挂点。
  const wingSlot = new THREE.Group();
  group.add(wingSlot);

  // 两种无敌看得出区别：挨打换来的是白环，弃翼换来的下潜是蓝环。
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.35, 6, 40), glowMat('#f6f4ee', 0.8));
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  group.userData = { wingSlot, wings: new Map(), flame: plume, ring, mats, nozzleRings, plumeFires, sensorHalo };
  // 记下每个材质的基准不透明度：无敌闪烁要按「这一件本来多亮」去淡，否则
  // 每闪一次都把 0.3 的柔和羽流拉成 1，越挨打飞机越亮。
  for (const mat of mats) mat.userData.baseOpacity = mat.opacity;
  return group;
}

/**
 * 一副机翼。**外形是从这只机翼真正的火力配置里长出来的**，不是十六张手画的图：
 * 每个炮口画在 `volley` 里那一发的出膛位置 `dx` 上，朝向就是那一发真正的方向。
 * 于是「宽幅炮 5 路扇形」在翼上真的是五个朝外的炮口，「前后炮」真的有一个朝后的管子，
 * 「铁球炮」有两副吊篮，「对地机翼」的两枚炸弹真的挂在翼下。
 * 换翼看得出区别，而这区别与判定层同源——改了 wings.js，机翼跟着变。
 */
export function makeWing(code) {
  const spec = WINGS[code] ?? WINGS.C;
  const volley = spec.volley ?? [];
  const group = new THREE.Group();
  const mats = [];
  const muzzles = [];

  // 三路出身三种配色：常规钢蓝、实验紫、秘密金。选翼界面的小图共用这一份（palette.js）。
  // 翼面压得比机身暗、炮管给得比机身亮——「几路火力、朝哪打」全靠这层对比读出来，
  // 第一版翼面和炮管都亮成一片白，五路和两路画出来一模一样。
  // **这一版一型一色**：21 型 21 个色相（见 palette.js 的 WING_HUES），
  // 否则常规那十五型在场上全是同一片蓝，换了翼只有炮管数变了。
  const skin = wingSkin(spec);

  const panelMat = flat(skin.body, { emissive: skin.edge, glow: 0.45, metalness: 0.5, opacity: 1 });
  // **必须双面**：ExtrudeGeometry 转平之后朝上的是背面盖，左翼又是 scale.x = -1 镜像出来的。
  panelMat.side = THREE.DoubleSide;
  mats.push(panelMat);
  const leadMat = glowMat(skin.lead, 0.75);
  mats.push(leadMat);
  // 后缘灯带比前缘暗一档：前缘是「朝哪儿走」，后缘只是「到哪儿为止」。
  // 两个一样亮的话整片翼会读成一圈光圈，反而看不出后掠角。
  const rimMat = glowMat(skin.lead, 0.42);
  mats.push(rimMat);
  // 炮管自己会发光：翼展被判定钉死在 12.8 格，所以「换了哪一套火力」全靠这几根管子读出来。
  // 管身带一点本型的色相（chrome），不再是一律纯白——五根白管子会把翼面的颜色整个盖住。
  const barrelMat = flat(skin.chrome, { emissive: skin.lead, glow: 1.3, metalness: 0.75, opacity: 1 });
  mats.push(barrelMat);
  // 翼尖装置的金属件：比翼面亮、比炮管暗，读起来是「装上去的零件」而不是「又一根枪」。
  const trimMat = flat(skin.chrome, { emissive: skin.edge, glow: 0.55, metalness: 0.65, roughness: 0.3, opacity: 1 });
  mats.push(trimMat);
  const trimEdgeMat = glowMat(skin.lead, 0.62);
  mats.push(trimEdgeMat);

  // 翼型一型一条（21 条轮廓，见 wingIcon.js 的 WING_OUTLINES）：
  // 带环的、挂炸弹的、前后都有火力的、只有一根穿甲管的、超短程的，各是一种形状。
  // 翼弦倍率只拉纵深，翼展永远是判定用的 12.8 格。
  const profile = wingProfile(spec);
  const geometry = wingGeometry(profile);
  const noseZ = Math.min(...profile.map(([, z]) => z));
  const tailZ = Math.max(...profile.map(([, z]) => z));
  const midZ = (noseZ + tailZ) / 2;
  // 翼尖装置：一型一件（见 wingIcon.js 的 WING_TRIM）。
  const trim = wingTrim(spec);

  const tips = [];
  const beacons = [];
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(geometry, panelMat);
    panel.scale.x = side;
    group.add(panel);

    // 前缘灯带：翼型在斜俯视下靠这条亮线读出后掠（或前掠）角。
    // 两端就是轮廓的前两个点，所以线跟着翼型一起变，不会飘在翼外。
    const [rootX, rootZ] = profile[0];
    const [tipX, tipZ] = profile[1];
    const dx = tipX - rootX;
    const dz = tipZ - rootZ;
    const lead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, Math.hypot(dx, dz)), leadMat);
    lead.position.set(side * ((rootX + tipX) / 2), 0.32, (rootZ + tipZ) / 2);
    lead.rotation.y = side * Math.atan2(dx, dz);
    group.add(lead);

    const tipLen = Math.max(1.6, tailZ - noseZ - 1.2);
    // 0.34 的截面：0.5 那一版在手机上是一块 3 像素见方的实心块，
    // 自发光一叠上去就烧成一团白斑，把翼尖的形状盖掉。细一点才像「灯条」。
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, tipLen), flat(TIER_COLOR[0], { glow: 1.6, opacity: 1 }));
    tip.position.set(side * 6.15, 0.3, (tipZ + profile[2][1]) / 2);
    mats.push(tip.material);
    group.add(tip);
    tips.push(tip);

    // 翼尖航灯：一枚只会呼吸的小光点。翼尖灯条是「这根梁一直亮到这儿」，
    // 航灯是「它还活着」——两者的节奏不同，一眼就能分开。
    const beacon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(skin.lead),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    // 位置不能真顶到 6.4：Sprite 是有一块平面几何体的，`Box3` 会把它算进翼展，
    // 而现在这条翼展被测试和判定一起钉死。放在 5.35、光晕半径 1 格，
    // 看上去正好贴在翼尖上，量出来却仍在 12.8 之内。
    beacon.position.set(side * 5.35, 0.75, (tipZ + profile[2][1]) / 2);
    beacon.scale.setScalar(2.0);
    beacon.material.userData.driven = true;
    mats.push(beacon.material);
    group.add(beacon);
    beacons.push(beacon);

    // 后缘灯带：逐段贴着轮廓画，所以扇形翼的缺口、挂架翼的两块挂架都跟得出来。
    // 只画 profile[2] 之后那几段——前两段就是前缘，已经有 lead 了，重画会亮成一片。
    for (let i = 2; i < profile.length - 1; i += 1) {
      const [ax, az] = profile[i];
      const [bx, bz] = profile[i + 1];
      const seg = Math.hypot(bx - ax, bz - az);
      if (seg < 0.4) continue;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, seg), rimMat);
      rim.position.set(side * ((ax + bx) / 2), 0.88, (az + bz) / 2);
      rim.rotation.y = side * Math.atan2(bx - ax, bz - az);
      group.add(rim);
    }

    // 翼尖装置：轮廓之外再加一层「只属于这一型」的识别点。斜俯视下翼面是一块扁板，
    // 翼尖是轮廓上最容易被眼睛抓住的地方——在那儿立一片小翼、吊一只舱、接一根撞角，
    // 缩到手机上也能一眼分出「这是另一副翼」。全部钉在 |x| ≤ 6.45 之内：
    // 判定翼展 12.8 不能因为好看就被画宽。
    if (trim.tip === 'winglet') {
      // 立起来的翼尖小翼：俯视时几乎看不出，斜俯视下却是轮廓上最高的一笔。
      const depth = Math.min(1.9, Math.max(0.8, (tailZ - noseZ) * 0.55));
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, depth), trimMat);
      fin.position.set(side * 6.02, 1.3, midZ);
      fin.rotation.y = side * 0.1;
      group.add(fin);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, depth), trimEdgeMat);
      lip.position.set(side * 6.02, 1.88, midZ);
      lip.rotation.y = side * 0.1;
      group.add(lip);
    } else if (trim.tip === 'blade') {
      // 斜切的翼尖刀片：平着伸出去一点，翼展的量法把它算在 6.15 之内。
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 2.1), trimMat);
      blade.position.set(side * 5.5, 1.02, midZ - 0.4);
      blade.rotation.y = side * 0.2;
      blade.rotation.z = side * 0.16;
      group.add(blade);
    } else if (trim.tip === 'pod') {
      // 翼尖吊舱：一整只舱体加一圈亮环，远看是翼尖上多了一颗「眼睛」。
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, 1.9, 8), trimMat);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 5.92, 0.78, midZ + 0.3);
      group.add(pod);
      const lens = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), trimEdgeMat);
      lens.position.set(side * 5.92, 0.78, midZ - 0.65);
      group.add(lens);
    } else if (trim.tip === 'canard') {
      // 翼根鸭翼：两片小小的前翼，摆在主翼之前——「贴脸作战」在形状上的说法。
      const canard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.95), trimMat);
      canard.position.set(side * 2.1, 1.0, noseZ - 0.85);
      canard.rotation.y = side * -0.5;
      group.add(canard);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.14), trimEdgeMat);
      edge.position.set(side * 2.1, 1.0, noseZ - 1.28);
      edge.rotation.y = side * -0.5;
      group.add(edge);
    } else if (trim.tip === 'fin') {
      // 后缘立尾：一对向外倾的小尾翼，和前面那对翼尖灯一起把轮廓收住。
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 1.05), trimMat);
      fin.position.set(side * 5.5, 1.28, tailZ - 0.55);
      fin.rotation.z = side * 0.3;
      fin.rotation.x = -0.1;
      group.add(fin);
    } else if (trim.tip === 'spike') {
      // 翼根撞角：一根指向前方的细针，是「这一型只有一根重管」在形状上的注脚。
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, 2.6, 6), trimMat);
      spike.rotation.x = Math.PI / 2;
      spike.position.set(side * 1.9, 0.9, noseZ - 1.15);
      group.add(spike);
      const point = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), trimEdgeMat);
      point.position.set(side * 1.9, 0.9, noseZ - 2.45);
      group.add(point);
    }
    if (trim.strake) {
      // 边条：从翼根前缘往后拉的一道细条，把「机翼和机身是连着的」这条线画出来。
      const strake = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, Math.max(1.4, (tailZ - noseZ) * 0.9)), trimEdgeMat);
      strake.position.set(side * 1.72, 0.95, midZ);
      group.add(strake);
    }
  }

  // 炮口：一发一个，朝向照 volley 抄；横向位置由 wingIcon.js 的 `wingSeats` 算
  // （判定层的 dx 只有 ±1～3 格，照抄会让五根管子挤在座舱底下——原因写在那个文件的头上）。
  // 选翼界面的小图取的是同一份数字，所以「挑的时候看到的」就是「飞起来带的」。
  const seats = wingSeats(spec);
  for (const [index, bolt] of volley.entries()) {
    const dir = boltAim(bolt);
    const bomb = Boolean(bolt.ground);
    const pierce = bolt.pierce === 'armor';
    const long = boltBarrel(bolt);
    const fat = bolt.kind === 'flame' ? 0.82 : pierce ? 0.58 : 0.44;
    const seat = seats[index];
    const barrel = bomb
      ? new THREE.Mesh(new THREE.SphereGeometry(0.92, 10, 8), flat(HAZARD.ground, { glow: 1.1, opacity: 1 }))
      : new THREE.Mesh(new THREE.CylinderGeometry(fat, fat * 0.82, long, 7), barrelMat);
    if (bomb) {
      // 挂在翼后缘那两块挂架上：斜俯视下藏在翼面底下的东西等于没画，所以它得探出来一截。
      barrel.position.set(seat, -0.7, tailZ + 0.5);
      mats.push(barrel.material);
    } else {
      barrel.rotation.x = Math.PI / 2;
      barrel.rotation.y = dir;
      // 炮口从翼前缘探出去：朝后的那一路自然长在翼后。抬在翼面之上，否则会被翼面盖住。
      barrel.position.set(seat, 0.58, noseZ + 0.6 - 1.2 * Math.cos(dir) - Math.abs(seat) * 0.18);
    }
    group.add(barrel);

    // 炮口闪光：每一根管子一枚，**材质各自一份**——共用一份就只能整副翼一起闪，
    // 那就退回「开了火但看不出是哪一路在打」。炸弹没有枪口，给 null。
    // 位置在本地 -Y：圆柱的轴转平之后 +Y 指向机尾，所以朝向机首的那一端是 -Y。
    let flash = null;
    if (!bomb) {
      flash = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: new THREE.Color(skin.lead),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      flash.position.set(0, -long / 2 - 0.25, 0);
      flash.scale.setScalar(3.2);
      flash.visible = false;
      // 不进 mats：闪光只在开火那一瞬间亮，压暗／无敌闪烁不该去动它，
      // 否则每次淡出都会把刚刚点起来的火压成 0。
      barrel.add(flash);
    }
    muzzles.push({ mesh: barrel, dir, kind: bomb ? 'bomb' : (bolt.kind ?? 'bolt'), flash });
  }

  // 铁球吊篮：**挂在翼尖**。原作（B-WINGS 的 H-WING）机翼本身的设计就是两翼端各带一枚铁球，
  // 所以这一路机翼不看火力也认得出来。球本身由 orbsOf 画（半径按 orbDist），这里挂的是座。
  // 招牌零件的开关走 wingTraits：引力井和链弧的标记写在**子弹**上而不是机翼记录上，
  // 第一版按 spec.well / spec.chain 找，这两件零件从来没被画出来过。
  const traits = wingTraits(spec);
  for (let i = 0; i < traits.orbs; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const rank = Math.floor(i / 2);
    const cradle = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), leadMat);
    cradle.position.set(side * (WING_TIP_X - 0.5 - rank * 1.5), 0.45, tailZ - 0.8 - rank * 0.9);
    group.add(cradle);
  }

  // 实验机翼各有一件招牌零件：引力井的环、量子分身的棱镜、链弧的天线、反物质的弹舱。
  if (traits.well) {
    const emitter = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 6, 18), glowMat(HAZARD.lab, 0.9));
    emitter.rotation.x = -Math.PI / 2;
    emitter.position.set(0, 0.7, noseZ + 1.2);
    group.add(emitter);
  }
  if (traits.echo) {
    const prism = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), glowMat('#e0d0ff', 0.85));
    prism.position.set(0, 1.2, 0.6);
    group.add(prism);
  }
  if (traits.burst) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), glowMat('#ffd0f0', 0.9));
    bulb.position.set(0, 0.9, noseZ + 1.4);
    group.add(bulb);
  }
  if (traits.chain) {
    for (const side of [-1, 1]) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 5, 10), glowMat('#b8f0ff', 0.9));
      coil.position.set(side * 1.9, 1.3, 0.4);
      group.add(coil);
    }
  }

  group.userData = { tips, beacons, pips: [], spines: [], mats, muzzles, code, tip: trim.tip };

  // 共鸣导线：升阶后从翼面里透出来的三条相位纹路。Mk.II 亮一条，Mk.III 三条全亮。
  // **只长在翼面内侧**（|x| ≤ 5.7），绝不外扩：翼展 12.8 是判定用的数，
  // 外形再科幻也不能把「看到的宽度」变成另一个数，否则玩家会按错的宽度躲弹。
  // 高度抬到 0.92：翼面实体占 0.28～0.83，上一版埋在 0.5 等于埋在铁皮里，一条都看不见。
  const spines = [];
  for (const side of [-1, 1]) {
    for (let lane = 0; lane < 3; lane += 1) {
      const z = noseZ + (tailZ - noseZ) * (0.3 + lane * 0.2);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 0.3), glowMat(TIER_COLOR[1], 0.75));
      strip.position.set(side * 3.6, 0.92, z);
      strip.visible = false;
      strip.material.userData.driven = true;
      mats.push(strip.material);
      group.add(strip);
      spines.push({ mesh: strip, lane });
    }
  }
  group.userData.spines = spines;

  for (const mat of mats) mat.userData.baseOpacity = mat.opacity;

  // 阶级灯珠挂在翼根后缘：亮几颗就是第几阶。跟着翼型的后缘走，不会翘在翼外。
  for (let i = 0; i < 3; i += 1) {
    const pip = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.75), flat(TIER_COLOR[0], { glow: 1.8, opacity: 1 }));
    pip.position.set((i - 1) * 1.3, 1.05, tailZ - 0.6);
    mats.push(pip.material);
    group.add(pip);
    group.userData.pips.push(pip);
  }
  return group;
}

/**
 * 把一副机翼压暗／还原（场上那些打不进本关弱点的道具）。
 * 基准亮度只在第一次记一遍，所以能来回切而不会一路越切越暗。
 */
export function shadeWing(wing, dim) {
  for (const mat of wing.userData.mats) {
    if (mat.userData.baseGlow === undefined) {
      mat.userData.baseGlow = mat.emissiveIntensity ?? 0;
      mat.userData.baseOpacity = mat.opacity;
    }
    mat.emissiveIntensity = dim ? mat.userData.baseGlow * 0.38 : mat.userData.baseGlow;
    mat.opacity = dim ? mat.userData.baseOpacity * 0.72 : mat.userData.baseOpacity;
  }
}

/** 相位残影：下潜时拖在身后的一串半透明机身，本身就是「现在打不到我」。 */
export function makeGhostHull() {
  const mesh = new THREE.Mesh(HULL_GEOMETRY, glowMat('#7fe3ff', 0.26));
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

// 敌人的配色要和章节地形拉开：第一章是蓝底，原来的蓝紫杂兵在上面只剩那圈白腰带看得见
// （自审截图里第一眼发现的第二条）。所以杂兵走紫、墙体提亮一档，其余保持。
const ENEMY_ART = {
  zako: { body: '#a06bff', trim: '#e8dcff' },
  diver: { body: '#ff7a3c', trim: '#ffd0b0' },
  turret: { body: '#9a5cff', trim: '#e2ccff' },
  ground: { body: '#b07a34', trim: '#ffd88a' },
  carrier: { body: '#ffc21f', trim: '#fff2b8' },
  wall: { body: '#6c86ad', trim: '#c2dcff' },
};

/** 六种敌人六种轮廓：形状比颜色更早被认出来，远处那一半靠的就是轮廓。 */
export function makeEnemy(kind) {
  const art = ENEMY_ART[kind] ?? ENEMY_ART.zako;
  const group = new THREE.Group();
  // 敌人要在发光的地面上认得出来，所以自发光给得比机身高（第一版 0.42，远处读成一团灰；
  // 0.85 在深蓝地面上还是偏暗——自审截图里杂兵只剩那圈白腰带看得见，所以又提了一档）。
  const body = flat(art.body, { glow: 1.05, roughness: 0.34 });
  const trim = flat(art.trim, { glow: 1.35 });
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
  const shellMat = flat('#2f4fb0', { glow: 0.42, metalness: 0.55 });
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
  // 上缘再补一道同色的边——一块砖加两道边才有「舰体」的量级，自审截图里少的就是这一层。
  const rimMat = glowMat(HAZARD.cool, 0.85);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rimMat);
  group.add(rim);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rimMat);
  group.add(brow);

  const spots = [];
  for (let i = 0; i < 2; i += 1) {
    const spot = new THREE.Group();
    // **弱点环是全场最该被看见的东西**。金色加法混合压在 ACES 色调映射下会发棕，
    // 所以环本身用更亮的奶金色，另外垫一层柔光晕——自审截图里它暗成了一个棕圈。
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(HAZARD.gold),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    spot.add(halo);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.62, 8, 24), glowMat('#fff0b8', 1));
    const core = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 10), glowMat('#ffe07a', 0.6));
    ring.rotation.x = BILLBOARD_X;
    spot.add(ring);
    spot.add(core);
    // **弱点永远画在壳外面**：它标的是「往这儿打」，被自己的装甲挡住就等于没标。
    // 所以这三件都关掉深度测试并排在最后画。
    for (const part of [halo, ring, core]) {
      part.material.depthTest = false;
      part.renderOrder = 4;
    }
    spot.userData = { ring, core, halo };
    spot.visible = false;
    group.add(spot);
    spots.push(spot);
  }

  group.userData = { shell, shellMat, plates, crown, rim, rimMat, brow, spots };
  return group;
}

/** 菱形道具。能不能打进本关弱点直接写在它身上：能的描金环，不能的整枚压暗。 */
/**
 * 场上那副脱手的机翼。**它就是机翼本身**，不是一枚抽象的宝石：
 * 弃翼是把一整套火力扔出去，所以扔出去的东西必须看得出是哪一套（外形 + 金环 + 叠层上的编号）。
 * 渲染层让它翻滚、并在刚脱手那一下抬一把再落回来，「抛出去」这件事才有手感。
 */
export function makeDrop() {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.4, 6, 24), glowMat(HAZARD.gold, 0.95));
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);
  // 型号与阶级由 2D 叠层写在它上方：道具在屏幕上只有二十像素，贴图文字必糊。
  group.userData = { spin, halo, wings: new Map() };
  return group;
}

/**
 * 装备道具：**六边形悬浮舱**，和菱形机翼道具一眼分开。
 * 机翼道具画的是整副翼（会翻滚、带阶级灯珠），这一枚是合上的收纳舱——
 * 捡之前玩家就得知道这是「第二槽」，不是又一只翅膀。
 */
export function makeGearDrop() {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const shellMat = flat('#d7e6ff', { emissive: '#7fe3ff', glow: 0.72, metalness: 0.62, opacity: 1 });
  const rimMat = glowMat('#7fe3ff', 0.9);
  const coreMat = glowMat('#ffffff', 0.85);
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.6, 6), shellMat);
  spin.add(hex);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.22, 6, 24), rimMat);
  rim.rotation.x = -Math.PI / 2;
  spin.add(rim);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 0), coreMat);
  core.position.y = 0.65;
  spin.add(core);
  const halo = headFlare('#7fe3ff', 8.5, 0.34);
  halo.position.y = 0.4;
  group.add(halo);
  const mats = [shellMat, rimMat, coreMat];
  for (const mat of mats) mat.userData.baseOpacity = mat.opacity;
  group.userData = { spin, halo, mats, shellMat, rimMat, coreMat };
  return group;
}

/**
 * 僚机：比主机小一号的乘波体，一型一形一色。
 *
 * **半宽必须 ≤ 1.3 格**（gear.js 的 ESCORT_HALF_W）：编队最外侧已经站到 |dx| = 5.0，
 * 模型再宽一点就把「看到的宽度」撑过 12.8 格判定翼展——上一轮刚修掉的坑。
 * 所以三型的差别做在纵向长度、翼面形状与那件识别装置上，不往外摊。
 */
export function makeEscort(code = 'E1') {
  const spec = GEAR[code] ?? GEAR.E1;
  const skin = gearSkin(spec.code);
  const group = new THREE.Group();
  const mats = [];

  const hullMat = flat(skin.body, { emissive: skin.edge, glow: 0.7, metalness: 0.6, opacity: 1 });
  hullMat.side = THREE.DoubleSide;
  mats.push(hullMat);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.4, 4), hullMat);
  body.rotation.x = -Math.PI / 2;
  // 不再绕 Z 转 45°：Box3 量的是**变换后的 AABB**，细长锥体一转就把横向撑到 1.63 格，
  // 编队最外侧那两架会连同光晕一起越出 12.8 格判定翼展。改由 scale.x 压出菱形感。
  body.scale.x = 0.72;
  // 三型连机身长短都不一样：环哨最短最圆，梭卫最细长，雁翎居中。
  body.scale.y = spec.shape === 'ring' ? 0.78 : spec.shape === 'needle' ? 1.16 : 1;
  group.add(body);

  const wingMat = flat(skin.body, { emissive: skin.edge, glow: 0.6, metalness: 0.55, opacity: 1 });
  wingMat.side = THREE.DoubleSide;
  mats.push(wingMat);
  const leadMat = glowMat(skin.lead, 0.85);
  mats.push(leadMat);
  // 一道识别色中脊：僚机只有主机三分之一大，靠这根亮条把「小机身」的轮廓
  // 从主机尾焰里勾出来。它贴着中线，横向一点宽度都不占。
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 2.5), leadMat);
  spine.position.set(0, 0.48, -0.15);
  group.add(spine);

  if (spec.shape === 'swept') {
    // 雁翎：两片后掠薄板，尾缘拖一道灯条。
    const panel = new THREE.BoxGeometry(0.9, 0.14, 2.0);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(panel, wingMat);
      mesh.position.set(side * 0.45, 0, 0.45);
      mesh.rotation.y = side * 0.32;
      group.add(mesh);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.24), leadMat);
    tail.position.set(0, 0.16, 1.35);
    group.add(tail);
  } else if (spec.shape === 'needle') {
    // 梭卫：细长针翼 + 一截更尖的机首，看着就比别的型快。
    const strake = new THREE.BoxGeometry(0.42, 0.12, 2.8);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(strake, wingMat);
      mesh.position.set(side * 0.6, 0, 0.35);
      group.add(mesh);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.5, 4), leadMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -2.2);
    group.add(nose);
  } else {
    // 环哨：一圈护环 + 两枚小卫星球，绕着机尾慢慢转（转动由渲染层推）。
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.14, 6, 20), leadMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.05, 0.55);
    group.add(ring);
    for (const side of [-1, 1]) {
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), wingMat);
      ball.position.set(side * 1.0, 0.05, 0.55);
      group.add(ball);
    }
  }

  // 炮口闪光：每架僚机一份独立材质，所以能看出是哪一架在打。
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(skin.lead),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  flash.scale.setScalar(2.4);
  flash.position.set(0, 0.4, -1.85);
  flash.visible = false;
  group.add(flash);
  const halo = headFlare(skin.halo, 2.2, 0.3);
  halo.position.set(0, 0.18, 1.55);
  group.add(halo);

  for (const mat of mats) mat.userData.baseOpacity = mat.opacity;
  group.userData = { code: spec.code, shape: spec.shape, mats, flash, halo, skin, ring: group.children.find((node) => node.geometry?.type === 'TorusGeometry') ?? null };
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

/**
 * 一层加色光壳。比芯更宽更淡，叠起来才是「光」——单层实体盒子在加色混合下
 * 只是一根颜色略亮的塑料棒，边缘还是硬的。
 */
function glowLayer(color, width, length, opacity) {
  return new THREE.Mesh(new THREE.BoxGeometry(width, width, length), glowMat(color, opacity));
}

/** 弹头闪光：顶在最前面的一团光。玩家在满屏弹幕里找的就是它。 */
function headFlare(color, scale, opacity = 0.75) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sprite.scale.setScalar(scale);
  return sprite;
}

/**
 * 曳光弹：细白芯 + 中层色壳 + 外圈淡晕 + 头部闪光。
 * 四层是有原因的——单芯在深色地面上只是一道细线，只有晕才让它「发亮」；
 * 而头部那团光决定了玩家能不能一眼跟住这一发飞到哪儿。
 */
function tracer(color, length, width = 0.46) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, width * 0.55, length), glowMat('#ffffff', 1));
  const mid = new THREE.Mesh(new THREE.BoxGeometry(width, width, length * 0.94), glowMat(color, 0.85));
  const halo = glowLayer(color, width * 1.9, length * 0.82, 0.24);
  const head = headFlare(color, length * 0.62, 0.6);
  head.position.z = -length / 2;
  group.add(mid, core, halo, head);
  group.userData = { head };
  return group;
}

/** 我方子弹。每种火力一种形状加一种颜色，屏幕上同时飞十几种也认得出来。 */
export function makeShot(kind, color) {
  if (kind === 'escort') {
    // 僚机弹细一档、短一截、走本型的识别色：两路火力叠在同一列也分得开是谁打的。
    return tracer(color ?? '#bfe9ff', 3.6, 0.3);
  }
  if (kind === 'well') {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40), glowMat(HAZARD.lab, 0.8));
    ring.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 8, 32), glowMat('#ffffff', 0.5));
    inner.rotation.x = -Math.PI / 2;
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), glowMat('#e0d0ff', 0.95));
    // 井口再罩一层淡晕：它在吸弹，得看起来「有引力」而不是一只发光的呼啦圈。
    const haze = headFlare(HAZARD.lab, 7.5, 0.22);
    group.add(ring);
    group.add(inner);
    group.add(core);
    group.add(haze);
    group.userData = { ring, inner, core, haze };
    return group;
  }
  if (kind === 'beam') {
    // 相位激光。三段同轴的加色长条：外晕、中层、白芯。
    // 长度给到 30：L 的冷却 0.05、速度 190，相邻两发只隔 9.5 格——
    // 于是十几条首尾相接，屏幕上就是**一束连续的激光**，而不是一串竖着的短杠。
    // 这一条是这一版最要紧的改动：激光看起来像激光，靠的是重叠，不是贴图。
    const group = new THREE.Group();
    const outer = glowLayer('#2ff7d0', 1.9, 30, 0.16);
    const mid = glowLayer('#8cfff0', 0.82, 30, 0.5);
    const core = glowLayer('#ffffff', 0.3, 30, 0.95);
    const head = headFlare('#c8fff8', 4.6, 0.85);
    head.position.z = -15;
    group.add(outer, mid, core, head);
    group.userData = { outer, mid, core, head };
    return group;
  }
  if (kind === 'flame') {
    // 火焰：三团大小不一的多面体叠在一起，外层偏红、内层偏白，转起来才有「在烧」的抖动。
    const group = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(3.0, 0), glowMat('#ff5a1f', 0.34));
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), glowMat('#ff9c40', 0.72));
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), glowMat('#fff2b0', 0.88));
    const halo = headFlare('#ffb066', 6.5, 0.4);
    group.add(outer, body, core, halo);
    group.userData = { outer, body, core };
    return group;
  }
  if (kind === 'anti') {
    // 反物质：暗核外面箍一圈亮环，读起来是「装在一个容器里的东西」，
    // 和普通发光球区分开——它是全场最慢最重的一发。
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 0), glowMat(HAZARD.lab, 0.9));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.26, 6, 24), glowMat('#f0e2ff', 0.9));
    const halo = headFlare(HAZARD.lab, 8.5, 0.5);
    group.add(core, rim, halo);
    group.userData = { core, rim, halo };
    return group;
  }
  if (kind === 'shard') {
    // 反物质炸出来的碎片：外壳紫、芯是白的，外面再顶一团光。
    // 三片同时飞出来，越小的那一块越靠白芯，读起来才有「炸开」的层次。
    const group = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.TetrahedronGeometry(1.9), glowMat(HAZARD.lab, 0.55));
    const core = new THREE.Mesh(new THREE.TetrahedronGeometry(1.0), glowMat('#ffffff', 0.95));
    const halo = headFlare(HAZARD.lab, 4.6, 0.45);
    group.add(shell, core, halo);
    group.userData = { shell, core, halo };
    return group;
  }
  if (kind === 'pierce') {
    // 穿甲弹：一根又长又细的硬芯，外面裹两层绿光。
    // 它要看起来「能扎穿东西」，所以比普通弹长一截、尾部收窄。
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 9.2), glowMat('#ffffff', 1));
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 8.4), glowMat(HAZARD.pierce, 0.85));
    const halo = glowLayer(HAZARD.pierce, 1.5, 7.0, 0.22);
    const head = headFlare(HAZARD.pierce, 3.6, 0.8);
    head.position.z = -4.6;
    group.add(mid, core, halo, head);
    group.userData = { head };
    return group;
  }
  if (kind === 'bomb') {
    // 炸弹：弹体外面箍一道稳定环，斜俯视下能看出它「在翻着往下掉」，
    // 而不是一颗飘过去的橙色球。
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8), glowMat(HAZARD.ground, 0.95));
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.18, 5, 16), glowMat('#ffe6a8', 0.8));
    band.rotation.x = -Math.PI / 2;
    band.position.y = 0.2;
    const halo = headFlare(HAZARD.ground, 6.0, 0.5);
    group.add(body, band, halo);
    group.userData = { body, band, halo };
    return group;
  }
  // 普通曳光弹拉长到 5.6：3.2 那一版在屏幕上是两列间距均匀的小点，
  // 斜俯视下读起来像给跑道刷了两条车道虚线，而不是一股火力（自审截图里最扎眼的一条）。
  return tracer(HAZARD.shot, 5.6, 0.46);
}

/**
 * 相位翼场：升阶时从翼面里「长开」的那一层科幻结构。
 *
 * 为什么单独一层、而且**不在 makeWing 里**：翼展 12.8 格是判定用的数，
 * 能量导轨可以转出机身之外，但「实体机翼有多宽」这一位信息不能被表现层改掉。
 * 所以它由 render.js 挂到机体上（和 aura 一样），是一层纯表现的能量场。
 *
 * 逐阶展开的形状，全是低多边形 + 加色发光，不含任何贴图文字：
 * - Mk.II：一道贴地能量导轨 + 左右两枚悬浮棱晶（第二副翼解构后的相位骨架）。
 * - Mk.III：第二道外环、两道交叉倾斜的陀螺环、导轨上跑的八颗能量节点、机背中央共振核心。
 * - 相位过载：全套结构同时点亮并换成白青，转速翻倍。
 */
export function makePhaseFrame() {
  const group = new THREE.Group();
  const mats = [];
  const rails = [];
  const gyros = [];
  const cores = [];
  const conduits = [];
  const nodes = [];
  const sails = [];
  const ribs = [];
  const halos = [];

  // 全部走加色发光。镜像出来的那两片能量翼必须双面，不然左翼会被整片剔掉。
  const phase = (color, opacity, double = false) => {
    const mat = glowMat(color, opacity);
    if (double) mat.side = THREE.DoubleSide;
    mats.push(mat);
    return mat;
  };

  // 环是平躺的薄环：斜俯视下能读出「绕着机身转」，又不会挡住翼面。
  // 管径给到 0.2：0.1 那一版在手机上只剩一圈一像素的虚线，等于没画。
  for (const [i, radius] of [8.8, 10.6].entries()) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.2, 6, 64), phase(PHASE_COLOR, 0.6));
    rail.rotation.x = -Math.PI / 2;
    rail.position.y = 0.65 + i * 0.75;
    rail.visible = false;
    group.add(rail);
    rails.push(rail);
  }
  // 交叉陀螺环：Mk.III 才架起来，从平躺的二维环变成一颗三维的量子陀螺。
  for (const [i, tilt] of [0.86, -0.86].entries()) {
    const gyro = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.18, 6, 48), phase(PHASE_COLOR, 0.5));
    gyro.rotation.x = -Math.PI / 2 + tilt;
    gyro.rotation.y = i === 0 ? 0.38 : -0.38;
    gyro.visible = false;
    group.add(gyro);
    gyros.push(gyro);
  }

  // 能量翼：半透明楔形翼面 + 三根发光翼肋，浮在实体翼上方两格。
  // 这是「外形变更加科幻」最吃重的一件：Mk.II 只展开内半段，Mk.III 整片张开。
  // 它是发光的场、不是实体装甲（判定翼展仍在 makeWing 里锁着 12.8 格），
  // 所以刻意做成半透明、抬高、带骨架，读起来就不会被当成「可以躲的宽度」。
  const sailShape = new THREE.Shape();
  sailShape.moveTo(1.5, -3.4);
  sailShape.lineTo(7.6, -6.6);
  sailShape.lineTo(7.6, 1.0);
  sailShape.lineTo(1.5, 3.2);
  sailShape.closePath();
  const sailGeometry = new THREE.ShapeGeometry(sailShape);
  for (const side of [-1, 1]) {
    const sail = new THREE.Mesh(sailGeometry, phase(PHASE_COLOR, 0.16, true));
    sail.rotation.x = -Math.PI / 2;
    sail.position.y = 2.0;
    sail.scale.x = side;
    sail.visible = false;
    group.add(sail);
    sails.push(sail);

    for (let lane = 0; lane < 3; lane += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.16, 0.26), phase('#ffffff', 0.7));
      rib.position.set(side * 4.6, 2.05, -3.6 + lane * 2.3);
      rib.rotation.y = side * (lane - 1) * 0.12;
      rib.visible = false;
      group.add(rib);
      ribs.push(rib);
    }

    // 悬浮棱晶挂在能量翼尖上方，一根斜撑把它接回翼面——「第二副翼解构成能量骨架」的形状。
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), phase('#ffffff', 0.95));
    crystal.position.set(side * 6.0, 2.3, 0.7);
    crystal.visible = false;
    group.add(crystal);
    cores.push(crystal);

    // 光晕球：棱晶本身只有四五像素，靠这一团加色光才在手机上看得见。
    const halo = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 8), phase(PHASE_COLOR, 0.07));
    halo.position.copy(crystal.position);
    halo.visible = false;
    group.add(halo);
    halos.push(halo);

    const conduit = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.16), phase(PHASE_COLOR, 0.6));
    conduit.position.set(side * 4.4, 1.5, 0.7);
    conduit.rotation.z = side * 0.2;
    conduit.visible = false;
    group.add(conduit);
    conduits.push(conduit);
  }
  for (let i = 0; i < 8; i += 1) {
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), phase('#ffffff', 0.95));
    node.visible = false;
    group.add(node);
    nodes.push(node);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 0), phase('#ffffff', 0.85));
  core.position.set(0, 3.1, 0.2);
  core.visible = false;
  group.add(core);
  const coreHalo = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), phase(PHASE_COLOR, 0.07));
  coreHalo.position.copy(core.position);
  coreHalo.visible = false;
  group.add(coreHalo);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 6, 32), phase('#ffffff', 0.6));
  coreRing.rotation.x = -Math.PI / 2;
  coreRing.position.copy(core.position);
  coreRing.visible = false;
  group.add(coreRing);

  group.userData = { rails, gyros, cores, conduits, nodes, sails, ribs, halos, core, coreHalo, coreRing, mats };
  return group;
}

export { ENEMY_ART, flat, glowMat };
