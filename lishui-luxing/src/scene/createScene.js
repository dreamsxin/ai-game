// 渲染外壳：绢色天光、暖调光照、轨道控制、点选拾取、镜头飞行与动画循环。
// 这张图最要紧的一条：天不是蓝的。《千里江山图》的"天"是绢本身，
// 所以天空用绢黄渐变、雾也用绢色 —— 远山淡入绢底，正是画里留白的做法。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildAtlas } from './atlasGroup.js';
import { MAP_SIZE, lngToX, latToZ } from '../atlas/projection.js';

const SKY_VERT = `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform vec3 top;
  uniform vec3 bottom;
  varying vec3 vWorld;
  void main() {
    float t = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(bottom, top, pow(t, 0.7)), 1.0);
  }
`;

/** 三种"卷面"：晴卷最清、烟雨最淡、暮金最暖 */
export const LIGHTS = [
  {
    id: 'clear', name: '晴卷',
    skyTop: 0xc9b98f, skyBottom: 0xf1e6c8, fog: 0xe8dcbb, fogDensity: 0.9,
    sun: 0xfff2d4, sunIntensity: 2.4, azim: 2.2, elev: 0.32, ambient: 0.72, exposure: 1.02,
  },
  {
    id: 'misty', name: '烟雨',
    skyTop: 0xd8d0b4, skyBottom: 0xf4eeda, fog: 0xeee7d2, fogDensity: 2.1,
    sun: 0xf6efdd, sunIntensity: 1.5, azim: 1.2, elev: 0.55, ambient: 1.05, exposure: 1.06,
  },
  {
    id: 'dusk', name: '暮金',
    skyTop: 0xa98f63, skyBottom: 0xf0c887, fog: 0xdcbb9a, fogDensity: 1.3,
    sun: 0xffc878, sunIntensity: 2.2, azim: 3.7, elev: 0.16, ambient: 0.62, exposure: 1.1,
  },
];

export const lightById = (id) => LIGHTS.find((l) => l.id === id) ?? LIGHTS[0];

/**
 * 视角预设。注视点故意比几何中心偏西一点：左边有面板，
 * 这样全卷视角下整张图落在面板右侧的可见区里。
 */
const VIEWS = {
  overview: { lng: 119.50, lat: 28.15, dist: 0.95, pitch: 0.6 },
  north: { lng: 120.00, lat: 28.70, dist: 0.42, pitch: 0.56 },
  east: { lng: 120.10, lat: 28.25, dist: 0.45, pitch: 0.56 },
  center: { lng: 119.45, lat: 28.42, dist: 0.42, pitch: 0.56 },
  south: { lng: 119.35, lat: 27.80, dist: 0.5, pitch: 0.54 },
  flat: { lng: 119.50, lat: 28.15, dist: 1.05, pitch: 1.38 },
};

export function createScene(canvas, { spots, onPick, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 2, MAP_SIZE * 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 70;
  controls.maxDistance = MAP_SIZE * 1.9;

  const skyUniforms = {
    top: { value: new THREE.Color(0xc9b98f) },
    bottom: { value: new THREE.Color(0xf1e6c8) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(MAP_SIZE * 3.2, 32, 20),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xfff4d8, 0x8a7a55, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d4, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 1.5;
  const span = MAP_SIZE * 0.6;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: MAP_SIZE * 4 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const atlas = buildAtlas(spots);
  scene.add(atlas.group);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tween = { active: false, t: 0, dur: 1, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3() };
  let raf = 0;
  let last = 0;
  let clock = 0;
  let frames = 0;
  let hoverId = null;
  let selectedId = null;
  let onStats = null;
  const fps = [];

  const applyLight = (id) => {
    const p = lightById(id);
    skyUniforms.top.value.set(p.skyTop);
    skyUniforms.bottom.value.set(p.skyBottom);
    scene.fog = new THREE.FogExp2(new THREE.Color(p.fog), (p.fogDensity * 0.55) / MAP_SIZE);
    hemi.color.set(p.skyBottom);
    hemi.intensity = p.ambient;
    sun.color.set(p.sun);
    sun.intensity = p.sunIntensity;
    const r = MAP_SIZE * 0.9;
    const elev = p.elev * Math.PI * 0.5;
    sun.position.set(Math.cos(p.azim) * r * Math.cos(elev), Math.max(80, Math.sin(elev) * r), Math.sin(p.azim) * r * Math.cos(elev));
    renderer.toneMappingExposure = p.exposure;
  };

  const flyTo = (pos, target, immediate = false, dur = 1.1) => {
    if (immediate) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      return;
    }
    tween.fromPos.copy(camera.position);
    tween.fromTgt.copy(controls.target);
    tween.toPos.copy(pos);
    tween.toTgt.copy(target);
    tween.t = 0;
    tween.dur = dur;
    tween.active = true;
  };

  const setView = (id, immediate = false) => {
    const v = VIEWS[id] ?? VIEWS.overview;
    const target = new THREE.Vector3(lngToX(v.lng), 0, latToZ(v.lat));
    const dist = MAP_SIZE * v.dist;
    flyTo(target.clone().add(new THREE.Vector3(0, dist * Math.sin(v.pitch), dist * Math.cos(v.pitch))), target, immediate);
  };

  /** 飞到某处：从东南压低看过去，能看出它是靠山还是临水 */
  const focusSpot = (id, dist = 320) => {
    const p = atlas.positionOf(id);
    if (!p) return;
    const target = p.clone().add(new THREE.Vector3(0, 10, 0));
    flyTo(target.clone().add(new THREE.Vector3(dist * 0.45, dist * 0.6, dist * 0.7)), target);
  };

  /** 把一组景点整体框进画面：选行程时用 */
  const frameSpots = (ids) => {
    const pts = ids.map((id) => atlas.positionOf(id)).filter(Boolean);
    if (!pts.length) return;
    const box = new THREE.Box3().setFromPoints(pts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(320, Math.max(size.x, size.z) * 1.5);
    flyTo(center.clone().add(new THREE.Vector3(0, dist * 0.76, dist * 0.7)), center, false, 1.3);
  };

  const castAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(atlas.pickTargets(), false);
    return hits.length ? hits[0].object.userData.spotId : null;
  };

  // 拖动与点击要分开：按下到抬起移动超过 8px 当拖动，不触发选中
  let down = null;
  const onPointerDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8) return;
    onPick?.(castAt(e.clientX, e.clientY));
  };
  const onPointerMove = (e) => {
    if (e.pointerType === 'touch' || down) return;
    const id = castAt(e.clientX, e.clientY);
    if (id !== hoverId) {
      hoverId = id;
      atlas.setSelection(selectedId, hoverId);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      onHover?.(id);
    }
  };
  const onPointerLeave = () => {
    down = null;
    if (hoverId) {
      hoverId = null;
      atlas.setSelection(selectedId, null);
      onHover?.(null);
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    clock += dt;

    if (tween.active) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2;
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
      if (tween.t >= 1) tween.active = false;
    }

    atlas.animate(clock);
    controls.update();
    sun.target.position.copy(controls.target);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);

    fps.push(dt);
    if (fps.length > 40) fps.shift();
    frames += 1;
    // 每 30 帧报一次，不等采样环填满 —— 否则刚进页面那两秒 HUD 会一直显示「--」
    if (onStats && frames % 30 === 0) {
      const avg = fps.reduce((s, v) => s + v, 0) / fps.length;
      onStats({ fps: Math.round(1 / avg), calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
    }
  };

  applyLight('clear');
  setView('overview', true);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    setVisibleSpots: atlas.setVisibleSpots,
    setLabels: atlas.setLabels,
    setRoute: atlas.setRoute,
    setSelected: (id) => {
      selectedId = id ?? null;
      atlas.setSelection(selectedId, hoverId);
    },
    focusSpot,
    frameSpots,
    setView,
    applyLight,
    resize,
    onStats: (cb) => { onStats = cb; },
    dispose: () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      atlas.dispose();
      scene.remove(atlas.group);
      sky.geometry.dispose();
      sky.material.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
