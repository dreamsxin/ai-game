// 渲染外壳：绢色天光、暖调光照、轨道控制、点选拾取、镜头飞行与动画循环。
// 这张图最要紧的一条：天不是蓝的。《千里江山图》的"天"是绢本身，
// 所以天空用绢黄渐变、雾也用绢色 —— 远山淡入绢底，正是画里留白的做法。
// 诗词江山：全中国诗词地图版——地域更广，MAP_SIZE 更大。

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
 * 视角预设。`bias` 是注视点要往西挪多少度：
 * 宽屏时左侧那块卷轴压掉近四分之一的画面宽度，注视点放在图幅中心（107.25°E）时，
 * 河西、陇右、巴蜀全躲在面板后面，"全卷"只剩下半张 —— 往西挪等于把整幅画朝东推出来。
 * 窄屏上卷轴变成底部抽屉、不再挡住西边，这个偏移就要撤掉（`setLayout` 管）。
 */
const VIEWS = {
  // narrow：竖屏时另一套取景 —— 不再为左侧卷轴西移，机头压低一点，
  // 注视点略往东（西边三千公里多是无诗的高原，手机上先给中原与江南）
  overview:  {
    lng: 107.25, bias: -2.65, lat: 30.0, dist: 0.95, pitch: 0.6,
    narrow: { lng: 110.5, lat: 32.0, dist: 0.9, pitch: 0.78 },
  },
  guanzhong: { lng: 108.95, lat: 34.26, dist: 0.32, pitch: 0.56 },   // 关中（长安一带）
  jiangnan:  { lng: 120.20, lat: 30.25, dist: 0.32, pitch: 0.56 },   // 江南
  lingnan:   { lng: 113.26, lat: 23.13, dist: 0.38, pitch: 0.54 },   // 岭南
  saibei:    { lng: 110.00, lat: 40.80, dist: 0.38, pitch: 0.56 },   // 塞北
  bashu:     { lng: 104.06, lat: 30.57, dist: 0.35, pitch: 0.56 },   // 巴蜀
  flat:      { lng: 107.25, bias: -2.65, lat: 30.0, dist: 1.05, pitch: 1.38 },
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
  // 最近距离不放到七十：地形一格九公里，再凑近就只是一坨光滑的绿包，看不出山水
  controls.minDistance = 220;

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
  // 取景随画面形状走：panelBias = 1 是宽屏（左侧压着卷轴），fitScale 是"画面越窄退得越远"
  let panelBias = 1;
  let fitScale = 1;
  let viewId = 'overview';
  // 镜头此刻是不是"预设视角给的"：是的话画面一变形就重新取景；
  // 一旦飞去某首诗、框过某条行迹、或者人自己拖过缩放过，就不能再动它了
  let fromPreset = true;
  let lightId = 'clear';
  // 人一上手拖／缩放，镜头就归人管，画面变形也不再自动重新取景
  controls.addEventListener('start', () => { fromPreset = false; });


  const applyLight = (id) => {
    const p = lightById(id);
    lightId = p.id;
    skyUniforms.top.value.set(p.skyTop);
    skyUniforms.bottom.value.set(p.skyBottom);
    // 雾要跟着取景松一松：竖屏上镜头退到两倍图幅之外，按宽屏那个浓度算，
    // 整幅画会淡成一张白纸（"远则淡"是画法，不是把画擦掉）。
    scene.fog = new THREE.FogExp2(new THREE.Color(p.fog), (p.fogDensity * 0.55) / (MAP_SIZE * Math.max(1, fitScale * 0.9)));
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
    const base = VIEWS[id] ?? VIEWS.overview;
    viewId = VIEWS[id] ? id : 'overview';
    const v = panelBias < 0.05 && base.narrow ? { ...base, ...base.narrow } : base;
    const target = new THREE.Vector3(lngToX(v.lng + (v.bias ?? 0) * panelBias), 0, latToZ(v.lat));
    const dist = MAP_SIZE * v.dist * fitScale;
    fromPreset = true;
    flyTo(target.clone().add(new THREE.Vector3(0, dist * Math.sin(v.pitch), dist * Math.cos(v.pitch))), target, immediate);
  };

  /**
   * 画面形状变了就得重算取景，这是两件事：
   * 1. **镜头要按画面有多窄往后退**。fov 是竖向的，横向视野由宽高比决定；
   *    这幅图是横着长的（东西 62 度、南北 36 度），竖屏手机上按桌面那个距离飞过去，
   *    "全卷"只剩中间一条 —— 所以窄到 3:2 以下，每窄一分就退一分。
   *    反过来，宽屏（16:9、21:9）横向早就够了，卡在 3:2 那个距离只是让上下多留两条空绢，
   *    所以比 3:2 宽就往前凑一点（凑得比退得缓，免得一到超宽屏就贴到地面上）。
   * 2. **注视点西移要按卷轴实际压掉多少画面来算**。那两度多是照 1440 宽、320 面板
   *    （约 22%）调的；四千像素的屏上面板只占一成，照旧西移就把东海推出画外，
   *    窄屏上面板变成底部抽屉更是完全不该移 —— 所以偏移量 = 面板占宽 ÷ 22%。
   */
  const setLayout = ({ narrow = false, panelShare = 0.22 } = {}) => {
    const next = narrow ? 0 : Math.min(1.4, Math.max(0, panelShare) / 0.22);
    if (Math.abs(next - panelBias) < 0.02) return;
    panelBias = next;
    setView(viewId);
  };



  /**
   * 飞到某处：从东南压低看过去，能看出它是靠山还是临水。
   * 距离不能太近 —— 地形一格约九公里，凑到三百单位上去只剩一坨光滑的绿包，
   * 三峡也看不出是峡；退到八百，一屏里有七八十格，山脊和江谷才成形。
   */
  const focusSpot = (id, dist = 800) => {

    const p = atlas.positionOf(id);
    if (!p) return;
    const target = p.clone().add(new THREE.Vector3(0, 10, 0));
    const d = dist * fitScale;
    fromPreset = false;
    flyTo(target.clone().add(new THREE.Vector3(d * 0.45, d * 0.6, d * 0.7)), target);
  };

  /** 把一组景点整体框进画面：选行程时用 */
  const frameSpots = (ids) => {
    const pts = ids.map((id) => atlas.positionOf(id)).filter(Boolean);
    if (!pts.length) return;
    const box = new THREE.Box3().setFromPoints(pts);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(320, Math.max(size.x, size.z) * 1.5) * fitScale;
    fromPreset = false;
    flyTo(center.clone().add(new THREE.Vector3(0, dist * 0.76, dist * 0.7)), center, false, 1.3);
  };

  /**
   * 打一次拾取。返回的是**这一处**：地名，加上这里的所有诗（可能好几首）。
   * 长安一地压着几十首，印章只有一枚，选哪一首得交给上层去问人。
   */
  const castAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    // 先按屏幕矩形打印章与题签：它们是屏幕固定字号的 sprite，
    // 比杆底那根拾取圆柱大得多，只打圆柱的话点在印文上、点在诗名上都没反应
    const onLabel = atlas.pickScreen(clientX - rect.left, clientY - rect.top);
    if (onLabel) return { place: onLabel.place, ids: onLabel.spots.map((s) => s.id) };

    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(atlas.pickTargets(), false);
    if (!hits.length || hits[0].instanceId === undefined) return { place: '', ids: [] };
    const { place, spots: here } = atlas.spotsAtInstance(hits[0].instanceId);
    return { place, ids: here.map((s) => s.id) };
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
    const picked = castAt(e.clientX, e.clientY);
    const id = picked.ids[0] ?? null;
    if (id !== hoverId) {
      hoverId = id;
      atlas.setSelection(selectedId, hoverId);
      canvas.style.cursor = id ? 'pointer' : 'grab';
      onHover?.(picked);
    }
  };
  const onPointerLeave = () => {
    down = null;
    if (hoverId) {
      hoverId = null;
      atlas.setSelection(selectedId, null);
      onHover?.({ place: '', ids: [] });
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

    // 取景按画面形状分三段：
    //   窄于 3:2 —— 横向装不下东西六十二度，每窄一分退一分（上限 2.2 倍）；
    //   3:2 到 16:9 —— 桌面那一档，原样不动（距离就是照这一段调出来的）；
    //   宽于 16:9 —— 往前凑，凑到 0.66 倍为止。宽屏上真正见底的是竖向
    //   （机头压着看，南北四千公里被压成半屏），所以可以比"按宽度算"再近一点，
    //   代价是塞北与岭南的边角会出画，而那两头本来就只有零星几首。
    const a = camera.aspect;
    let next = 1;
    if (a < 1.5) next = Math.min(2.2, 1.5 / a);
    else if (a > 1.75) next = Math.max(0.66, 1.75 / a);
    if (Math.abs(next - fitScale) > 0.01) {
      fitScale = next;
      applyLight(lightId);
    }
    controls.maxDistance = MAP_SIZE * 1.9 * fitScale;
    // 还停在某个预设视角上（没有飞去某首诗、没有手动缩放）就顺势重新取景 ——
    // 手机横竖屏一转、或者窗口拖窄，画面不该留着按旧形状算出来的距离
    if (fromPreset) {
      // 正飞着也要改：按旧形状算出来的落点不该等飞完再纠
      setView(viewId, !tween.active);
    }
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
    // 题签避让要在相机定好之后、渲染之前做，否则永远差一帧。
    // 镜头距离一并交过去：远看只留印章，近看才铺诗名
    atlas.layout(camera, canvas.clientWidth || 1, canvas.clientHeight || 1, controls.getDistance());

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
    setLayout,
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
