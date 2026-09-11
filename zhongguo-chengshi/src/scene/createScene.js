// 渲染器外壳：天空、灯光、雾、相机视角预设、动画循环。
// 结构参数改动会整块重建城市组；外观参数只调材质和灯光，所以拖滑块是即时响应的。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildCityGroup } from './cityGroup.js';
import { lightPresetOf } from '../city/styles.js';

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
    gl_FragColor = vec4(mix(bottom, top, pow(t, 0.8)), 1.0);
  }
`;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 2, 20000);
  camera.position.set(900, 700, 1100);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 60;
  controls.target.set(0, 40, 0);

  const skyUniforms = {
    top: { value: new THREE.Color(0x4a5f80) },
    bottom: { value: new THREE.Color(0xb9c4d2) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    }),
  );
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 1.2;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  scene.add(fill);

  let city = null;
  let built = null;
  const tween = { active: false, t: 0, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3() };
  let viewId = 'orbit';
  let cinematic = false;
  let raf = 0;
  let last = 0;
  let clockT = 0;
  const fpsRing = [];
  let onStats = null;

  const disposeBuilt = () => {
    if (!built) return;
    scene.remove(built.group);
    built.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    built = null;
  };

  /** 相机视角预设。每个预设给一组机位和目标点，然后平滑过渡过去 */
  const viewTargets = (id) => {
    const size = city?.size ?? 1600;
    const peak = Math.max(120, city?.stats.highestPoint ?? 200);
    switch (id) {
      case 'overhead':
        return [new THREE.Vector3(1, size * 1.02, 1), new THREE.Vector3(0, 0, 0)];
      case 'skyline':
        return [new THREE.Vector3(size * 0.6, peak * 0.55 + 40, size * 0.22), new THREE.Vector3(0, peak * 0.32, 0)];

      case 'street': {
        const line = city?.roadLines?.[Math.floor((city.roadLines.length || 1) * 0.4)];
        if (!line) return [new THREE.Vector3(200, 40, 200), new THREE.Vector3(0, 20, 0)];
        const a = line.pts[Math.floor(line.pts.length / 2)];
        const b = line.pts[Math.min(line.pts.length - 1, Math.floor(line.pts.length / 2) + 2)];
        const h = city.terrain.heightAt(a[0], a[1]);
        return [
          new THREE.Vector3(a[0], h + 16, a[1]),
          new THREE.Vector3(b[0] + (b[0] - a[0]) * 14, h + 44, b[1] + (b[1] - a[1]) * 14),
        ];
      }
      case 'cinematic':
        return [new THREE.Vector3(size * 0.44, size * 0.3, size * 0.5), new THREE.Vector3(0, peak * 0.2, 0)];
      default:
        return [new THREE.Vector3(size * 0.52, size * 0.44, size * 0.62), new THREE.Vector3(0, peak * 0.16, 0)];
    }
  };

  const setView = (id, immediate = false) => {
    viewId = id;
    cinematic = id === 'cinematic';
    const [pos, tgt] = viewTargets(id);
    if (immediate) {
      camera.position.copy(pos);
      controls.target.copy(tgt);
      controls.update();
      return;
    }
    tween.fromPos.copy(camera.position);
    tween.fromTgt.copy(controls.target);
    tween.toPos.copy(pos);
    tween.toTgt.copy(tgt);
    tween.t = 0;
    tween.active = true;
  };

  /** 只改灯光、雾、材质亮度的那一批参数 */
  const applyAppearance = (params) => {
    if (!city || !built) return;
    const palette = city.style.palette;
    const preset = lightPresetOf(params.lightPreset);
    const bright = params.brightness;
    const mul = preset.skyMul * bright;

    skyUniforms.top.value.set(palette.skyTop).multiplyScalar(mul);
    skyUniforms.bottom.value.set(palette.skyBottom).multiplyScalar(mul);

    const fogColor = new THREE.Color(palette.fog).multiplyScalar(Math.max(0.12, preset.skyMul * 0.95));
    const density = (palette.fogDensity * params.haze * 0.42) / Math.max(600, city.size);


    scene.fog = new THREE.FogExp2(fogColor, density);

    hemi.color.set(palette.skyBottom).multiplyScalar(mul);
    hemi.groundColor.set(palette.ground);
    hemi.intensity = preset.ambient * bright;

    sun.color.set(preset.sun);
    sun.intensity = (preset.night > 0.5 ? 0.55 : 1.75) * bright;

    const r = city.size * 0.9;
    sun.position.set(
      Math.cos(preset.azim) * r * Math.cos(preset.elev * Math.PI * 0.5),
      Math.max(80, Math.sin(preset.elev * Math.PI * 0.5) * r),
      Math.sin(preset.azim) * r * Math.cos(preset.elev * Math.PI * 0.5),
    );
    const shadowSpan = city.size * 0.62;
    Object.assign(sun.shadow.camera, {
      left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan,
      near: 10, far: city.size * 3.2,
    });
    sun.shadow.camera.updateProjectionMatrix();
    fill.color.set(palette.skyBottom);
    fill.intensity = 0.3 * bright * preset.skyMul;
    fill.position.set(-r * 0.6, r * 0.5, -r * 0.4);

    // 夜里玻璃自发光、招牌变亮，白天关掉，这就是切时段最直观的差别。
    // 自发光要压着用：给满了整栋楼会变成一块纯色发光体，反而看不出体量。
    const nightGlow = preset.night * params.neon;
    built.materials.glass.emissiveIntensity = 0.05 + nightGlow * 0.34;
    built.materials.glass.emissive.set(palette.glass).lerp(new THREE.Color(palette.accent2), nightGlow * 0.22);
    built.materials.sign.color.setScalar(Math.min(1, 0.26 + params.neon * (0.3 + preset.night * 0.5)));

    built.materials.cable.opacity = 0.5 + params.neon * 0.35;
    renderer.toneMappingExposure = 1.02 * bright * (preset.night > 0.5 ? 1.18 : 1);
  };

  const setCity = (nextCity, params) => {
    const first = city === null;
    city = nextCity;
    disposeBuilt();
    built = buildCityGroup(city, params);
    scene.add(built.group);
    applyAppearance(params);
    if (first) setView('orbit', true);
    else setView(viewId, true);
  };

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };

  /** 沿折线取插值点，轻轨和索道轿厢都靠它移动 */
  const along = (pts, t) => {
    const f = t * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const k = f - i;
    const a = pts[i];
    const b = pts[i + 1];
    return {
      x: a[0] + (b[0] - a[0]) * k,
      y: a[1] + (b[1] - a[1]) * k,
      z: a[2] + (b[2] - a[2]) * k,
      rot: Math.atan2(b[2] - a[2], b[0] - a[0]),
    };
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    clockT += dt;

    if (tween.active) {
      tween.t = Math.min(1, tween.t + dt * 1.6);
      const e = tween.t < 0.5 ? 2 * tween.t * tween.t : 1 - (-2 * tween.t + 2) ** 2 / 2;
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      controls.target.lerpVectors(tween.fromTgt, tween.toTgt, e);
      if (tween.t >= 1) tween.active = false;
    } else if (cinematic && city) {
      const r = city.size * 0.58;
      const a = clockT * 0.055;
      camera.position.set(Math.cos(a) * r, city.size * 0.26 + Math.sin(clockT * 0.15) * city.size * 0.05, Math.sin(a) * r);
    }

    if (built) {
      for (const train of built.animated.trains) {
        const t = ((clockT * 0.035 + train.offset) % 2);
        const p = along(train.pts, t > 1 ? 2 - t : t);
        train.group.position.set(p.x, p.y + 3.4, p.z);
        train.group.rotation.y = -p.rot;
      }
      for (const cabin of built.animated.cabins) {
        const t = ((clockT * 0.05 + cabin.offset) % 2);
        const p = along(cabin.pts, t > 1 ? 2 - t : t);
        cabin.mesh.position.set(p.x, p.y - 3.4, p.z);
      }
    }

    controls.update();
    sun.target.position.copy(controls.target);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);

    fpsRing.push(dt);
    if (fpsRing.length > 40) fpsRing.shift();
    if (onStats && fpsRing.length === 40 && Math.random() < 0.06) {
      const avg = fpsRing.reduce((s, v) => s + v, 0) / fpsRing.length;
      onStats({ fps: Math.round(1 / avg), calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
    }
  };

  resize();
  raf = requestAnimationFrame(frame);

  return {
    setCity,
    applyAppearance,
    setView,
    resize,
    getView: () => viewId,
    onStats: (cb) => { onStats = cb; },
    dispose: () => {
      cancelAnimationFrame(raf);
      disposeBuilt();
      controls.dispose();
      renderer.dispose();
    },
  };
}
