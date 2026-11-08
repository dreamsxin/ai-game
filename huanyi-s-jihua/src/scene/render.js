// 表现层的总线。只读模拟状态，一个字段都不写回——所以画错了也影响不到判定。
//
// 分工：
// - stage.js 管场景（相机、地面、星野），models.js 管模型，这一份只做「把状态摆上去」。
// - 世界里的东西全用池子：每帧 begin → take 若干 → end，多出来的藏起来。
// - 中文飘字、全屏闪光、裸机红边走一层 2D 叠层画布：文字用 canvas 比用贴图清楚得多，
//   而且这三样本来就是贴在屏幕上的，不该有透视。

import * as THREE from 'three';
import { BOSS_DEATH_TIME, FIELD_W, WING_DRIFT } from '../game/rules.js';
import { WEAKNESS, WINGS, tierOf, wingAtTier } from '../game/wings.js';
import { GEAR, MAX_FORMATION, escortWorld, escortsOf, gearSpec } from '../game/gear.js';
import { orbsOf } from '../game/simulation.js';
import { weakSpots } from '../game/boss.js';
import { ALT, pixelScale, worldX, worldZ } from './view.js';
import { FLEET, HAZARD, TIER_COLOR, OVERDRIVE_COLOR, PHASE_COLOR, gearSkin } from './palette.js';
import { tierGainLabel } from './readout.js';
import { createStage } from './stage.js';
import {
  FLEET_FORMATIONS,
  createPool,
  glowTexture,
  makeBoss,
  makeDrop,
  makeEnemy,
  makeEscort,
  makeGate,
  makeGearDrop,
  makeGhostHull,
  makeOrb,
  makePhaseFrame,
  makeShip,
  makeShot,
  makeWing,
  shadeWing,
} from './models.js';

const MAX_SPARKS = 320;
const MAX_ARCS = 20;
const ARC_SEGMENTS = 5;
const TRAIL_LEN = 10;
/** 脱手的机翼「抛出去再落回来」那一下有多久。纯表现，判定层不看它。 */
const TOSS_TIME = 0.42;

/**
 * 取出这只机翼的模型：按型号现造一次、之后复用，同一个挂点上只显示当前那一副。
 * 「换翼」因此真的换了外形——炮口数、朝向、吊篮、炸弹架都跟着 wings.js 变。
 */
const wingFor = (holder, slot, code) => {
  const cache = holder.userData.wings;
  let active = cache.get(code);
  if (!active) {
    active = makeWing(code);
    if (holder.userData.ghost) {
      // 分身与残影只要轮廓：把整副翼套上同一层半透明皮。
      const shade = holder.userData.mats[0];
      active.traverse((node) => {
        if (node.isMesh) node.material = shade;
      });
      active.userData.mats = [shade];
      active.userData.tips = [];
      active.userData.pips = [];
      active.userData.spines = [];
      // 航灯与炮口闪光是 Sprite，不是 Mesh——上面那圈 traverse 换不掉它们的材质，
      // 所以直接藏起来：一具「只剩轮廓」的分身不该带着几点刺眼的白光。
      active.traverse((node) => {
        if (node.isSprite) node.visible = false;
      });
      active.userData.beacons = [];
      for (const muzzle of active.userData.muzzles ?? []) muzzle.flash = null;
    }
    cache.set(code, active);
    slot.add(active);
  }
  for (const [key, item] of cache) item.visible = key === code;
  return active;
};

/** 每种火力对应一种模型。同型号的子弹共用一个池子，回声（量子分身）的另开一个。 */
const shotKey = (shot) => {
  // 僚机弹按型号分池：三型的识别色不同，共用一个池子会串色。
  // 巡航导弹再单独分一池：它有箭体与尾翼，和双股离子矢不是同一种东西。
  if (shot.source === 'gear') {
    const family = shot.homing ? 'cruise' : 'escort';
    return `${family}:${shot.gearCode ?? 'E1'}`;
  }
  if (shot.well) return 'well';
  const kind = ['flame', 'beam', 'anti', 'shard', 'pierce', 'bomb'].includes(shot.kind) ? shot.kind : 'pellet';
  return shot.echo ? `${kind}:echo` : kind;
};

export function createRenderer(host) {
  const stage = createStage(host);

  // ---- 2D 叠层：飘字、闪光、裸机红边 ----
  const overlay = document.createElement('canvas');
  overlay.className = 'stage-overlay';
  host.appendChild(overlay);
  const ctx = overlay.getContext('2d');
  let size = { w: 1, h: 1 };
  // 手指是 client 坐标，画指示要减掉画布在页面上的位置。跟着 resize 一起更新，不每帧去问。
  let origin = { left: 0, top: 0 };
  const resizeOverlay = () => {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.max(1, Math.round(rect.width * dpr));
    overlay.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    origin = { left: rect.left, top: rect.top };
  };
  resizeOverlay();
  const observer = new ResizeObserver(resizeOverlay);
  observer.observe(host);

  // ---- 世界里的东西 ----
  const ship = makeShip();
  // 阶级光环：两道反向旋转的弧环贴着机身转。Mk.II 起亮一道，Mk.III 两道全开——
  // 「升阶了」要一眼看出，而且要科幻：能量环比贴图强得多。
  const auraMat = () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(HAZARD.pierce),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const aura = new THREE.Group();
  const auraArcs = [0.62, 0.5].map((sweep, i) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(7.4 + i * 1.5, 8.4 + i * 1.5, 48, 1, 0, Math.PI * 2 * sweep), auraMat());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    aura.add(mesh);
    return mesh;
  });
  ship.add(aura);
  // 相位翼场：升阶时真的「长开」的那一层结构，不是一张贴上去的光环。
  // 展开进度由 evolve 事件清零、syncShip 每帧推到 1，所以升阶是一次看得见的变形。
  const phaseFrame = makePhaseFrame();
  ship.add(phaseFrame);
  let phaseAnim = 1;
  let surgeFlash = 0;
  const echo = makeShip({ ghost: true });
  echo.visible = false;
  stage.world.add(ship);
  stage.world.add(echo);

  const trailPool = createPool(stage.world, makeGhostHull);
  const orbPool = createPool(stage.world, makeOrb);
  const dropPool = createPool(stage.world, makeDrop);
  // 装备是第二槽，道具和僚机都不跟机翼共用池子：形状不同，混用会在复用那一帧闪出菱形。
  const gearDropPool = createPool(stage.world, makeGearDrop);
  const escortPools = new Map();
  const escortPool = (code) => {
    let pool = escortPools.get(code);
    if (!pool) {
      pool = createPool(stage.world, () => makeEscort(code));
      escortPools.set(code, pool);
    }
    return pool;
  };
  // 僚机的插值位置（场地格）。判定层的 escortsOf 是目标，这一份是「正在飞过去」。
  // 不再拉主机到僚机的连线：三种阵型各自散开之后，一根线会把它们又「绑」回挂件，
  // 环绕那一路尤其会被这条线切成一团。识别靠各自的形状、识别色与炮口闪光。
  let escortPos = new Map();
  const boss = makeBoss();
  boss.visible = false;
  stage.world.add(boss);
  const gate = makeGate();
  gate.visible = false;
  stage.world.add(gate);

  const enemyPools = new Map();
  const enemyPool = (kind) => {
    let pool = enemyPools.get(kind);
    if (!pool) {
      pool = createPool(stage.world, () => makeEnemy(kind));
      enemyPools.set(kind, pool);
    }
    return pool;
  };

  const shotPools = new Map();
  const shotPool = (key) => {
    let pool = shotPools.get(key);
    if (!pool) {
      const [kind, tag] = key.split(':');
      pool = createPool(stage.world, () => {
        const colored = kind === 'escort' || kind === 'cruise';
        const made = colored ? makeShot(kind, gearSkin(tag).lead) : makeShot(kind);
        if (tag === 'echo') {
          const dim = (mesh) => {
            if (mesh.material) mesh.material = mesh.material.clone();
            if (mesh.material) mesh.material.opacity *= 0.55;
          };
          dim(made);
          for (const child of made.children ?? []) dim(child);
        }
        // 能量鞘：升阶／过载的子弹外面再套一层发光晕。挂在子弹自己身上，
        // 池子复用时按帧用 set 覆盖 visible／颜色／大小，绝不能乘法累积。
        const sheath = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture(),
            color: new THREE.Color(TIER_COLOR[1]),
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        sheath.visible = false;
        made.add(sheath);
        made.userData.sheath = sheath;
        return made;
      });
      shotPools.set(key, pool);
    }
    return pool;
  };

  // 敌弹：亮红的球加一层光晕。它是全场唯一「碰上就掉翼」的东西，必须最扎眼。
  const foePool = new Map();
  const foeMesh = (kind) => {
    let pool = foePool.get(kind);
    if (!pool) {
      pool = createPool(stage.world, () => {
        const group = new THREE.Group();
        const color = kind === 'shell' ? HAZARD.shell : HAZARD.foe;
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(kind === 'shell' ? 2.2 : 1.6, 12, 10),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
        );
        group.add(ball);
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture(),
            color: new THREE.Color(color),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        halo.scale.setScalar(kind === 'shell' ? 9 : 6.4);
        group.add(halo);
        return group;
      });
      foePool.set(kind, pool);
    }
    return pool;
  };

  // ---- 火花：一套 Points，用不到的点涂黑（加色混合下等于隐形） ----
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkCol = new Float32Array(MAX_SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMesh = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      size: 3.2,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  stage.world.add(sparkMesh);
  let sparks = [];
  const tint = new THREE.Color();

  // ---- 链弧：两点之间抖几下的折线，只活六帧 ----
  const arcGeo = new THREE.BufferGeometry();
  const arcPos = new Float32Array(MAX_ARCS * ARC_SEGMENTS * 2 * 3);
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcMesh = new THREE.LineSegments(
    arcGeo,
    new THREE.LineBasicMaterial({
      color: new THREE.Color('#b8f0ff'),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  stage.world.add(arcMesh);
  arcMesh.visible = false;
  let arcs = [];

  // ---- 冲击波环：贴着爆炸高度向外扩散的一圈光。快出慢收，加色混合下才像「冲击」----
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  const ringPool = createPool(stage.world, () => {
    const mesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  });
  const RING_MAX = 24;
  let rings = [];
  const shockwave = (x, y, color, maxR, life, alt = ALT.shot) => {
    if (rings.length >= RING_MAX) rings.shift();
    rings.push({ x, y, alt, color, maxR, life, age: 0 });
  };

  const updateRings = (dt) => {
    rings = rings.filter((item) => item.age < item.life);
    ringPool.begin();
    for (const item of rings) {
      item.age += dt;
      const t = Math.min(1, item.age / item.life);
      const ease = 1 - (1 - t) * (1 - t);
      const mesh = ringPool.take();
      mesh.material.color.set(item.color);
      mesh.material.opacity = (1 - t) * 0.85;
      mesh.position.set(worldX(item.x), item.alt, worldZ(item.y));
      mesh.scale.setScalar(item.maxR * ease);
    }
    ringPool.end();
  };

  let notes = [];
  let flash = null;
  // Boss 入场的 WARNING 演出：红边脉冲加中央大字，1.7 秒后自己退干净。
  let warning = null;
  let lastX = FIELD_W / 2;
  // 世界里锚着的那些字（道具型号、火箭装的型号、跳关门）：每帧由 sync 收集，
  // 由 2D 叠层按投影位置画成原生分辨率的字——贴图缩到二十像素一定糊。
  let marks = [];
  // 相位残影的轨迹：只在下潜时攒，别的时候一帧一帧清掉。
  const trail = [];

  const spark = (x, y, color, count, spread = 30, alt = ALT.shot) => {
    tint.set(color);
    for (let i = 0; i < count && sparks.length < MAX_SPARKS; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random();
      const lift = (Math.random() - 0.3) * spread * 0.5;
      sparks.push({
        x: worldX(x),
        y: alt,
        z: worldZ(y),
        vx: Math.cos(angle) * spread * (0.4 + Math.random()),
        vy: lift,
        vz: Math.sin(angle) * spread * (0.4 + Math.random()),
        life: 0.3 + Math.random() * 0.34,
        age: 0,
        r: tint.r,
        g: tint.g,
        b: tint.b,
      });
    }
  };

  /**
   * 飘字。同一帧常常有好几件事同时发生（消弹 + 掉落 + 跳关），
   * 所以这里会给新来的那条让位：撞上还活着的旧字就往下错开一行。
   * 不让位的后果是「掉落 D 机翼」和「跳关」叠成一团糊字——自审截图里就是这样。
   */
  const NOTE_GAP = 9;

  const note = (x, y, text, color) => {
    let row = y;
    for (let guard = 0; guard < 6; guard += 1) {
      const clash = notes.some((item) => Math.abs(item.y - row) < NOTE_GAP && Math.abs(item.x - x) < 34);
      if (!clash) break;
      row += NOTE_GAP;
    }
    notes.push({ x, y: row, text, color, life: 0.95, age: 0 });
    if (notes.length > 10) notes.shift();
  };

  const bang = (color, power = 0.3) => {
    flash = { color, power, life: 0.26, age: 0 };
  };

  /**
   * 引擎尾焰：每帧从三喷口的位置往后（往近处）喷一两粒淡青蓝的余烬。
   * 飞机钉在屏幕上，速度感全靠这些往后跑的粒子；下潜时喷三粒——「加速」看得见。
   */
  const exhaust = (state) => {
    if (state.status !== 'playing') return;
    const data = state.ship;
    const count = data.dive > 0 ? 3 : 1;
    for (let i = 0; i < count && sparks.length < MAX_SPARKS; i += 1) {
      sparks.push({
        x: worldX(data.x) + (Math.random() - 0.5) * 1.6,
        y: ALT.ship - 0.4,
        z: worldZ(data.y) + 2.6,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3,
        vz: 14 + Math.random() * 10,
        life: 0.22 + Math.random() * 0.15,
        age: 0,
        r: 0.42,
        g: 0.66,
        b: 1,
      });
    }
  };

  // effects 是逻辑层唯一的出口：火花、飘字、震动、闪光都从这里长出来。
  const notify = (effects = []) => {
    for (const effect of effects) {
      if (effect.type === 'pop') {
        spark(effect.x, effect.y, HAZARD.gold, 5, 24);
        if (effect.chain >= 3) note(FIELD_W / 2, 40, `连消 ${effect.chain}`, '#ffe066');
      } else if (effect.type === 'kill') {
        const gold = effect.kind === 'carrier';
        spark(effect.x, effect.y, gold ? HAZARD.gold : '#ff8f5e', 10, 38);
        shockwave(effect.x, effect.y, gold ? HAZARD.gold : '#ff8f5e', gold ? 10 : 6, 0.4, ALT.enemy);
      } else if (effect.type === 'wingLost') {
        spark(effect.x, effect.y, HAZARD.warm, 14, 44);
        shockwave(effect.x, effect.y, HAZARD.warm, 9, 0.42);
        note(FIELD_W / 2, 100, `${effect.code} 机翼被崩掉`, HAZARD.warm);
        stage.punch(3.2);
      } else if (effect.type === 'jettison') {
        note(FIELD_W / 2, 100, '弃翼下潜', HAZARD.cool);
        stage.punch(1.6);
      } else if (effect.type === 'catch' || effect.type === 'swap') {
        note(FIELD_W / 2, 96, `${effect.code} ${WINGS[effect.code]?.name ?? ''}`, HAZARD.pierce);
      } else if (effect.type === 'evolve') {
        const trim = TIER_COLOR[effect.tier - 1] ?? HAZARD.gold;
        const lore = tierOf(effect.tier);
        // 冲击环画的就是共鸣清弹的真实半径：范围加强不是 HUD 上的一个数字，是场上这一圈。
        spark(effect.x, effect.y, trim, 26, 52);
        shockwave(effect.x, effect.y, trim, effect.radius ?? 12, 0.55);
        shockwave(effect.x, effect.y, '#ffffff', 12, 0.35);
        note(FIELD_W / 2, 92, `${lore.codename} · ${lore.title} → ${lore.name}`, trim);
        note(FIELD_W / 2, 86, tierGainLabel(effect.tier), trim);
        if (effect.cleared > 0) note(FIELD_W / 2, 78, `相位冲击 · 震碎 ${effect.cleared} 发敌弹`, trim);
        bang('#ffe9a8', 0.42);
        stage.punch(2.6);
        phaseAnim = 0;
      } else if (effect.type === 'overdrive') {
        spark(effect.x, effect.y, OVERDRIVE_COLOR, 30, 60);
        shockwave(effect.x, effect.y, OVERDRIVE_COLOR, effect.radius ?? 12, 0.7);
        shockwave(effect.x, effect.y, '#ffffff', 18, 0.45);
        note(FIELD_W / 2, 92, 'OVERDRIVE · 相位过载', OVERDRIVE_COLOR);
        note(FIELD_W / 2, 86, `火力再 ×1.35 · 持续 ${(effect.time ?? 0).toFixed(1)}s`, OVERDRIVE_COLOR);
        bang(OVERDRIVE_COLOR, 0.5);
        stage.punch(3.2);
        surgeFlash = 1;
        phaseAnim = Math.min(phaseAnim, 0.55);
      } else if (effect.type === 'topped') {
        // 过载那一声由 audio.js 顶掉 topped，这里只留一行不抢戏的小字。
        note(FIELD_W / 2, 92, `${effect.code} 阶级封顶 · 转相位过载`, HAZARD.pierce);
      } else if (effect.type === 'gearCarrier') {
        note(FIELD_W / 2, 56, `掉落 ${effect.code} 装备`, gearSkin(effect.code).lead);
      } else if (effect.type === 'gearCatch' || effect.type === 'gearSync') {
        // 合流不是升阶：不放相位冲击、不画能量翼，改画一道从后方追上来的入列光弧。
        const skin = gearSkin(effect.code);
        const x = effect.x ?? FIELD_W / 2;
        const y = effect.y ?? 116;
        spark(x, y, skin.lead, effect.type === 'gearSync' ? 18 : 12, 34);
        shockwave(x, y, skin.lead, effect.type === 'gearSync' ? 9 : 7, 0.45);
        note(FIELD_W / 2, 88, `${effect.code} ${GEAR[effect.code]?.name ?? ''} ${effect.type === 'gearSync' ? `合流 ×${effect.level}` : '入列'}`, skin.lead);
        bang(skin.lead, 0.24);
        stage.punch(1.8);
      } else if (effect.type === 'gearFull') {
        note(FIELD_W / 2, 88, `编队已满 ×${MAX_FORMATION} · 折算战果`, gearSkin(effect.code).lead);
      } else if (effect.type === 'gearSwap') {
        note(FIELD_W / 2, 88, `${effect.code} 换装 · 编队重置`, gearSkin(effect.code).lead);
      } else if (effect.type === 'gearBlock') {
        // 僚机替主机挡下致命一击：这一下必须比「掉翼」更响，玩家才记得住这笔取舍。
        const skin = gearSkin(effect.code);
        spark(effect.x ?? FIELD_W / 2, effect.y ?? 120, skin.lead, 24, 52);
        shockwave(effect.x ?? FIELD_W / 2, effect.y ?? 120, skin.lead, 13, 0.55);
        shockwave(effect.x ?? FIELD_W / 2, effect.y ?? 120, '#ffffff', 8, 0.3);
        note(FIELD_W / 2, 90, `僚机替挡 · 编队 -1`, skin.lead);
        bang(skin.lead, 0.42);
        stage.punch(3.4);
      } else if (effect.type === 'gearLost') {
        note(FIELD_W / 2, 100, effect.reason === 'block' ? '最后一架僚机耗尽' : '掉命 · 编队 -1', HAZARD.warm);
      } else if (effect.type === 'gearGone') {
        note(FIELD_W / 2, 104, `${effect.code} 装备飘走了`, HAZARD.warm);
      } else if (effect.type === 'burst') {
        spark(effect.x, effect.y, HAZARD.lab, 16, 58);
        shockwave(effect.x, effect.y, HAZARD.lab, 12, 0.5);
        bang(HAZARD.lab, 0.22);
      } else if (effect.type === 'arc') {
        arcs.push({ x1: effect.x1, y1: effect.y1, x2: effect.x2, y2: effect.y2, life: 0.14, age: 0 });
        if (arcs.length > MAX_ARCS) arcs.shift();
      } else if (effect.type === 'bare') {
        note(FIELD_W / 2, 108, '裸机！', HAZARD.warm);
        stage.punch(1.4);
      } else if (effect.type === 'carrier') {
        note(FIELD_W / 2, 56, `掉落 ${effect.code} 机翼`, HAZARD.gold);
      } else if (effect.type === 'escaped') {
        // 火箭带着一套火力飞出了画面。一声不吭的话，玩家只会觉得「这关的机翼呢？」。
        note(FIELD_W / 2, 64, `${effect.code} 机翼溜走了`, HAZARD.warm);
      } else if (effect.type === 'lost') {
        // 自己弃掉的翅膀飘出了画面：投资清零，同样不该静默。
        note(FIELD_W / 2, 104, `${effect.code} 机翼飘走了`, HAZARD.warm);
      } else if (effect.type === 'skip') {
        note(FIELD_W / 2, 66, '跳关 · 省 4 关', HAZARD.cool);
        stage.punch(2.4);
      } else if (effect.type === 'bossIn') {
        // 入场演出：红边脉冲加中央 WARNING 大字，比一句小飘字压得住场面。
        warning = { age: 0, life: 1.7 };
        stage.punch(2.2);
        note(FIELD_W / 2, 52, '弱点已标出', HAZARD.gold);
      } else if (effect.type === 'bossDying') {
        // 过载开始：全场一暗一震，弹幕已在 hush 里化为火花。
        bang(HAZARD.warm, 0.18);
        stage.punch(2.6);
        note(effect.x, effect.y, '核心过载', HAZARD.warm);
      } else if (effect.type === 'bossBlast') {
        spark(effect.x, effect.y, HAZARD.gold, 16, 50, ALT.boss);
        shockwave(effect.x, effect.y, HAZARD.gold, 8.5, 0.4, ALT.boss);
        stage.punch(1.1);
      } else if (effect.type === 'hush') {
        // 弹幕湮灭：每一发原地炸成两粒青白火花，像整条弹幕同时被收回。
        for (const [x, y] of effect.points ?? []) spark(x, y, '#bfe9ff', 2, 16);
      } else if (effect.type === 'bossKill') {
        const bx = effect.x ?? FIELD_W / 2;
        const by = effect.y ?? 40;
        spark(bx, by, HAZARD.gold, 30, 70, ALT.boss);
        shockwave(bx, by, HAZARD.gold, 26, 0.9, ALT.boss);
        shockwave(bx, by, '#fff3c4', 16, 0.6, ALT.boss);
        bang('#fff3c4', 0.4);
        stage.punch(6);
      } else if (effect.type === 'die') {
        spark(effect.x ?? FIELD_W / 2, effect.y ?? 120, HAZARD.warm, 22, 60);
        shockwave(effect.x ?? FIELD_W / 2, effect.y ?? 120, HAZARD.warm, 12, 0.5);
        stage.punch(4.4);
      }
    }
  };

  const syncShip = (state, dt = 0) => {
    const data = state.ship;
    const tier = data.wing ? Math.min(3, Math.max(1, data.tier ?? 1)) : 1;
    const surge = (data.overdrive ?? 0) > 0;
    const trim = TIER_COLOR[tier - 1];
    // 过载是「限时的一层」，颜色必须和满阶的暖金分开，否则玩家读不出还剩多久。
    const glow = surge ? OVERDRIVE_COLOR : trim;
    // 升阶不是换皮，是一次展开：0.55 秒从 35% 长到 100%。
    phaseAnim = Math.min(1, phaseAnim + dt / 0.55);
    surgeFlash = Math.max(0, surgeFlash - dt * 1.6);
    const unfold = 1 - (1 - phaseAnim) ** 3;

    const paint = (target) => {
      const ud = target.userData;
      ud.wingSlot.visible = Boolean(data.wing);
      let active = null;
      if (data.wing) {
        // 换翼真的换外形：按型号现造一副，炮口数与朝向都照 wings.js 的 volley 来。
        active = wingFor(target, ud.wingSlot, data.wing);
        for (const tip of active.userData.tips) {
          tip.material.color.set(trim);
          tip.material.emissive.set(trim);
          // 上限压在 1.9：这是**不透明**的实体材质，3.5 的自发光在屏幕上是一根纯白的灯条，
          // 两翼各一根，看上去像两团白斑糊住了翼根（实测查出来的）。
          // 亮度靠「细而亮」而不是「整坨发白」，所以宁可低一点。
          tip.material.emissiveIntensity = 0.5 + tier * 0.3;
        }
        // 阶级 = 亮着的灯珠数。Mk.III 三颗全亮，脱手飞出去的翼也标着同一套阶级。
        for (const [i, pip] of active.userData.pips.entries()) {
          pip.visible = i < tier;
          pip.material.color.set(trim);
          pip.material.emissive.set(trim);
        }
        // 翼面共鸣导线：Mk.II 亮中间一条，Mk.III／过载三条全亮。
        // 亮但不过曝：三条 3.8 格长的加色横条叠在翼面上，给 0.85 会直接糊成一片白金，
        // 反而看不出「三条」这件事。
        for (const { mesh, lane } of active.userData.spines ?? []) {
          mesh.visible = (tier >= 2 || surge) && (lane === 1 || tier >= 3 || surge);
          mesh.material.color.set(glow);
          mesh.material.opacity = tier >= 3 || surge ? 0.34 : 0.28;
        }
      }
      // 尾焰跟着下潜拉长：加速这件事得看得见。三个喷口是一组，拉的是它的纵向（z）。
      // 阶级也加成尾焰：火力更猛的机体喷得更凶。
      const boost = (data.dive > 0 ? 2.2 : 1) * (1 + (tier - 1) * 0.14);
      ud.flame.scale.set(1, 1, boost);
      ud.flame.position.z = 4.6 + boost * 0.6;
      ud.ring.visible = data.invuln > 0;
      if (data.invuln > 0) {
        const pulse = 1 + Math.sin(data.invuln * 20) * 0.08;
        ud.ring.scale.setScalar(pulse);
        ud.ring.material.color.set(data.dive > 0 ? HAZARD.cool : '#f6f4ee');
      }
      return active;
    };

    // 一点悬浮起伏：机体在斜俯视下本来是完全刚性的，加一点点上下浮动
    // 就不会像一张贴在栅格上的贴纸。幅度只有 0.12 格，判定层当然不知道这件事。
    ship.position.set(worldX(data.x), ALT.ship + Math.sin(state.elapsed * 2.4) * 0.12, worldZ(data.y));
    // 侧倾：横向移动多快就压多少。判定层没有这个量，所以这里自己按位移算。
    const drift = data.x - lastX;
    lastX = data.x;
    ship.rotation.z = Math.max(-0.5, Math.min(0.5, -drift * 0.5));
    // 阶级光环：Mk.II 起一道弧环，Mk.III 两道反向全开、整体大一圈。转起来才有能量场的感觉。
    const showTier = data.wing ? Math.min(3, Math.max(1, data.tier ?? 1)) : 1;
    aura.visible = showTier >= 2 || surge;
    for (const [i, arc] of auraArcs.entries()) {
      arc.visible = aura.visible && (showTier >= 3 || surge || i === 0);
      if (arc.visible) {
        arc.rotation.z += dt * (i === 0 ? 3.2 : -2.4) * (surge ? 2 : 1);
        arc.material.opacity = 0.55 + Math.sin(state.elapsed * (showTier >= 3 ? 9 : 6)) * 0.12 + surgeFlash * 0.2;
        arc.material.color.set(glow);
      }
    }
    aura.scale.setScalar((showTier >= 3 ? 1.12 : 1) * (0.75 + unfold * 0.25));

    // 相位翼场：一层层「长开」的科幻结构。全部用 set 覆盖，池子／复用不会跨帧累积。
    // 配色分三路：阶级弧环走暖金、能量骨架走冷青白、棱晶与核心留纯白。
    // 第一版把所有部件都染成阶级色，加色混叠之后整架飞机糊成一团金光，形状反而没了。
    const f = phaseFrame.userData;
    const full = showTier >= 3 || surge;
    const frameGlow = surge ? OVERDRIVE_COLOR : showTier >= 3 ? PHASE_COLOR : TIER_COLOR[1];
    phaseFrame.visible = Boolean(data.wing) && (showTier >= 2 || surge) && state.status !== 'dying';
    phaseFrame.scale.setScalar(0.35 + unfold * 0.65);
    const spin = surge ? 2.2 : 1;
    for (const [i, rail] of f.rails.entries()) {
      rail.visible = showTier >= 2 && (i === 0 || full);
      rail.rotation.z += dt * (i === 0 ? 1.6 : -1.1) * spin;
      rail.material.color.set(frameGlow);
      rail.material.opacity = (i === 0 ? 0.55 : 0.4) + surgeFlash * 0.3 + Math.sin(state.elapsed * 5) * 0.06;
    }
    for (const [i, gyro] of f.gyros.entries()) {
      gyro.visible = full;
      gyro.rotation.y += dt * (i === 0 ? 1.3 : -1.5) * spin;
      gyro.material.color.set(frameGlow);
      gyro.material.opacity = 0.35 + surgeFlash * 0.3;
    }
    for (const [i, crystal] of f.cores.entries()) {
      crystal.visible = showTier >= 2 || surge;
      crystal.rotation.y += dt * 2.4 * spin;
      crystal.rotation.x += dt * 1.1 * spin;
      crystal.position.y = 2.3 + Math.sin(state.elapsed * 3 + i * 2) * 0.28;
      // 棱晶本体只给 0.5：1.6 格半径的白色八面体配 0.9 的加色不透明度，
      // 在屏幕上就是一颗纯白的光球，把整片翼根糊掉（自审截图里查了三轮才定位到它）。
      // 真正的「亮」交给下面那层 2.0 格的光晕球——亮芯 + 晕，才有棱晶的样子。
      crystal.material.color.set('#ffffff');
      crystal.material.opacity = 0.5 + surgeFlash * 0.2;
    }
    for (const conduit of f.conduits) {
      conduit.visible = showTier >= 2 || surge;
      conduit.material.color.set(frameGlow);
      conduit.material.opacity = 0.26 + surgeFlash * 0.24;
    }
    for (const [i, node] of f.nodes.entries()) {
      node.visible = full;
      const angle = state.elapsed * 1.5 * spin + (Math.PI * 2 * i) / f.nodes.length;
      node.position.set(Math.cos(angle) * 8.8, 0.7, Math.sin(angle) * 8.8);
      node.material.color.set('#ffffff');
      node.material.opacity = 0.85 + surgeFlash * 0.15;
    }
    f.core.visible = full;
    if (full) {
      f.core.rotation.y += dt * 1.8 * spin;
      f.core.scale.setScalar(1 + Math.sin(state.elapsed * (surge ? 14 : 7)) * 0.16 + surgeFlash * 0.2);
      f.core.material.color.set('#ffffff');
      f.core.material.opacity = 0.55 + surgeFlash * 0.25;
    }

    // 能量翼：Mk.II 只展开内半段，Mk.III／过载整片张开。缩的是「从翼根往外长」，
    // 不是把整片翼缩小一半——所以翼肋的位置也跟着往根部收。
    // 透明度压得很低：加色混叠下，一片 0.16 的翼面叠上三根 0.68 的翼肋，
    // 翼根那块会直接烧成白色，机体轮廓反而没了（这是自审截图里最严重的一条）。
    const span = full ? 1 : 0.55;
    for (const [i, sail] of f.sails.entries()) {
      const side = i === 0 ? -1 : 1;
      sail.visible = showTier >= 2 || surge;
      sail.scale.x = side * span;
      sail.material.color.set(frameGlow);
      sail.material.opacity = (full ? 0.07 : 0.05) + surgeFlash * 0.08;
    }
    for (const [i, rib] of f.ribs.entries()) {
      const side = i < 3 ? -1 : 1;
      rib.visible = showTier >= 2 || surge;
      rib.position.x = side * (2.6 + 2.0 * span);
      rib.scale.x = span;
      rib.material.color.set(frameGlow);
      rib.material.opacity = (full ? 0.2 : 0.14) + surgeFlash * 0.1;
    }
    for (const [i, halo] of f.halos.entries()) {
      halo.visible = showTier >= 2 || surge;
      halo.position.y = f.cores[i].position.y;
      halo.material.color.set(frameGlow);
      halo.material.opacity = 0.1 + surgeFlash * 0.1;
    }
    f.coreHalo.visible = full;
    f.coreHalo.material.color.set(frameGlow);
    f.coreHalo.material.opacity = 0.06 + surgeFlash * 0.1;
    f.coreRing.visible = full;
    if (full) {
      f.coreRing.rotation.z += dt * 2.2 * spin;
      f.coreRing.material.color.set(frameGlow);
      f.coreRing.material.opacity = 0.5 + surgeFlash * 0.3;
    }
    const worn = paint(ship);

    // 炮口闪光：data.cool 是「距离下一发还有多久」，刚开完火时它等于整段冷却，
    // 于是 cool / wingCool 从 1 衰减到 0——正好是一记枪口焰该有的样子。
    // 每一根管子的精灵材质是各自的，所以五路扇形能看出是哪一路在打。
    const wingCool = data.wing ? wingAtTier(data.wing, tier, surge).cool : 0;
    const heat = wingCool > 0 ? Math.min(1, Math.max(0, data.cool / wingCool)) : 0;
    const canFire = state.status === 'playing' && data.dive <= 0 && ship.visible;
    for (const muzzle of worn?.userData.muzzles ?? []) {
      const flash = muzzle.flash;
      if (!flash) continue;
      flash.visible = canFire;
      if (!canFire) continue;
      // 激光与火焰是持续输出，枪口那团光本来就该更亮更稳。
      const gain = muzzle.kind === 'beam' ? 1.5 : muzzle.kind === 'flame' ? 1.25 : 1;
      // 三次方衰减：枪口焰是一下子亮起来再迅速收掉的，平方还是拖得太久。
      const power = heat ** 3 * gain;
      flash.material.opacity = Math.min(0.85, power);
      flash.scale.setScalar(1.9 + power * 2.6);
    }

    // 翼尖航灯：两盏错相位地慢慢呼吸。「它还在飞」这件事靠这一点节奏读出来。
    // 缩放上限压在 2.2：再大，光晕就会越过 12.8 格的判定翼展，变成「看起来更宽」。
    for (const [i, beacon] of (worn?.userData.beacons ?? []).entries()) {
      const beat = 0.5 + Math.sin(state.elapsed * 2.6 + i * Math.PI) * 0.5;
      beacon.material.opacity = 0.16 + beat * 0.38;
      beacon.scale.setScalar(1.5 + beat * 0.4);
    }

    // 发动机：三层羽流各抖一个频率，喷口环随推力一张一缩。
    // 上一版三个锥体是静止的，缩到手机上就是三条死掉的蓝线。
    const ud = ship.userData;
    const throttle = (data.dive > 0 ? 1.35 : 1) * (1 + (tier - 1) * 0.08);
    for (const [i, item] of (ud.plumeFires ?? []).entries()) {
      const wobble = 0.88 + Math.sin(state.elapsed * 27 + i * 2.1) * 0.12;
      item.fire.scale.set(wobble, wobble, 1);
      item.core.scale.set(1.1 - wobble * 0.1, 1.1 - wobble * 0.1, 1);
      item.soft.scale.set(wobble * throttle, wobble * throttle, throttle);
      item.core.material.opacity = 0.7 + Math.sin(state.elapsed * 31 + i) * 0.16;
    }
    for (const [i, ring] of (ud.nozzleRings ?? []).entries()) {
      const push = 1 + Math.sin(state.elapsed * 18 + i * 1.7) * 0.1 + heat * 0.12;
      ring.mesh.scale.setScalar(push * (0.9 + throttle * 0.1));
      ring.mesh.material.opacity = 0.45 + push * 0.25;
    }
    if (ud.sensorHalo) {
      ud.sensorHalo.material.opacity = 0.4 + Math.sin(state.elapsed * 4.5) * 0.18;
      ud.sensorHalo.scale.setScalar(2.2 + Math.sin(state.elapsed * 4.5) * 0.3);
    }

    // 无敌期只闪机身，护盾环常亮——不然看不出还剩多久。
    // 当前那副机翼的材质也要跟着闪，否则机身半透明而翼还是实心的。
    // 淡出按各自基准来：0.3 的柔和羽流闪成 1，会变成「越挨打飞机越亮」。
    const blink = data.invuln > 0 && data.dive <= 0 && Math.floor(data.invuln * 12) % 2 === 0;
    const fade = (mat) => {
      // 每帧由下面那些循环自己写透明度的材质（航灯、共鸣导线、喷口环、传感器光晕），
      // 这里一碰就会把它们的呼吸／阶级色抹平——所以它们带 driven 标记，跳过。
      if (mat.userData.driven) return;
      const base = mat.userData.baseOpacity ?? 1;
      mat.opacity = blink ? base * 0.4 : base;
    };
    for (const mat of ship.userData.mats) fade(mat);
    if (worn) for (const mat of worn.userData.mats) fade(mat);
    ship.visible = state.status !== 'dying';

    // 量子分身：镜像那一侧真的有一具半透明机身在开火。
    const mirrored = Boolean(data.wing && WINGS[data.wing]?.echo);
    echo.visible = mirrored && ship.visible;
    if (mirrored) {
      echo.position.set(worldX(FIELD_W - data.x), ALT.ship, worldZ(data.y));
      echo.rotation.z = -ship.rotation.z;
      paint(echo);
    }

    // 相位残影：只在下潜时攒，这一串本身就是「现在打不到我」。
    trailPool.begin();
    if (state.status !== 'playing') trail.length = 0;
    else if (data.dive > 0) {
      trail.push({ x: data.x, y: data.y });
      while (trail.length > TRAIL_LEN) trail.shift();
    } else if (trail.length) trail.shift();
    for (const [i, spot] of trail.entries()) {
      const mesh = trailPool.take();
      mesh.position.set(worldX(spot.x), ALT.ship, worldZ(spot.y));
      mesh.material.opacity = ((i + 1) / trail.length) * 0.3;
    }
    trailPool.end();

    orbPool.begin();
    if (ship.visible) {
      for (const orb of orbsOf(data)) {
        const mesh = orbPool.take();
        mesh.position.set(worldX(orb.x), ALT.ship + 0.6, worldZ(orb.y));
        mesh.scale.setScalar(orb.r);
        mesh.rotation.y += 0.2;
      }
    }
    orbPool.end();
  };

  /**
   * 僚机编队。目标坐标直接读判定层的 escortsOf（纯函数），这一层只做插值与演出：
   * 延迟跟随像有惯性、新僚机从屏幕下方俯冲入列、每架有独立的炮口闪光与拖尾。
   * 判定层完全不知道这些。
   *
   * 刻意不画主机到僚机的连线：三型各自散开（侧翼 / 前出 / 环绕）之后，
   * 一根线会把它们重新「绑」成挂件，环绕那一路还会被切成一团。
   * 编队关系靠形状、识别色与入列光弧说出来就够了。
   *
   * 位置一律用绝对值覆盖，池子复用不会把 scale / opacity 累乘；僚机不进 hitBoxes，
   * 也不参与无敌闪烁——它是一支跟着飞的小队，不是机身的另一块装甲。
   */
  const syncEscorts = (state, dt = 0) => {
    const world = escortWorld(state);
    const targets = escortsOf(state.ship, world);
    const visible = ship.visible && state.status !== 'dying';
    for (const pool of escortPools.values()) pool.begin();
    const next = new Map();
    const cool = (state.ship.gear ? gearSpec(state.ship.gear)?.fire.cool : 0) ?? 0.5;
    const heat = cool > 0 ? Math.min(1, Math.max(0, (state.ship.gearCool ?? 0) / cool)) : 0;
    for (const escort of targets) {
      const key = `${escort.code}:${escort.index}`;
      const seen = escortPos.get(key);
      const from = seen ?? { x: escort.x, y: escort.y + 26 };
      const follow = Math.min(1, dt * 6.5);
      const px = from.x + (escort.x - from.x) * follow;
      const py = from.y + (escort.y - from.y) * follow;
      next.set(key, { x: px, y: py });
      const mesh = escortPool(escort.code).take();
      const skin = gearSkin(escort.code);
      const ud = mesh.userData;
      mesh.visible = visible;
      // 抬高 1.35 格：僚机停机时贴在主机后方（判定位置不变），但表现层要把它从
      // 三层发动机羽流里拎出来，否则单架编队在屏幕上就是尾焰末端的一团青光。
      // 前出索敌后它离开尾焰，这一层高度照样让它和地面网格分得开。
      // 前出 / 环绕时僚机离主机几十格，斜俯视里只剩几个像素，容易被弹列和尾焰淹没。
      // 按距离等比放大一点点、把识别光晕提亮：只改剪影，判定坐标仍由 escortsOf 给，
      // 僚机也不进 hitBoxes，所以不碰「看到的宽度 = 判定宽度」那条契约。
      const dist = Math.hypot(px - state.ship.x, py - state.ship.y);
      mesh.scale.setScalar(1 + Math.min(0.55, dist / 60));
      mesh.position.set(worldX(px), ALT.ship + 1.35, worldZ(py));
      mesh.rotation.z = Math.max(-0.4, Math.min(0.4, -(escort.x - from.x) * 0.4));
      mesh.rotation.y = Math.sin(state.elapsed * 1.5 + escort.index) * 0.06;
      if (ud.ring) ud.ring.rotation.z += dt * 1.5;
      ud.flash.visible = visible && state.status === 'playing';
      const power = heat ** 3;
      if (ud.flash.visible) {
        ud.flash.material.color.set(skin.lead);
        ud.flash.material.opacity = Math.min(0.95, 0.12 + power * 0.85);
        ud.flash.scale.setScalar(2.2 + power * 2.0);
      }
      ud.halo.material.color.set(skin.halo);
      ud.halo.material.opacity =
        0.42 + Math.sin(state.elapsed * 3 + escort.index) * 0.1 + Math.min(0.26, dist / 100);
      if (!seen && visible) {
        spark(escort.x, escort.y, skin.lead, 12, 26);
        shockwave(escort.x, escort.y, skin.lead, 6, 0.42);
      }
      // 拖尾只给几粒淡星火：加色混合下多叠几层又会烧成白斑（上一轮的教训）。
      // 离得越远多给一两粒，帮眼睛跟上「它跑到哪去了」，但绝不放成一条亮线。
      if (visible && state.status === 'playing') {
        spark(px, py + 1.4, skin.lead, 1 + Math.min(2, Math.floor(dist / 22)), 5);
        // 开火那一两帧在机首补一小簇火花，把「发射」这件事说出来。
        if (power > 0.86) spark(px, py - 2.2, skin.lead, 2, 9);
      }
    }
    escortPos = next;
    for (const pool of escortPools.values()) pool.end();
  };

  const syncEnemies = (state) => {
    for (const pool of enemyPools.values()) pool.begin();
    for (const foe of state.enemies) {
      const pool = enemyPool(foe.kind);
      const mesh = pool.take();
      const alt = foe.kind === 'ground' ? ALT.ground : ALT.enemy;
      mesh.position.set(worldX(foe.x), alt, worldZ(foe.y));
      const ud = mesh.userData;
      if (ud.spin) ud.spin.rotation.y = foe.age * 1.6;
      // 运载火箭装的是哪一型：世界里的字一定糊，所以交给 2D 叠层按投影位置写。
      if (foe.kind === 'carrier' && foe.wing) {
        marks.push({ x: foe.x, y: foe.y, alt: ALT.enemy + 7, text: foe.wing, color: HAZARD.gold, size: 15 });
      }
      const hurt = foe.hp < foe.maxHp;
      ud.bar.visible = hurt;
      ud.barBack.visible = hurt;
      if (hurt) {
        const ratio = Math.max(0, foe.hp / foe.maxHp);
        ud.bar.scale.set(ratio, 1, 1);
        ud.bar.position.x = -(1 - ratio) * 4.5;
      }
    }
    for (const pool of enemyPools.values()) pool.end();
  };

  const syncBoss = (state) => {
    const data = state.boss;
    boss.visible = Boolean(data);
    if (!data) return;
    const ud = boss.userData;
    boss.position.set(worldX(data.x), ALT.boss, worldZ(data.y));
    const tall = Math.max(6, data.h * 0.55);
    const w = data.w;
    const h = data.h;
    const rage = Boolean(data.rage);
    const dying = Boolean(data.dying);
    const progress = dying ? 1 - Math.max(0, data.deathTimer) / BOSS_DEATH_TIME : 0;

    // ---- 母舰：中央龙骨、V 字舰艏、外倾侧翼、分层舰桥 ----
    // 母舰刻意只占判定盒中间那一段：两侧必须留出真空，四艘子舰才读得出「分离的舰」，
    // 而不是粘在母舰边缘的装饰片。这是首轮实拍最扎眼的问题。
    ud.shell.scale.set(w * 0.34, tall * 0.5, h * 0.82);
    // 轮廓线跟着龙骨一起缩放：它是 Boss 在深蓝网格上唯一稳定的「这是一艘舰」的线索。
    ud.shellEdge.scale.copy(ud.shell.scale);
    ud.prow.scale.set(w * 0.26, tall * 0.44, h * 0.4);
    ud.prow.position.set(0, 0, h * 0.46);
    ud.prow.rotation.y = Math.sin(data.age * 0.6) * 0.04;
    for (const [i, plate] of ud.plates.entries()) {
      const side = i === 0 ? -1 : 1;
      plate.scale.set(w * 0.1, tall * 0.72, h * 0.62);
      plate.position.set(side * w * 0.2, 0, 0);
    }
    ud.crown.scale.set(w * 0.16, tall * 0.5, h * 0.28);
    ud.crown.position.set(0, tall * 0.5, -h * 0.12);
    ud.bridgeCore.scale.setScalar(w * 0.05);
    ud.bridgeCore.position.set(0, tall * 0.82, -h * 0.12);
    ud.bridgeCore.rotation.y = data.age * 1.4;
    ud.bridgeFlare.position.copy(ud.bridgeCore.position);
    ud.bridgeFlare.material.opacity = 0.35 + Math.sin(data.age * 4) * 0.12;

    // 两道光边只勾母舰自己的正面，别横贯整支舰队：0.86w 那一版把四艘子舰
    // 全压在同一条亮杠底下，看起来又变回「一整块」。
    ud.rim.scale.set(w * 0.36, 1.4, 1.4);
    ud.rim.position.set(0, -tall * 0.3, h * 0.44);
    ud.brow.scale.set(w * 0.26, 1.1, 1.1);
    ud.brow.position.set(0, tall * 0.42, h * 0.18);

    // ---- 引擎阵列：三枚喷口沿舰尾排开，共用的两份材质整体脉动 ----
    const beat = 0.6 + Math.sin(data.age * (rage ? 15 : 8)) * 0.25;
    ud.engineMat.opacity = beat;
    ud.engineFlareMat.opacity = beat * 0.82;
    for (const [i, engine] of ud.engines.entries()) {
      engine.position.set((i - 1) * w * 0.14, 0, -h * 0.44);
      engine.scale.setScalar(w * 0.052);
      engine.children[1].scale.setScalar(2.4 + beat * 1.4);
    }

    // ---- 龙骨能量脊：五枚节点错相流动，像能量在往舰艏送 ----
    for (const [i, node] of ud.spine.entries()) {
      node.position.set(0, tall * 0.3, (i - 2) * h * 0.16);
      node.scale.setScalar(w * 0.026);
      node.userData.mat.opacity = 0.18 + 0.62 * Math.max(0, Math.sin(data.age * 3.4 - i * 0.85));
    }

    // 护盾环：半径压在判定半宽里，转起来给整支舰队一个「同一阵营」的轮廓。
    ud.shield.scale.setScalar(w * 0.46);
    ud.shield.position.y = -tall * 0.2;
    ud.shield.rotation.z = data.age * (rage ? 0.9 : 0.35);
    ud.shieldMat.opacity = rage ? 0.4 : 0.24;

    // ---- 护卫子舰：按走位变阵、缓慢巡航；死亡过载时整队向外散开 ----
    // 位置每帧用绝对值重算，所以 multiplyScalar 不会跨帧累积。
    const form = FLEET_FORMATIONS[data.pattern] ?? FLEET_FORMATIONS.sweep;
    for (const [i, escort] of ud.fleet.entries()) {
      escort.visible = i < form.count;
      if (!escort.visible) continue;
      const [rx, rz] = form.slots[i];
      const phase = data.age * (rage ? 1.7 : 0.8) + i * 1.7;
      escort.position.set(
        rx * w + Math.sin(phase) * w * 0.012,
        tall * 0.1 + Math.sin(phase * 1.3) * tall * 0.12,
        rz * h + Math.cos(phase * 0.8) * h * 0.02,
      );
      if (dying) escort.position.multiplyScalar(1 + progress * 0.42);
      escort.rotation.z = Math.sin(phase) * 0.08 + (dying ? progress * (i % 2 ? 0.5 : -0.5) : 0);
      escort.rotation.y = Math.sin(phase * 0.6) * 0.16;
      escort.scale.setScalar(w * 0.05);
    }

    // ---- 配色：半血换姿态，死亡过载烧白 ----
    const hullColor = dying ? '#e8d0c0' : rage ? FLEET.rage : FLEET.hull;
    const emissive = dying ? '#ff9a5e' : rage ? '#ff2f5e' : FLEET.hullLit;
    for (const mat of ud.hullMats) {
      mat.color.set(hullColor);
      mat.emissive.set(emissive);
      mat.emissiveIntensity = dying ? 0.95 + Math.sin(data.age * 42) * 0.3 : rage ? 0.9 : 0.7;
    }
    const energyColor = rage && !dying ? FLEET.rageEnergy : FLEET.energy;
    for (const mat of ud.energyMats) mat.color.set(energyColor);
    // 所有舰体棱边是独立的 LineBasicMaterial，不跟着 hull/energy 两族走。
    for (const mat of ud.edgeMats) mat.color.set(rage && !dying ? FLEET.rageEnergy : FLEET.energy);
    // 引擎与舰桥光晕是独立 Sprite 材质，不在 energyMats 里，手动跟上同一套色。
    ud.engineMat.color.set(rage && !dying ? FLEET.rageEnergy : FLEET.engine);
    ud.engineFlareMat.color.set(rage && !dying ? FLEET.rageEnergy : FLEET.engine);
    ud.bridgeFlare.material.color.set(rage && !dying ? FLEET.rageEnergy : FLEET.engine);
    boss.rotation.x = rage ? Math.sin(data.age * 8) * 0.03 : 0;
    boss.rotation.z = dying ? (Math.random() - 0.5) * 0.08 : 0;
    boss.position.y = ALT.boss - (dying ? progress * 2.6 : 0);

    // 弱点环照 weakSpots() 摆，所以「该往哪打」永远和判定一致。
    const spots = weakSpots(data);
    const pulse = 0.78 + Math.sin(data.age * 6) * 0.22;
    for (const [i, spot] of ud.spots.entries()) {
      const src = spots[i];
      spot.visible = Boolean(src) && !dying;
      if (!src) continue;
      // **弱点环是 boss 这一层的子物体**，所以位置要写成相对量。
      // 之前照世界坐标写，等于把 Boss 自己的位移又加了一遍：环因此飘在 Boss 头顶两倍高的地方。
      const alt = data.weak === 'low' ? ALT.low : ALT.boss + tall * 0.02;
      // 新舰艏比旧方砖更靠前，光环也跟着贴到舰队正面，别埋进舰体里。
      const forward = data.weak === 'low' ? 1.2 : h * 0.62;
      spot.position.set(
        worldX(src.x) - worldX(data.x),
        alt - ALT.boss,
        worldZ(src.y) - worldZ(data.y) + forward,
      );
      spot.userData.ring.scale.setScalar((src.r / 3.4) * pulse);
      spot.userData.core.scale.setScalar((src.r / 2) * 0.7);
      // 柔光晕比环大一圈：远处只剩十几像素时，靠这团光认出「打这里」。
      spot.userData.halo.scale.setScalar(src.r * 3.4 * pulse);
    }
  };

  const syncDrops = (state) => {
    const keys = WEAKNESS[state.weak]?.keys ?? [];
    dropPool.begin();
    gearDropPool.begin();
    for (const drop of state.drops) {
      if (drop.kind === 'gear') {
        // 六边形收纳舱：不翻滚、只缓慢自转，颜色按型号逐帧 set 覆盖（池子会复用）。
        const mesh = gearDropPool.take();
        const ud = mesh.userData;
        const skin = gearSkin(drop.code);
        const fading = drop.life < 1.4 && Math.floor(drop.life * 10) % 2 === 0;
        ud.shellMat.color.set(skin.body);
        ud.shellMat.emissive.set(skin.edge);
        ud.rimMat.color.set(skin.lead);
        ud.coreMat.color.set(skin.chrome);
        ud.halo.material.color.set(skin.halo);
        ud.halo.material.opacity = fading ? 0.1 : 0.28 + Math.sin(state.elapsed * 4) * 0.07;
        ud.spin.rotation.y += 0.024;
        ud.spin.scale.setScalar(fading ? 0.7 : 0.9);
        mesh.position.set(worldX(drop.x), ALT.shot + 1 + Math.sin(state.elapsed * 3 + drop.x) * 0.55, worldZ(drop.y));
        marks.push({
          x: drop.x,
          y: drop.y,
          alt: ALT.shot + 12,
          text: drop.code,
          color: skin.lead,
          size: 16,
          sub: gearSpec(drop.code)?.name ?? null,
          subColor: skin.chrome,
        });
        continue;
      }
      const mesh = dropPool.take();
      const ud = mesh.userData;
      // 场上那副翼**就是机翼本身**：弃翼是把一整套火力扔出去，扔出去的东西必须看得出是哪一套。
      const wing = wingFor(mesh, ud.spin, drop.code);
      // 能打进本关弱点的描一圈金环，不能的整副压暗——别让「捡到才发现是螺丝刀」成为运气问题。
      const usable = keys.includes(drop.code);
      const fading = drop.life < 1.2 && Math.floor(drop.life * 10) % 2 === 0;
      shadeWing(wing, !usable);
      const tier = Math.min(3, Math.max(1, drop.tier ?? 1));
      const trim = TIER_COLOR[tier - 1];
      // 阶级跟着一起脱手：捡回来是第几阶，翼上就亮着几颗。
      for (const [i, pip] of wing.userData.pips.entries()) {
        pip.visible = i < tier;
        pip.material.color.set(trim);
        pip.material.emissive.set(trim);
      }
      for (const tip of wing.userData.tips) {
        tip.material.color.set(trim);
        tip.material.emissive.set(trim);
      }
      // 阶级跟着翼走：脱手的道具上，共鸣导线也按阶级亮着，捡回来是什么样一眼看得出。
      // 这里只改颜色与可见性，不碰 opacity——压暗／还原那一笔由 shadeWing 管。
      for (const { mesh, lane } of wing.userData.spines ?? []) {
        mesh.visible = tier >= 2 && (lane === 1 || tier >= 3);
        mesh.material.color.set(usable ? trim : '#8b93a7');
      }

      // 抛出去再落回来：自己脱手的那 0.42 秒抬一把、翻得飞快，之后转速降下来平着飘。
      // 运载火箭掉的那枚没有这一下（它不是被谁扔出来的），所以只有 mine 走抛物线。
      const age = Math.max(0, WING_DRIFT - drop.life);
      const toss = drop.mine ? Math.min(1, age / TOSS_TIME) : 1;
      const hop = Math.sin(Math.PI * toss) * 7.5;
      mesh.position.set(worldX(drop.x), ALT.shot + 1 + hop, worldZ(drop.y));
      ud.spin.rotation.y += 0.05 + (1 - toss) * 0.55;
      ud.spin.rotation.x = (1 - toss) * 2.2;
      ud.spin.scale.setScalar(fading ? 0.62 : 0.8);
      ud.halo.visible = usable && !fading;

      // 型号与阶级写在 2D 叠层上：道具在屏幕上只有二十像素，贴图文字必糊。
      // 打不进本关弱点的压成灰字，和压暗的机翼说同一件事。
      marks.push({
        x: drop.x,
        y: drop.y,
        alt: ALT.shot + 13 + hop,
        text: drop.code,
        color: usable ? (drop.mine ? HAZARD.cool : HAZARD.gold) : '#8b93a7',
        size: 16,
        sub: tier > 1 ? tierOf(tier).mark : null,
        subColor: trim,
      });
    }
    dropPool.end();
    gearDropPool.end();
  };

  const syncGate = (state) => {
    const data = state.gate;
    gate.visible = Boolean(data);
    if (!data) return;
    const ud = gate.userData;
    gate.position.set(worldX(data.x), 0, worldZ(data.y));
    for (const post of ud.posts) post.position.x = (post.userData.side * data.w) / 2;
    ud.lintel.scale.set(data.w, 1, 1);
    ud.veil.scale.set(data.w, 10, 1);
    ud.veil.material.opacity = 0.14 + Math.abs(Math.sin(performance.now() / 420)) * 0.12;
    // 「跳关」两个字抬到门框上方一截：它和道具飘字常常挤在同一片位置。
    marks.push({ x: data.x, y: data.y, alt: 21, text: '跳关', color: HAZARD.cool, size: 18 });
  };

  const syncShots = (state) => {
    for (const pool of shotPools.values()) pool.begin();
    for (const shot of state.shots) {
      const key = shotKey(shot);
      const mesh = shotPool(key).take();
      // 僚机实体抬在 ALT.ship + 1.35，弹也画在同一层，才像「从僚机嘴里喷出来」。
      // 之前统一用 ALT.shot，弹从僚机脚下冒出来又被主机尾焰盖住，看着像没开火。
      const alt = shot.source === 'gear' ? ALT.ship + 1.35 : shot.ground ? ALT.low : ALT.shot;
      mesh.position.set(worldX(shot.x), alt, worldZ(shot.y));
      // 阶级看得见：Mk.II/III 的弹就是更大一号（引力井自己管比例，反物质弹有自己的脉动）。
      // 用绝对值覆盖而不是乘法：池子里的 mesh 会被反复复用，乘法会跨帧累积。
      const bulk = shot.well || shot.kind === 'anti' ? 1 : 1 + (((shot.tier ?? 1) - 1) * 0.3);
      mesh.scale.setScalar(bulk);
      // 弹体跟着自己的速度转：扇形散射的每一发都朝自己飞的方向。
      // 上一版所有曳光弹都笔直朝着屏幕上方，五路扇形打出来仍是五条竖杠。
      // 取的是速度而不是「第几路」，所以炸弹、跳弹这些改了方向的也不用另写一份。
      const speed = Math.hypot(shot.vx ?? 0, shot.vy ?? 0);
      if (speed > 1) mesh.rotation.y = Math.atan2(-shot.vx, -shot.vy);
      const sheath = mesh.userData.sheath;
      if (sheath) {
        const shotTier = Math.min(3, Math.max(1, shot.tier ?? 1));
        sheath.visible = shotTier >= 2 || Boolean(shot.surge);
        sheath.material.color.set(shot.surge ? OVERDRIVE_COLOR : TIER_COLOR[shotTier - 1]);
        sheath.material.opacity = shot.surge ? 0.62 : shotTier >= 3 ? 0.45 : 0.3;
        sheath.scale.setScalar(shot.surge ? 11 : shotTier >= 3 ? 8 : 6.5);
      }
      if (shot.well) {
        // 引力井：吸积环的半径就是真实作用范围，它把射程画了出来。
        const ud = mesh.userData;
        ud.ring.scale.setScalar(shot.well);
        ud.inner.scale.setScalar(shot.well);
        ud.ring.rotation.z = shot.age * 3;
        ud.inner.rotation.z = -shot.age * 5;
        if (ud.haze) ud.haze.scale.setScalar(shot.well * 3.4);
      } else if (shot.kind === 'anti') {
        mesh.scale.setScalar(1 + Math.sin(shot.age * 18) * 0.2);
        mesh.rotation.y = shot.age * 6;
        if (mesh.userData.rim) mesh.userData.rim.rotation.z = -shot.age * 4;
      } else if (shot.kind === 'flame' || shot.kind === 'shard') {
        mesh.rotation.x += 0.3;
        mesh.rotation.y += 0.2;
        // 越老越淡：火焰只活 0.34 秒，碎片也差不多——尾端要散掉，
        // 否则看起来是「被推出来的实体」，而不是烧完／炸完就没了。
        const die = Math.max(0.25, 1 - shot.age / (shot.life || 0.34));
        const base = shot.kind === 'flame' ? { outer: 0.34, body: 0.72, core: 0.88 } : { shell: 0.55, core: 0.95 };
        for (const [part, value] of Object.entries(base)) {
          const node = mesh.userData[part];
          if (node) node.material.opacity = value * die;
        }
      } else if (shot.kind === 'beam') {
        // 激光：芯与中层按高频小幅呼吸，头部那团光一通猛闪。
        // 十几发叠在同一列上，呼吸相位错开，看起来就是一根在「滋滋」响的光束。
        const ud = mesh.userData;
        const throb = 0.5 + Math.sin(shot.age * 90) * 0.5;
        if (ud.core) ud.core.material.opacity = 0.82 + throb * 0.18;
        if (ud.mid) ud.mid.material.opacity = 0.4 + throb * 0.2;
        if (ud.head) ud.head.scale.setScalar(4.0 + throb * 1.6);
      } else if (shot.homing) {
        // 巡航导弹：两股尾焰错相喷，转向时整枚已经按速度旋转，尾焰跟着一跳一跳，
        // 于是「它在追」这件事不用看轨迹也能读出来。opacity 绝对值覆盖，池子复用不累积。
        const ud = mesh.userData;
        for (const [i, jet] of (ud.jets ?? []).entries()) {
          jet.material.opacity = 0.4 + Math.sin(shot.age * 26 + i * 1.9) * 0.22;
        }
        if (ud.head) ud.head.material.opacity = 0.82 + Math.sin(shot.age * 18) * 0.12;
      } else if (shot.kind === 'escort') {
        // 双股离子矢自己会呼吸：每架相位错开，三架编队打出来是三股不同节奏的光，
        // 而不是三根一模一样的静态竖杠。池子复用，opacity / scale 一律绝对值覆盖。
        const ud = mesh.userData;
        const pulse = 0.72 + Math.sin(shot.age * 34 + (shot.escort ?? 0) * 1.7) * 0.28;
        if (ud.head) ud.head.material.opacity = 0.72 + pulse * 0.26;
        if (ud.tip) ud.tip.scale.set(1, 0.55, 1.2 + pulse * 0.5);
        for (const rail of ud.rails ?? []) rail.material.opacity = 0.55 + pulse * 0.35;
      }
    }
    for (const pool of shotPools.values()) pool.end();
  };

  const syncFoes = (state) => {
    for (const pool of foePool.values()) pool.begin();
    for (const bullet of state.foes) {
      const mesh = foeMesh(bullet.kind === 'shell' ? 'shell' : 'pellet').take();
      mesh.position.set(worldX(bullet.x), ALT.shot, worldZ(bullet.y));
    }
    for (const pool of foePool.values()) pool.end();
  };

  const updateSparks = (dt) => {
    sparks = sparks.filter((item) => item.age < item.life);
    const pos = sparkGeo.getAttribute('position');
    const col = sparkGeo.getAttribute('color');
    for (const [i, item] of sparks.entries()) {
      item.age += dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      const fade = Math.max(0, 1 - item.age / item.life);
      pos.setXYZ(i, item.x, item.y, item.z);
      col.setXYZ(i, item.r * fade, item.g * fade, item.b * fade);
    }
    // 用不到的点涂黑：加色混合下黑就是透明，省得每帧改 draw range。
    for (let i = sparks.length; i < MAX_SPARKS; i += 1) col.setXYZ(i, 0, 0, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };

  const updateArcs = (dt) => {
    arcs = arcs.filter((item) => item.age < item.life);
    const pos = arcGeo.getAttribute('position');
    let cursor = 0;
    for (const item of arcs) {
      item.age += dt;
      let px = worldX(item.x1);
      let pz = worldZ(item.y1);
      for (let s = 1; s <= ARC_SEGMENTS; s += 1) {
        const t = s / ARC_SEGMENTS;
        const jag = s === ARC_SEGMENTS ? 0 : (Math.random() - 0.5) * 5;
        const nx = worldX(item.x1 + (item.x2 - item.x1) * t) + jag;
        const nz = worldZ(item.y1 + (item.y2 - item.y1) * t);
        pos.setXYZ(cursor, px, ALT.shot, pz);
        pos.setXYZ(cursor + 1, nx, ALT.shot, nz);
        cursor += 2;
        px = nx;
        pz = nz;
      }
    }
    for (let i = cursor; i < MAX_ARCS * ARC_SEGMENTS * 2; i += 1) pos.setXYZ(i, 0, -400, 0);
    pos.needsUpdate = true;
    arcMesh.visible = arcs.length > 0;
  };

  const project = new THREE.Vector3();
  const toScreen = (x, y, alt = ALT.ship) => {
    project.set(worldX(x), alt, worldZ(y));
    project.project(stage.camera);
    return { x: ((project.x + 1) / 2) * size.w, y: ((1 - project.y) / 2) * size.h };
  };

  /**
   * 拖动指示：手指按在哪、船跟着谁。
   * 看不见的摇杆等于没有摇杆——相对拖动按下去画面若毫无反应，
   * 玩家的结论只会是「这游戏不能触摸操控」。所以按住就画一圈，并连一条线到船身。
   */
  const drawTouch = (state, pointers) => {
    if (!pointers?.length || state.status !== 'playing') return;
    const rect = host.getBoundingClientRect();
    const ship = toScreen(state.ship.x, state.ship.y);
    for (const finger of pointers) {
      const x = finger.x - rect.left;
      const y = finger.y - rect.top;
      ctx.strokeStyle = 'rgba(127, 227, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(127, 227, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      // 这条线就是「相对拖动」这件事本身：手指不必压在船上。
      ctx.strokeStyle = 'rgba(127, 227, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ship.x, ship.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  /** 全屏四边渐暗带。裸机警示和 WARNING 演出都用它：先压黑再叠色，任何章节底色上都读得出。 */
  const band = (alpha, color) => {
    const vertical = ctx.createLinearGradient(0, 0, 0, size.h);
    const horizontal = ctx.createLinearGradient(0, 0, size.w, 0);
    for (const grad of [vertical, horizontal]) {
      grad.addColorStop(0, `rgba(${color}, ${alpha})`);
      grad.addColorStop(0.17, `rgba(${color}, 0)`);
      grad.addColorStop(0.83, `rgba(${color}, 0)`);
      grad.addColorStop(1, `rgba(${color}, ${alpha})`);
    }
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, size.w, size.h);
  };

  // 关掉动效的人是真的不想看动效：速度线直接省掉，信息由下潜无敌环照常传达。
  const calmMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const drawOverlay = (state, dt, pointers) => {
    ctx.clearRect(0, 0, size.w, size.h);

    // 裸机警示：画面四边泛起一层会呼吸的红。再挨一下就掉命，值得一个躲不开的提示。
    if (!state.ship.wing && state.ship.dive <= 0 && state.status === 'playing') {
      const pulse = 0.34 + Math.sin(state.elapsed * 7) * 0.14;
      band(0.5, '4, 2, 10');
      band(pulse, '255, 47, 94');
    }

    // 下潜速度线：往屏幕外放射的短条。世界在后退，这一下「冲出去」的感觉全靠它。
    if (state.status === 'playing' && state.ship.dive > 0 && !calmMotion) {
      const cx = size.w / 2;
      const cy = size.h * 0.46;
      ctx.strokeStyle = '#b4e6ff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const r1 = 60 + Math.random() * 90;
        const len = 40 + Math.random() * 80;
        ctx.globalAlpha = 0.1 + Math.random() * 0.16;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * (r1 + len), cy + Math.sin(angle) * (r1 + len));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    notes = notes.filter((item) => item.age < item.life);
    ctx.textAlign = 'center';
    const scale = Math.min(size.w / 420, 1.4);
    drawTouch(state, pointers);

    // 世界里锚着的字：道具型号、火箭装的型号、跳关门。深色描边保证在任何底色上都读得出。
    ctx.lineJoin = 'round';
    for (const mark of marks) {
      const spot = toScreen(mark.x, mark.y, mark.alt);
      if (spot.x < -40 || spot.x > size.w + 40 || spot.y < -40 || spot.y > size.h + 40) continue;
      ctx.font = `800 ${Math.round(mark.size * Math.min(1.2, scale))}px 'PingFang SC', system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4, 12, 26, 0.9)';
      ctx.strokeText(mark.text, spot.x, spot.y);
      ctx.fillStyle = mark.color;
      ctx.fillText(mark.text, spot.x, spot.y);
      if (mark.sub) {
        ctx.font = `800 ${Math.round(mark.size * 0.72 * Math.min(1.2, scale))}px 'PingFang SC', system-ui, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeText(mark.sub, spot.x, spot.y + mark.size * 1.1);
        ctx.fillStyle = mark.subColor ?? mark.color;
        ctx.fillText(mark.sub, spot.x, spot.y + mark.size * 1.1);
      }
    }
    for (const item of notes) {
      item.age += dt;
      const spot = toScreen(item.x, item.y);
      ctx.globalAlpha = Math.max(0, 1 - item.age / item.life);
      ctx.fillStyle = item.color;
      ctx.font = `800 ${Math.max(15, 20 * scale)}px 'PingFang SC', system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.fillText(item.text, spot.x, spot.y - item.age * 26);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Boss 入场 WARNING：红边脉冲 + 中央大字，闪三下。压住场面比一句飘字管用。
    if (warning) {
      warning.age += dt;
      if (warning.age >= warning.life) warning = null;
      else {
        band(0.24, '255, 47, 94');
        if (Math.floor(warning.age * 5) % 2 === 0) {
          const big = Math.max(24, Math.round(36 * scale));
          ctx.font = `900 ${big}px 'PingFang SC', system-ui, sans-serif`;
          ctx.fillStyle = HAZARD.warm;
          ctx.shadowColor = 'rgba(255, 47, 94, 0.8)';
          ctx.shadowBlur = 18;
          ctx.fillText('WARNING', size.w / 2, size.h * 0.3);
          ctx.shadowBlur = 0;
          ctx.font = `700 ${Math.max(13, Math.round(15 * scale))}px 'PingFang SC', system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(255, 190, 205, 0.9)';
          ctx.fillText('巨型敌机接近', size.w / 2, size.h * 0.3 + big * 0.9);
        }
      }
    }

    // 全屏闪一下，只给进化和反物质爆炸这种「场面变了」的事。
    if (flash) {
      flash.age += dt;
      if (flash.age >= flash.life) flash = null;
      else {
        ctx.globalAlpha = (1 - flash.age / flash.life) * flash.power;
        ctx.fillStyle = flash.color;
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.globalAlpha = 1;
      }
    }
  };

  return {
    notify,

    /**
     * 一个 CSS 像素在船当前那个深度等于几个场地格。输入层拿它换算相对拖动——
     * 2.5D 里这不是常数，照平均值算竖向会比手指慢四成（见 view.js 的 pixelScale）。
     */
    dragScale(fieldY) {
      return pixelScale(size.w / size.h, size.w, size.h, fieldY);
    },

    render(state, dt, pointers) {
      const delta = Math.min(0.05, Math.max(0, dt));
      marks = [];
      stage.setChapter(state.chapter);
      // Boss 战时背景压慢：这时候该看的是弹幕和弱点，不是风景往后跑。
      stage.drift(delta, state.boss ? 0.42 : 1);
      syncShip(state, delta);
      syncEscorts(state, delta);
      syncEnemies(state);
      syncBoss(state);
      syncDrops(state);
      syncGate(state);
      syncShots(state);
      syncFoes(state);
      exhaust(state);
      updateSparks(delta);
      updateArcs(delta);
      updateRings(delta);
      drawOverlay(state, delta, pointers);
      stage.draw(delta);
    },

    dispose() {
      observer.disconnect();
      overlay.remove();
      trailPool.dispose();
      orbPool.dispose();
      dropPool.dispose();
      gearDropPool.dispose();
      for (const pool of escortPools.values()) pool.dispose();
      ringPool.dispose();
      for (const pool of enemyPools.values()) pool.dispose();
      for (const pool of shotPools.values()) pool.dispose();
      for (const pool of foePool.values()) pool.dispose();
      stage.dispose();
    },
  };
}
