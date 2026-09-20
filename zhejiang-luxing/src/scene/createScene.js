// 渲染外壳：天空、光照、雾、轨道控制、点选拾取、镜头飞行和动画循环。
// 地图几何交给 atlasGroup，这里只管「怎么看」和「点到了谁」。

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
    gl_FragColor = vec4(mix(bottom, top, pow(t, 0.85)), 1.0);
  }
`;

// 三个时段。晨雾把远处的山化开，黄昏给水面一层橙光，正午最适合看地形本身。
export const LIGHTS = [
  {
    id: 'morning', name: '晨雾',
    skyTop: 0x9fc3dd, skyBottom: 0xe6dcc8, fog: 0xd7dcd2, fogDensity: 1.5,
    sun: 0xffe3bb, sunIntensity: 1.5, azim: 0.9, elev: 0.28, ambient: 0.85, exposure: 1.02,
  },
  {
    id: 'noon', name: '正午',
    skyTop: 0x4c8fd6, skyBottom: 0xbcd8ee, fog: 0xc9dced, fogDensity: 0.75,
    sun: 0xfff6e2, sunIntensity: 2.1, azim: 2.1, elev: 0.55, ambient: 0.9, exposure: 1.0,
  },
  {
    id: 'dusk', name: '黄昏',
    skyTop: 0x2e3f66, skyBottom: 0xf0a86a, fog: 0x8b7e8c, fogDensity: 1.2,
    sun: 0xffb066, sunIntensity: 1.7, azim: 3.6, elev: 0.16, ambient: 0.6, exposure: 1.12,
  },
];

export const lightById = (id) => LIGHTS.find((l) => l.id === id) ?? LIGHTS[1];

/**
 * 视角预设。目标点故意比几何中心偏西一点：左侧有筛选面板，
 * 把注视点往西挪，全省视角下整张地图就落在面板右边的可见区里。
 */
const REGION_VIEWS = {
  overview: { lng: 120.42, lat: 29.1, dist: 0.9, pitch: 0.62 },
  north: { lng: 120.25, lat: 30.5, dist: 0.42, pitch: 0.58 },
  east: { lng: 121.15, lat: 29.9, dist: 0.42, pitch: 0.58 },
  west: { lng: 119.05, lat: 29.2, dist: 0.46, pitch: 0.58 },
  south: { lng: 120.45, lat: 28.3, dist: 0.5, pitch: 0.56 },
  isles: { lng: 122.15, lat: 30.1, dist: 0.4, pitch: 0.6 },
  flat: { lng: 120.42, lat: 29.1, dist: 1.0, pitch: 1.4 },
};

export function createScene(canvas, { spots, onPick, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 2, MAP_SIZE * 8);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 60;
  controls.maxDistance = MAP_SIZE * 1.8;
  controls.screenSpacePanning = false;

  const skyUniforms = {
    top: { value: new THREE.Color(0x4c8fd6) },
    bottom: { value: new THREE.Color(0xbcd8ee) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(MAP_SIZE * 3.2, 32, 20),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x4f5a4a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 1.5;
  const shadowSpan = MAP_SIZE * 0.6;
  Object.assign(sun.shadow.camera, { left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan, near: 10, far: MAP_SIZE * 4 });
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
  let hoverId = null;
  let selectedId = null;
  let onStats = null;
  let frames = 0;
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
    sun.position.set(Math.cos(p.azim) * r * Math.cos(elev), Math.max(60, Math.sin(elev) * r), Math.sin(p.azim) * r * Math.cos(elev));
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
    const v = REGION_VIEWS[id] ?? REGION_VIEWS.overview;
    const target = new THREE.Vector3(lngToX(v.lng), 0, latToZ(v.lat));
    const dist = MAP_SIZE * v.dist;
    const pos = new THREE.Vector3(
      target.x + Math.sin(0) * dist,
      target.y + dist * Math.sin(v.pitch),
      target.z + dist * Math.cos(v.pitch),
    );
    flyTo(pos, target, immediate);
  };

  /** 飞到某个景点：从东南方压低一点看过去，比正上方更容易看出它靠山还是靠海 */
  const focusSpot = (id, dist = 420) => {
    const p = atlas.positionOf(id);
    if (!p) return;
    const target = p.clone().add(new THREE.Vector3(0, 12, 0));
    flyTo(target.clone().add(new THREE.Vector3(dist * 0.45, dist * 0.62, dist * 0.7)), target);
  };

  /** 把一组景点整体框进画面：选行程时用，比直接扑到第一站更能看清这条线怎么走 */
  const frameSpots = (ids) => {
    const pts = ids.map((id) => atlas.positionOf(id)).filter(Boolean);
    if (!pts.length) return;
    const box = new THREE.Box3().setFromPoints(pts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(300, Math.max(size.x, size.z) * 1.45);
    flyTo(center.clone().add(new THREE.Vector3(0, dist * 0.78, dist * 0.72)), center, false, 1.3);
  };

  const castAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(atlas.pickTargets(), false);
    return hits.length ? hits[0].object.userData.spotId : null;
  };

  // 拖动地图和点击标记要分开：按下到抬起之间移动超过 8px 就当成拖动，不触发选中。
  let down = null;
  const onPointerDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8) return;
    const id = castAt(e.clientX, e.clientY);
    if (id) onPick?.(id);
    else onPick?.(null);
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
    if (onStats && fps.length === 40 && frames % 30 === 0) {
      const avg = fps.reduce((s, v) => s + v, 0) / fps.length;
      onStats({ fps: Math.round(1 / avg), calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
    }
  };

  applyLight('noon');
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

