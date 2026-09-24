// 舞台：相机、灯、地面、栅格、峡谷两侧的岩体和星野。
//
// 这一层只管「场景长什么样」，不认识模拟状态里的任何一个字段。
// 三件事是它的职责：
// 1. 取景交给 view.js 算，这里只把结果喂给 three 的相机——改俯角只要动 view.js 一处。
// 2. 速度感全靠地面：栅格、侧栏刻度、两侧岩体三层以不同速度往近处滑。
//    纵版射击里飞机其实是钉在屏幕上的，动的是世界。
// 3. 章节配色一次性换掉：雾、灯、地面、栅格、天幕都跟着 palette.js 走。

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ALT, FIELD_H, FIELD_W, FOV, fitView, worldZ } from './view.js';
import { chapterArt } from './palette.js';
import { BILLBOARD_X, glowTexture } from './models.js';

const GRID_CELL = 10;
const RIDGE_COUNT = 34;
const STAR_COUNT = 260;
// 天幕挂在相机前这么远。比 far 近、比任何实体远就行。
const SKY_DIST = 600;
const FAR_Z = worldZ(-70);
const NEAR_Z = worldZ(FIELD_H + 40);

/** 固定种子的伪随机：岩体的高低每次开局都一样，省得同一关看起来忽胖忽瘦。 */
const seeded = (seed) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value / 0x7fffffff;
  };
};

const gridTexture = (color) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(64, 0);
  ctx.lineTo(64, 128);
  ctx.moveTo(0, 64);
  ctx.lineTo(128, 64);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

/**
 * 天空的渐变贴图。挂在相机上当一整块幕布用（见 createStage 里的 skyPlane）。
 *
 * 两个坑：
 * 1. **不能用 `scene.background`**：three 会按贴图自身的宽高比做 cover 填充，
 *    一张 8×256 的竖条铺到手机屏上只剩中间一条，整条渐变被采成一片死蓝（第一、二版都栽在这）。
 *    挂在相机上的幕布才是「一个像素对一个像素」。
 * 2. 地平线大约在屏幕上方四分之一处，地面把下面全挡住了，
 *    所以渐变里最亮的一档要压在贴图顶部四分之一附近，摊到中间就看不见了。
 */
const skyTexture = (art) => {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, art.zenith);
  gradient.addColorStop(0.08, art.fog);
  gradient.addColorStop(0.2, art.sky);
  gradient.addColorStop(0.3, art.sky);
  gradient.addColorStop(0.55, art.fog);
  gradient.addColorStop(1, art.zenith);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export function createStage(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.domElement.className = 'stage-canvas';
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.appendChild(renderer.domElement);

  // 上下文丢了的话画布会纯黑而且一声不响，所以这里留一句明话。
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('[stage] WebGL 上下文丢失，画面会变黑；刷新页面即可恢复。');
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1400);
  const world = new THREE.Group();
  scene.add(world);

  const art0 = chapterArt(0);
  scene.fog = new THREE.Fog(new THREE.Color(art0.fog), 120, 460);

  const hemi = new THREE.HemisphereLight(new THREE.Color(art0.sky), new THREE.Color(art0.ground), 1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-70, 150, 90);
  scene.add(key);
  // 远处那盏彩光是章节的身份：它把地平线一侧染上本章的颜色。
  const rim = new THREE.PointLight(new THREE.Color(art0.accent), 2.4, 460, 1.4);
  rim.position.set(0, 46, FAR_Z + 40);
  scene.add(rim);

  // 天幕挂在相机上：一块永远铺满视口的幕布，渐变逐像素对上屏幕高度。
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture(art0),
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
  skyPlane.renderOrder = -1;
  skyPlane.position.z = -SKY_DIST;
  camera.add(skyPlane);
  scene.add(camera);

  // 地平线上那一道光。压到 0.32：太亮的话整条天空会被这层加色染成一块青绿的墙
  // （前一版就是，看着像天上糊了块荧光板）。
  const horizonMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: new THREE.Color(art0.accent),
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 4.6, 46), horizonMat);
  horizon.rotation.x = BILLBOARD_X;
  horizon.position.set(0, 8, FAR_Z - 14);
  scene.add(horizon);

  const groundMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(art0.ground),
    roughness: 0.92,
    metalness: 0.1,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 5, (NEAR_Z - FAR_Z) * 1.4), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (FAR_Z + NEAR_Z) / 2);
  world.add(ground);

  // 栅格贴在地面上方一丝，用加色混合，所以它看起来是发光的刻线而不是涂的漆。
  const gridMap = gridTexture('#ffffff');
  gridMap.repeat.set((FIELD_W * 5) / GRID_CELL, ((NEAR_Z - FAR_Z) * 1.4) / GRID_CELL);
  const gridMat = new THREE.MeshBasicMaterial({
    map: gridMap,
    color: new THREE.Color(art0.grid),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const grid = new THREE.Mesh(ground.geometry.clone(), gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.set(0, 0.06, ground.position.z);
  world.add(grid);

  // 场地边界画两条发光的栏：玩家走不出去这两条线，那就该看得见。
  const railMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(art0.accent),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, NEAR_Z - FAR_Z), railMat);
    rail.position.set((side * FIELD_W) / 2, 0.6, (FAR_Z + NEAR_Z) / 2);
    world.add(rail);
  }

  // 侧栏刻度：沿着两条栏往近处滑的短横杠，它比栅格更能读出速度。
  // 压暗到 0.5：第一版和我方子弹一样白，整条跑道看起来像画了车道线。
  const tickMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(art0.accent),
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 0.6, 1.2), tickMat, 28);
  world.add(ticks);
  const tickState = [];
  for (let i = 0; i < 28; i += 1) {
    tickState.push({ side: i % 2 === 0 ? -1 : 1, z: FAR_Z + (i / 28) * (NEAR_Z - FAR_Z) });
  }

  // 两侧的岩体：峡谷的壁。三层里跑得最快的一层，所以速度感主要来自它。
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(art0.ridge),
    roughness: 0.85,
    metalness: 0.2,
    flatShading: true,
  });
  const ridges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ridgeMat, RIDGE_COUNT);
  world.add(ridges);
  const rand = seeded(20260923);
  const ridgeState = [];
  for (let i = 0; i < RIDGE_COUNT; i += 1) {
    ridgeState.push({
      side: i % 2 === 0 ? -1 : 1,
      z: FAR_Z + (i / RIDGE_COUNT) * (NEAR_Z - FAR_Z),
      w: 16 + rand() * 26,
      h: 8 + rand() * 26,
      d: 18 + rand() * 30,
      // 往外推远一点：太贴着场地的岩体会在近处挡住半条跑道（第一版左下角就被挡了）。
      out: 16 + rand() * 34,
    });
  }

  // 星野：只在高空，所以它不会和地面的栅格混在一起。
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    starPos[i * 3] = (rand() - 0.5) * FIELD_W * 4;
    starPos[i * 3 + 1] = 60 + rand() * 180;
    starPos[i * 3 + 2] = FAR_Z + rand() * (NEAR_Z - FAR_Z);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: new THREE.Color(art0.star),
    size: 2.6,
    map: glowTexture(),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const spot = new THREE.Vector3();
  const place = (mesh, index, x, y, z, sx, sy, sz) => {
    scale.set(sx, sy, sz);
    spot.set(x, y, z);
    matrix.compose(spot, quat, scale);
    mesh.setMatrixAt(index, matrix);
  };

  let base = fitView(1);
  let chapter = -1;
  let shake = 0;
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // 泛光。霓虹这套画法全靠它：加色混合的亮部溢出来，栅格和弹道才「发光」而不是「涂白」。
  // 半径压到 0.34、阈值抬到 0.7 是有代价换来的：Boss 那种又大又亮的实体在半径 0.62 下
  // 会把整条天空糊成一块青绿（截图上像天上挂了块荧光板）。
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.34, 0.7);
  composer.addPass(bloom);

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    const aspect = w / h;
    camera.aspect = aspect;
    // 幕布按视锥在 SKY_DIST 处的截面撑满，换屏幕比例也不会露边。
    const skyH = 2 * SKY_DIST * Math.tan(((FOV / 2) * Math.PI) / 180);
    skyPlane.scale.set(skyH * aspect, skyH, 1);
    base = fitView(aspect);
    camera.position.set(base.pos.x, base.pos.y, base.pos.z);
    camera.lookAt(base.target.x, base.target.y, base.target.z);
    camera.updateProjectionMatrix();
    // 雾跟着相机距离走，否则换个屏幕比例远处就会整片糊掉或者一点雾都没有。
    scene.fog.near = base.distance * 0.55;
    scene.fog.far = base.distance * 1.75;
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  return {
    scene,
    camera,
    world,
    renderer,

    /** 换章：雾、灯、地面、栅格、天幕、岩体、星野一次性全换色。 */
    setChapter(index) {
      if (index === chapter) return;
      chapter = index;
      const art = chapterArt(index);
      scene.fog.color.set(art.fog);
      hemi.color.set(art.sky);
      hemi.groundColor.set(art.ground);
      rim.color.set(art.accent);
      groundMat.color.set(art.ground);
      gridMat.color.set(art.grid);
      railMat.color.set(art.accent);
      tickMat.color.set(art.accent);
      ridgeMat.color.set(art.ridge);
      starMat.color.set(art.star);
      horizonMat.color.set(art.accent);
      skyMat.map?.dispose();
      skyMat.map = skyTexture(art);
      skyMat.needsUpdate = true;
    },

    /** 只有关口事件才震：弃翼、掉翼、掉命、Boss 阵亡。自动开火不震。 */
    punch(amount) {
      if (calm) return;
      shake = Math.max(shake, amount);
    },

    /** 推进背景。speed 是章节推进感，Boss 战时会压慢。 */
    drift(dt, speed = 1) {
      gridMap.offset.y -= dt * 0.26 * speed;
      for (const [i, tick] of tickState.entries()) {
        tick.z += 130 * speed * dt;
        if (tick.z > NEAR_Z) tick.z -= NEAR_Z - FAR_Z;
        place(ticks, i, (tick.side * FIELD_W) / 2, 1.2, tick.z, 1, 1, 1);
      }
      ticks.instanceMatrix.needsUpdate = true;

      for (const [i, item] of ridgeState.entries()) {
        item.z += 78 * speed * dt;
        if (item.z > NEAR_Z) item.z -= NEAR_Z - FAR_Z;
        const x = item.side * (FIELD_W / 2 + item.out + item.w / 2);
        place(ridges, i, x, item.h / 2 - 2, item.z, item.w, item.h, item.d);
      }
      ridges.instanceMatrix.needsUpdate = true;

      const pos = starGeo.getAttribute('position');
      for (let i = 0; i < STAR_COUNT; i += 1) {
        let z = pos.getZ(i) + 40 * speed * dt;
        if (z > NEAR_Z) z -= NEAR_Z - FAR_Z;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    },

    draw(dt) {
      if (shake > 0.04) {
        camera.position.set(
          base.pos.x + (Math.random() - 0.5) * shake,
          base.pos.y + (Math.random() - 0.5) * shake,
          base.pos.z + (Math.random() - 0.5) * shake * 0.6,
        );
        shake *= Math.pow(0.02, dt);
      } else if (camera.position.x !== base.pos.x) {
        camera.position.set(base.pos.x, base.pos.y, base.pos.z);
      }
      composer.render(dt);
    },

    dispose() {
      observer.disconnect();
      composer.dispose();
      // **必须显式丢掉上下文**：只调 renderer.dispose() 的话旧上下文要等 GC 才释放，
      // 而浏览器同时只给十来个 WebGL 上下文。热更新／重挂几次之后新的就申请不到了，
      // 症状是整块画布纯黑、控制台连错都不报。
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
