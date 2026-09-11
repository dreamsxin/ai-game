import * as THREE from 'three';
import { LANE_COUNT, LANE_WIDTH, OBSTACLES, PLAYER_STAND_HEIGHT, laneX } from '../game/rules.js';
import { zoneBlend } from '../game/progression.js';
import { RUNNER_PARTS, VOXEL_SIZE, buildVoxelMesh, linearRgb, partOffset } from './voxel.js';

const TRACK_HALF_WIDTH = (LANE_COUNT * LANE_WIDTH) / 2;
const GROUND_AHEAD = 170;
const GROUND_BEHIND = 30;
const MAX_INSTANCES = 64;
const COIN_CAPACITY = MAX_INSTANCES * 4;
const STRIPE_COUNT = 52;
const STRIPE_SPACING = 4;
const STRIPE_SPAN = STRIPE_COUNT * STRIPE_SPACING;
const SCENERY_COUNT = 44;
const SCENERY_SPACING = 9;
const SCENERY_SPAN = SCENERY_COUNT * SCENERY_SPACING;

const OBSTACLE_COLORS = {
  crate: 0xb2762f,
  barrier: 0xe8444f,
  wall: 0x8b8fa3,
  pit: 0x11111a,
};

const geometryFromVoxels = (voxels, options) => {
  const mesh = buildVoxelMesh(voxels, options);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

const mix = (from, to, t) => from + (to - from) * t;

const blendColor = (target, fromHex, toHex, t) => {
  const from = linearRgb(fromHex);
  const to = linearRgb(toHex);
  target.setRGB(mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t));
  return target;
};

export function createScene(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2(0x000000, 0.016);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 320);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x404058, 0.85);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffffff, 1.25);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const disposables = [];
  const track = (resource) => {
    disposables.push(resource);
    return resource;
  };

  const groundMaterial = track(new THREE.MeshLambertMaterial({ color: 0x4f9d4b }));
  const groundGeometry = track(new THREE.BoxGeometry(LANE_COUNT * LANE_WIDTH, 1, GROUND_AHEAD + GROUND_BEHIND));
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.position.set(0, -0.5, GROUND_BEHIND - (GROUND_AHEAD + GROUND_BEHIND) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  // APPEND_SCENE_RAILS
  const railMaterial = track(new THREE.MeshLambertMaterial({ color: 0x2c2c3a }));
  const railGeometry = track(new THREE.BoxGeometry(0.5, 1.1, GROUND_AHEAD + GROUND_BEHIND));
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(side * (TRACK_HALF_WIDTH + 0.25), 0.05, ground.position.z);
    rail.receiveShadow = true;
    scene.add(rail);
  }

  // 车道分隔线与路侧方块只靠 modulo 循环复用，位移感全部来自它们。
  const stripeMaterial = track(new THREE.MeshLambertMaterial({ color: 0xffffff }));
  const stripeGeometry = track(new THREE.BoxGeometry(0.18, 0.06, 1.8));
  const stripes = new THREE.InstancedMesh(stripeGeometry, stripeMaterial, STRIPE_COUNT * (LANE_COUNT - 1));
  stripes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(stripes);

  const sceneryMaterial = track(new THREE.MeshLambertMaterial({ color: 0x3f8a3d }));
  const sceneryGeometry = track(new THREE.BoxGeometry(1.6, 1.6, 1.6));
  const scenery = new THREE.InstancedMesh(sceneryGeometry, sceneryMaterial, SCENERY_COUNT * 2);
  scenery.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scenery.castShadow = true;
  scene.add(scenery);

  const runner = new THREE.Group();
  scene.add(runner);
  const runnerMaterial = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const limbs = {};
  for (const [name, part] of Object.entries(RUNNER_PARTS)) {
    const geometry = track(geometryFromVoxels(part.voxels, { size: VOXEL_SIZE, origin: part.origin }));
    const mesh = new THREE.Mesh(geometry, runnerMaterial);
    mesh.position.set(...partOffset(part));
    mesh.castShadow = true;
    runner.add(mesh);
    limbs[name] = mesh;
  }

  const obstacleMeshes = {};
  for (const [kind, shape] of Object.entries(OBSTACLES)) {
    // 坑的物理区间在地面以下，直接照搬会画成一块看不见的方块，
    // 所以只有它改用一层贴地的暗色板来表示缺口。
    const height = kind === 'pit' ? 0.08 : shape.high - shape.low;
    const centreY = kind === 'pit' ? 0.05 : shape.low + height / 2;
    const geometry = track(new THREE.BoxGeometry(LANE_WIDTH - 0.24, height, shape.depth));
    const material = track(new THREE.MeshLambertMaterial({ color: OBSTACLE_COLORS[kind] }));
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = kind !== 'pit';
    mesh.count = 0;
    scene.add(mesh);
    obstacleMeshes[kind] = { mesh, centreY };
  }
  // APPEND_SCENE_PICKUPS
  const coinMaterial = track(new THREE.MeshLambertMaterial({ color: 0xffd447, emissive: 0x4a3200 }));
  const coinGeometry = track(new THREE.BoxGeometry(0.5, 0.5, 0.12));
  const coinMesh = new THREE.InstancedMesh(coinGeometry, coinMaterial, MAX_INSTANCES * 4);
  coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coinMesh.count = 0;
  scene.add(coinMesh);

  const powerupMaterial = track(new THREE.MeshLambertMaterial({ vertexColors: false }));
  const powerupGeometry = track(new THREE.OctahedronGeometry(0.55, 0));
  const powerupMesh = new THREE.InstancedMesh(powerupGeometry, powerupMaterial, 8);
  powerupMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  powerupMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3), 3);
  powerupMesh.count = 0;
  scene.add(powerupMesh);

  const resize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const dummy = new THREE.Object3D();
  const scratch = new THREE.Color();
  const target = new THREE.Vector3(0, PLAYER_STAND_HEIGHT * 0.6, -8);
  let shake = 0;

  const writeStripes = (distance) => {
    let index = 0;
    for (let lane = 1; lane < LANE_COUNT; lane += 1) {
      const x = laneX(lane) - LANE_WIDTH / 2;
      for (let slot = 0; slot < STRIPE_COUNT; slot += 1) {
        const z = ((slot * STRIPE_SPACING + distance) % STRIPE_SPAN) - STRIPE_SPAN + GROUND_BEHIND;
        dummy.position.set(x, 0.02, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        stripes.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    stripes.instanceMatrix.needsUpdate = true;
  };
  // APPEND_SCENE_WRITERS
  const writeScenery = (distance) => {
    let index = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let slot = 0; slot < SCENERY_COUNT; slot += 1) {
        const z = ((slot * SCENERY_SPACING + distance * 0.98) % SCENERY_SPAN) - SCENERY_SPAN + GROUND_BEHIND;
        const wobble = ((slot * 37) % 11) / 11;
        dummy.position.set(side * (TRACK_HALF_WIDTH + 2.2 + wobble * 2.4), 0.5 + wobble * 1.4, z);
        dummy.rotation.set(0, wobble * 0.6, 0);
        dummy.scale.setScalar(0.7 + wobble);
        dummy.updateMatrix();
        scenery.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    scenery.instanceMatrix.needsUpdate = true;
  };

  const writeObstacles = (state) => {
    const counters = {};
    for (const kind of Object.keys(obstacleMeshes)) counters[kind] = 0;
    for (const obstacle of state.obstacles) {
      const entry = obstacleMeshes[obstacle.kind];
      const slot = counters[obstacle.kind];
      if (!entry || slot >= MAX_INSTANCES) continue;
      const z = -(obstacle.z + obstacle.depth / 2 - state.distance);
      if (z > GROUND_BEHIND || z < -GROUND_AHEAD) continue;
      dummy.position.set(laneX(obstacle.lane), entry.centreY, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      entry.mesh.setMatrixAt(slot, dummy.matrix);
      counters[obstacle.kind] = slot + 1;
    }
    for (const [kind, entry] of Object.entries(obstacleMeshes)) {
      entry.mesh.count = counters[kind];
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const writeCoins = (state, time) => {
    let slot = 0;
    for (const coin of state.coins) {
      if (slot >= COIN_CAPACITY) break;
      const z = -(coin.z - state.distance);
      if (z > GROUND_BEHIND || z < -GROUND_AHEAD) continue;
      dummy.position.set(coin.x, 1 + Math.sin(time * 2.4 + coin.z) * 0.08, z);
      dummy.rotation.set(0, time * 3.2, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      coinMesh.setMatrixAt(slot, dummy.matrix);
      slot += 1;
    }
    coinMesh.count = slot;
    coinMesh.instanceMatrix.needsUpdate = true;
  };
  // APPEND_SCENE_RENDER
  const POWERUP_COLORS = { magnet: 0x4de1ff, shield: 0xa0ff6a };
  const writePowerups = (state, time) => {
    let slot = 0;
    for (const powerup of state.powerups) {
      if (slot >= 8) break;
      const z = -(powerup.z - state.distance);
      if (z > GROUND_BEHIND || z < -GROUND_AHEAD) continue;
      dummy.position.set(powerup.x, 1.2 + Math.sin(time * 2 + powerup.z) * 0.12, z);
      dummy.rotation.set(0, time * 1.8, time * 0.9);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      powerupMesh.setMatrixAt(slot, dummy.matrix);
      const rgb = linearRgb(POWERUP_COLORS[powerup.kind] ?? 0xffffff);
      powerupMesh.instanceColor.setXYZ(slot, rgb[0], rgb[1], rgb[2]);
      slot += 1;
    }
    powerupMesh.count = slot;
    powerupMesh.instanceMatrix.needsUpdate = true;
    powerupMesh.instanceColor.needsUpdate = true;
  };

  const poseRunner = (state, time) => {
    runner.position.set(state.x, state.y, 0);
    const stride = time * Math.max(6, state.speed * 1.15);
    const swing = state.grounded ? Math.sin(stride) : 0.35;
    const airborne = state.grounded ? 0 : 1;
    limbs.legLeft.rotation.x = swing * 0.95 - airborne * 0.5;
    limbs.legRight.rotation.x = -swing * 0.95 - airborne * 0.9;
    limbs.armLeft.rotation.x = -swing * 0.85 - airborne * 0.6;
    limbs.armRight.rotation.x = swing * 0.85 - airborne * 0.6;
    limbs.body.rotation.x = state.grounded ? Math.sin(stride * 2) * 0.03 : 0.12;
    // 滑铲时整体前倾并压低，跟模拟层 PLAYER_SLIDE_HEIGHT 的判定保持视觉一致。
    runner.rotation.x = state.sliding ? -1.15 : 0;
    runner.position.y = state.y + (state.sliding ? 0.42 : 0);
    const flicker = state.invulnerable > 0 && Math.floor(time * 14) % 2 === 0;
    runner.visible = !flicker;
  };
  // APPEND_SCENE_LOOP
  const applyZone = (distance) => {
    const blend = zoneBlend(distance);
    blendColor(scene.background, blend.from.sky, blend.to.sky, blend.t);
    blendColor(scene.fog.color, blend.from.sky, blend.to.sky, blend.t);
    scene.fog.density = mix(blend.from.fog, blend.to.fog, blend.t);
    blendColor(groundMaterial.color, blend.from.ground[0], blend.to.ground[0], blend.t);
    blendColor(sceneryMaterial.color, blend.from.ground[1], blend.to.ground[1], blend.t);
    blendColor(stripeMaterial.color, blend.from.accent, blend.to.accent, blend.t);
    blendColor(scratch, blend.from.ground[2], blend.to.ground[2], blend.t);
    railMaterial.color.copy(scratch);
  };

  return {
    render(state, time) {
      applyZone(state.distance);
      writeStripes(state.distance);
      writeScenery(state.distance);
      writeObstacles(state);
      writeCoins(state, time);
      writePowerups(state, time);
      poseRunner(state, time);

      for (const effect of state.effects) {
        if (effect.type === 'crash') shake = 1;
      }
      shake = Math.max(0, shake - 0.045);
      const jolt = shake * shake * 0.4;

      camera.position.set(
        state.x * 0.34 + Math.sin(time * 47) * jolt,
        3.3 + state.y * 0.32 + Math.cos(time * 53) * jolt,
        6.4,
      );
      target.set(state.x * 0.5, 1.15 + state.y * 0.4, -9);
      camera.lookAt(target);
      sun.position.set(state.x + 6, 14, 8);
      sun.target.position.set(state.x, 0, -6);
      sun.target.updateMatrixWorld();

      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      for (const mesh of [stripes, scenery, coinMesh, powerupMesh]) mesh.dispose();
      for (const entry of Object.values(obstacleMeshes)) entry.mesh.dispose();
      for (const resource of disposables) resource.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}






