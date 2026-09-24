// 表现层的总线。只读模拟状态，一个字段都不写回——所以画错了也影响不到判定。
//
// 分工：
// - stage.js 管场景（相机、地面、星野），models.js 管模型，这一份只做「把状态摆上去」。
// - 世界里的东西全用池子：每帧 begin → take 若干 → end，多出来的藏起来。
// - 中文飘字、全屏闪光、裸机红边走一层 2D 叠层画布：文字用 canvas 比用贴图清楚得多，
//   而且这三样本来就是贴在屏幕上的，不该有透视。

import * as THREE from 'three';
import { FIELD_W } from '../game/rules.js';
import { WEAKNESS, WINGS, tierOf } from '../game/wings.js';
import { orbsOf } from '../game/simulation.js';
import { weakSpots } from '../game/boss.js';
import { ALT, pixelScale, worldX, worldZ } from './view.js';
import { HAZARD, TIER_COLOR } from './palette.js';
import { createStage } from './stage.js';
import {
  createPool,
  glowTexture,
  labelTexture,
  makeBoss,
  makeDrop,
  makeEnemy,
  makeGate,
  makeGhostHull,
  makeOrb,
  makeShip,
  makeShot,
} from './models.js';

const MAX_SPARKS = 320;
const MAX_ARCS = 20;
const ARC_SEGMENTS = 5;
const TRAIL_LEN = 10;

const setLabel = (sprite, text, color) => {
  if (sprite.userData.text === text && sprite.userData.color === color) return;
  sprite.userData.text = text;
  sprite.userData.color = color;
  sprite.material.map = labelTexture(text, color);
  sprite.material.needsUpdate = true;
};

/** 每种火力对应一种模型。同型号的子弹共用一个池子，回声（量子分身）的另开一个。 */
const shotKey = (shot) => {
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
  const echo = makeShip({ ghost: true });
  echo.visible = false;
  stage.world.add(ship);
  stage.world.add(echo);

  const trailPool = createPool(stage.world, makeGhostHull);
  const orbPool = createPool(stage.world, makeOrb);
  const dropPool = createPool(stage.world, makeDrop);
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
        const made = makeShot(kind);
        if (tag === 'echo') {
          const dim = (mesh) => {
            if (mesh.material) mesh.material = mesh.material.clone();
            if (mesh.material) mesh.material.opacity *= 0.55;
          };
          dim(made);
          for (const child of made.children ?? []) dim(child);
        }
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

  let notes = [];
  let flash = null;
  let lastX = FIELD_W / 2;
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

  const note = (x, y, text, color) => {
    notes.push({ x, y, text, color, life: 0.95, age: 0 });
    if (notes.length > 10) notes.shift();
  };

  const bang = (color, power = 0.3) => {
    flash = { color, power, life: 0.26, age: 0 };
  };

  // effects 是逻辑层唯一的出口：火花、飘字、震动、闪光都从这里长出来。
  const notify = (effects = []) => {
    for (const effect of effects) {
      if (effect.type === 'pop') {
        spark(effect.x, effect.y, HAZARD.gold, 5, 24);
        if (effect.chain >= 3) note(FIELD_W / 2, 40, `连消 ${effect.chain}`, '#ffe066');
      } else if (effect.type === 'kill') {
        spark(effect.x, effect.y, effect.kind === 'carrier' ? HAZARD.gold : '#ff8f5e', 10, 38);
      } else if (effect.type === 'wingLost') {
        spark(effect.x, effect.y, HAZARD.warm, 14, 44);
        note(FIELD_W / 2, 100, `${effect.code} 机翼被崩掉`, HAZARD.warm);
        stage.punch(3.2);
      } else if (effect.type === 'jettison') {
        note(FIELD_W / 2, 100, '弃翼下潜', HAZARD.cool);
        stage.punch(1.6);
      } else if (effect.type === 'catch' || effect.type === 'swap') {
        note(FIELD_W / 2, 96, `${effect.code} ${WINGS[effect.code]?.name ?? ''}`, HAZARD.pierce);
      } else if (effect.type === 'evolve') {
        spark(effect.x, effect.y, TIER_COLOR[effect.tier - 1] ?? HAZARD.gold, 18, 40);
        note(FIELD_W / 2, 92, `${effect.code} → ${tierOf(effect.tier).name}`, TIER_COLOR[effect.tier - 1]);
        bang('#ffe9a8', 0.3);
        stage.punch(2);
      } else if (effect.type === 'topped') {
        note(FIELD_W / 2, 92, `${effect.code} 已满阶`, HAZARD.pierce);
      } else if (effect.type === 'burst') {
        spark(effect.x, effect.y, HAZARD.lab, 16, 58);
        bang(HAZARD.lab, 0.22);
      } else if (effect.type === 'arc') {
        arcs.push({ x1: effect.x1, y1: effect.y1, x2: effect.x2, y2: effect.y2, life: 0.14, age: 0 });
        if (arcs.length > MAX_ARCS) arcs.shift();
      } else if (effect.type === 'bare') {
        note(FIELD_W / 2, 108, '裸机！', HAZARD.warm);
        stage.punch(1.4);
      } else if (effect.type === 'carrier') {
        note(FIELD_W / 2, 56, `掉落 ${effect.code} 机翼`, HAZARD.gold);
      } else if (effect.type === 'skip') {
        note(FIELD_W / 2, 66, '跳关 · 省 4 关', HAZARD.cool);
        stage.punch(2.4);
      } else if (effect.type === 'bossIn') {
        note(FIELD_W / 2, 52, '弱点已标出', HAZARD.gold);
      } else if (effect.type === 'bossKill') {
        spark(effect.x ?? FIELD_W / 2, effect.y ?? 40, HAZARD.gold, 26, 70, ALT.boss);
        bang('#fff3c4', 0.34);
        stage.punch(5);
      } else if (effect.type === 'die') {
        spark(effect.x ?? FIELD_W / 2, effect.y ?? 120, HAZARD.warm, 22, 60);
        stage.punch(4.4);
      }
    }
  };

  const syncShip = (state) => {
    const data = state.ship;
    const tier = data.wing ? Math.min(3, Math.max(1, data.tier ?? 1)) : 1;
    const trim = TIER_COLOR[tier - 1];

    const paint = (target) => {
      const ud = target.userData;
      ud.wing.visible = Boolean(data.wing);
      if (data.wing) {
        for (const tip of ud.tips) {
          tip.material.color.set(trim);
          tip.material.emissive.set(trim);
          tip.material.emissiveIntensity = 0.8 + tier * 0.5;
        }
        // 阶级 = 亮着的灯珠数。Mk.III 三颗全亮，脱手飞出去的翼也标着同一套阶级。
        for (const [i, pip] of ud.pips.entries()) {
          pip.visible = i < tier;
          pip.material.color.set(trim);
          pip.material.emissive.set(trim);
        }
      }
      // 尾焰跟着下潜拉长：加速这件事得看得见。三个喷口是一组，拉的是它的纵向（z）。
      const boost = data.dive > 0 ? 2.2 : 1;
      ud.flame.scale.set(1, 1, boost);
      ud.flame.position.z = 4.6 + boost * 0.6;
      ud.ring.visible = data.invuln > 0;
      if (data.invuln > 0) {
        const pulse = 1 + Math.sin(data.invuln * 20) * 0.08;
        ud.ring.scale.setScalar(pulse);
        ud.ring.material.color.set(data.dive > 0 ? HAZARD.cool : '#f6f4ee');
      }
    };

    ship.position.set(worldX(data.x), ALT.ship, worldZ(data.y));
    // 侧倾：横向移动多快就压多少。判定层没有这个量，所以这里自己按位移算。
    const drift = data.x - lastX;
    lastX = data.x;
    ship.rotation.z = Math.max(-0.5, Math.min(0.5, -drift * 0.5));
    paint(ship);

    // 无敌期只闪机身，护盾环常亮——不然看不出还剩多久。
    const blink = data.invuln > 0 && data.dive <= 0 && Math.floor(data.invuln * 12) % 2 === 0;
    for (const mat of ship.userData.mats) mat.opacity = blink ? 0.4 : 1;
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

  const syncEnemies = (state) => {
    for (const pool of enemyPools.values()) pool.begin();
    for (const foe of state.enemies) {
      const pool = enemyPool(foe.kind);
      const mesh = pool.take();
      const alt = foe.kind === 'ground' ? ALT.ground : ALT.enemy;
      mesh.position.set(worldX(foe.x), alt, worldZ(foe.y));
      const ud = mesh.userData;
      if (ud.spin) ud.spin.rotation.y = foe.age * 1.6;
      if (ud.label && foe.wing) setLabel(ud.label, foe.wing, '#3b2200');
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
    ud.shell.scale.set(data.w, tall, data.h);
    ud.shellMat.color.set(data.rage ? '#8c2038' : '#2f4fb0');
    ud.shellMat.emissive.set(data.rage ? '#ff2f5e' : '#4f74d8');
    ud.shellMat.emissiveIntensity = data.rage ? 0.7 : 0.45;
    ud.rim.scale.set(data.w * 0.92, 1.4, 1.4);
    ud.rim.position.set(0, -tall * 0.3, data.h / 2);
    ud.rimMat.color.set(data.rage ? HAZARD.warm : HAZARD.cool);
    for (const [i, plate] of ud.plates.entries()) {
      const side = i === 0 ? -1 : 1;
      plate.scale.set(data.w * 0.16, tall * 1.15, data.h * 0.7);
      plate.position.set((side * data.w) / 2, 0, 0);
    }
    ud.crown.scale.set(data.w * 0.4, tall * 0.4, data.h * 0.45);
    ud.crown.position.set(0, tall * 0.7, -data.h * 0.1);
    // 半血换姿态：怒了之后整具壳往前倾，配色也换掉。
    boss.rotation.x = data.rage ? Math.sin(data.age * 8) * 0.03 : 0;

    // 弱点环照 weakSpots() 摆，所以「该往哪打」永远和判定一致。
    const spots = weakSpots(data);
    const pulse = 0.78 + Math.sin(data.age * 6) * 0.22;
    for (const [i, spot] of ud.spots.entries()) {
      const src = spots[i];
      spot.visible = Boolean(src);
      if (!src) continue;
      const alt = data.weak === 'low' ? ALT.low : ALT.boss + tall * 0.2;
      spot.position.set(worldX(src.x), alt, worldZ(src.y));
      spot.userData.ring.scale.setScalar((src.r / 3.4) * pulse);
      spot.userData.core.scale.setScalar((src.r / 2) * 0.7);
    }
  };

  const syncDrops = (state) => {
    const keys = WEAKNESS[state.weak]?.keys ?? [];
    dropPool.begin();
    for (const drop of state.drops) {
      const mesh = dropPool.take();
      const ud = mesh.userData;
      mesh.position.set(worldX(drop.x), ALT.shot + 1, worldZ(drop.y));
      mesh.rotation.y += 0.05;
      // 能打进本关弱点的描一圈金环，不能的整枚压暗——别让「捡到才发现是螺丝刀」成为运气问题。
      const usable = keys.includes(drop.code);
      const fading = drop.life < 1.2 && Math.floor(drop.life * 10) % 2 === 0;
      const base = drop.mine ? HAZARD.cool : HAZARD.gold;
      ud.gem.material.color.set(usable ? base : '#6b6f80');
      ud.gem.material.emissive.set(usable ? base : '#2b2f3c');
      ud.gem.material.emissiveIntensity = usable ? 0.9 : 0.2;
      ud.halo.visible = usable && !fading;
      setLabel(ud.code, drop.code, '#04101f');
      const tier = Math.min(3, Math.max(1, drop.tier ?? 1));
      ud.mark.visible = tier > 1;
      if (tier > 1) setLabel(ud.mark, tierOf(tier).mark, TIER_COLOR[tier - 1]);
      mesh.scale.setScalar(fading ? 0.72 : 1);
    }
    dropPool.end();
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
  };

  const syncShots = (state) => {
    for (const pool of shotPools.values()) pool.begin();
    for (const shot of state.shots) {
      const key = shotKey(shot);
      const mesh = shotPool(key).take();
      mesh.position.set(worldX(shot.x), shot.ground ? ALT.low : ALT.shot, worldZ(shot.y));
      if (shot.well) {
        // 引力井：吸积环的半径就是真实作用范围，它把射程画了出来。
        const ud = mesh.userData;
        ud.ring.scale.setScalar(shot.well);
        ud.inner.scale.setScalar(shot.well);
        ud.ring.rotation.z = shot.age * 3;
        ud.inner.rotation.z = -shot.age * 5;
      } else if (shot.kind === 'anti') {
        mesh.scale.setScalar(1 + Math.sin(shot.age * 18) * 0.2);
        mesh.rotation.y += 0.2;
      } else if (shot.kind === 'flame' || shot.kind === 'shard') {
        mesh.rotation.x += 0.3;
        mesh.rotation.y += 0.2;
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

  const drawOverlay = (state, dt, pointers) => {
    ctx.clearRect(0, 0, size.w, size.h);

    // 裸机警示：画面四边泛起一层会呼吸的红。再挨一下就掉命，值得一个躲不开的提示。
    if (!state.ship.wing && state.ship.dive <= 0 && state.status === 'playing') {
      const pulse = 0.32 + Math.sin(state.elapsed * 7) * 0.12;
      const top = ctx.createLinearGradient(0, 0, 0, size.h);
      top.addColorStop(0, `rgba(255, 47, 94, ${pulse})`);
      top.addColorStop(0.17, 'rgba(255, 47, 94, 0)');
      top.addColorStop(0.83, 'rgba(255, 47, 94, 0)');
      top.addColorStop(1, `rgba(255, 47, 94, ${pulse})`);
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, size.w, size.h);
      const side = ctx.createLinearGradient(0, 0, size.w, 0);
      side.addColorStop(0, `rgba(255, 47, 94, ${pulse * 0.8})`);
      side.addColorStop(0.14, 'rgba(255, 47, 94, 0)');
      side.addColorStop(0.86, 'rgba(255, 47, 94, 0)');
      side.addColorStop(1, `rgba(255, 47, 94, ${pulse * 0.8})`);
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, size.w, size.h);
    }

    notes = notes.filter((item) => item.age < item.life);
    ctx.textAlign = 'center';
    const scale = Math.min(size.w / 420, 1.4);
    drawTouch(state, pointers);
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
      stage.setChapter(state.chapter);
      // Boss 战时背景压慢：这时候该看的是弹幕和弱点，不是风景往后跑。
      stage.drift(delta, state.boss ? 0.42 : 1);
      syncShip(state);
      syncEnemies(state);
      syncBoss(state);
      syncDrops(state);
      syncGate(state);
      syncShots(state);
      syncFoes(state);
      updateSparks(delta);
      updateArcs(delta);
      drawOverlay(state, delta, pointers);
      stage.draw(delta);
    },

    dispose() {
      observer.disconnect();
      overlay.remove();
      trailPool.dispose();
      orbPool.dispose();
      dropPool.dispose();
      for (const pool of enemyPools.values()) pool.dispose();
      for (const pool of shotPools.values()) pool.dispose();
      for (const pool of foePool.values()) pool.dispose();
      stage.dispose();
    },
  };
}
