import * as THREE from 'three';
import { LEVEL } from '../game/level.js';
import { ambientOffset, burstDirection, profileFor, seedFor } from '../game/effects.js';
import { PLANETARY_RINGS, playerVisualForMass, ringMotionState, satelliteOrbitState, stageChargeProgress } from '../game/progression.js';
import { POLARITY_FLIP_DURATION } from '../game/universes.js';
import { CANDY_LIGHTING, lightingState } from '../game/lighting.js';
import { voxelProfileFor, voxelSurface } from './voxel.js';

// 体素几何按“形状 + 分辨率”缓存，缩放交给 mesh.scale，避免每个对象重复构网格。
const voxelGeometryCache = new Map();
const voxelGeometry = (shape, resolution) => {
  const key = `${shape}|${resolution}`;
  const cached = voxelGeometryCache.get(key);
  if (cached) return cached;
  const { positions, normals, uvs } = voxelSurface(shape, resolution);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  voxelGeometryCache.set(key, geometry);
  return geometry;
};

// 归一化体素网格 + 按类型半轴缩放，替代原先的平滑几何。
const voxelMesh = (type, size, material) => {
  const profile = voxelProfileFor(type);
  const mesh = new THREE.Mesh(voxelGeometry(profile.shape, profile.resolution), material);
  mesh.scale.set(profile.scale[0] * size, profile.scale[1] * size, profile.scale[2] * size);
  return mesh;
};

const rgbColor = (hue, saturation = 0.86, lightness = 0.68) => new THREE.Color().setHSL(hue % 1, saturation, lightness);
const cssColor = (value) => new THREE.Color(value);
const POLARITY_DARK_COLOR = cssColor('#a45cff');
const POLARITY_LIGHT_COLOR = cssColor('#ffe36e');
const polarityTargetColor = new THREE.Color();

const glowMaterial = (color, opacity = 1) => new THREE.MeshPhysicalMaterial({
  color,
  emissive: color,
  emissiveIntensity: 1.45,
  roughness: 0.2,
  metalness: 0.06,
  clearcoat: 0.72,
  clearcoatRoughness: 0.22,
  transparent: opacity < 1,
  opacity,
});

const createRingMaterial = (ring) => new THREE.ShaderMaterial({
  uniforms: {
    uProgress: { value: 0 },
    uTrackColor: { value: cssColor(ring.trackColor) },
    uStartColor: { value: cssColor(ring.gradientStart) },
    uEndColor: { value: cssColor(ring.gradientEnd) },
    uOpacity: { value: 0 },
    uOffset: { value: 0 },
    uPulse: { value: 0 },
    uFlowPhase: { value: 0 },
    uFlowDirection: { value: 1 },
    uComplete: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uProgress;
    uniform vec3 uTrackColor;
    uniform vec3 uStartColor;
    uniform vec3 uEndColor;
    uniform float uOpacity;
    uniform float uOffset;
    uniform float uPulse;
    uniform float uFlowPhase;
    uniform float uFlowDirection;
    uniform float uComplete;
    varying vec2 vUv;
    void main() {
      float phase = fract(vUv.x + uOffset);
      float edge = fwidth(phase) * 1.5;
      float complete = step(0.9995, uComplete);
      float partialFill = step(0.0001, uProgress) * (1.0 - smoothstep(uProgress - edge, uProgress + edge, phase));
      float filled = mix(partialFill, 1.0, complete);
      float linearGradient = clamp(phase / max(uProgress, 0.0001), 0.0, 1.0);
      float loopGradient = 0.5 - 0.5 * cos(phase * 6.28318530718);
      float gradientPosition = mix(linearGradient, loopGradient, complete);
      vec3 energy = mix(uStartColor, uEndColor, gradientPosition);
      float flowPosition = fract(uFlowPhase * uFlowDirection);
      float flowDistance = abs(phase - flowPosition);
      flowDistance = min(flowDistance, 1.0 - flowDistance);
      float flow = exp(-flowDistance * flowDistance * 420.0) * filled;
      vec3 finalColor = mix(uTrackColor, energy * (1.0 + uPulse), filled);
      finalColor += flow * vec3(0.9, 0.95, 1.0) * (0.65 + uPulse);
      gl_FragColor = vec4(finalColor, uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const labelCache = new Map();
const labelTexture = (text, color) => {
  const key = `${text}|${color}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 64);
  context.font = '700 40px "Chakra Petch", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.fillText(text, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, texture);
  return texture;
};

const createLabel = (text, color) => {
  const material = new THREE.SpriteMaterial({ map: labelTexture(text, color), transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.8, 1);
  sprite.renderOrder = 999;
  return sprite;
};

const addCandyGlints = (mesh, object) => {
  const glints = new THREE.Group();
  // 父网格已归一化到 [-1, 1] 并由 mesh.scale 放大，糖霜高光用局部归一化坐标。
  const geometry = voxelGeometry('box', 2);
  const positions = [
    [-0.32, 0.36, 0.42, 0.13],
    [0.34, 0.2, 0.48, 0.085],
  ];
  for (const [x, y, z, size] of positions) {
    const glint = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.86 }));
    glint.position.set(x, y, z);
    glint.scale.setScalar(size);
    glints.add(glint);
  }
  mesh.add(glints);
  return glints;
};

const labelColor = (available) => available ? '#fff1a8' : '#7b5a68';
const objectLabelState = (object, available) => {
  if (object.polarity === 'dark') return { text: `-${Math.round(object.mass)}`, color: '#ff8bdc' };
  if (object.polarity === 'light') return { text: `+${Math.round(object.mass)}`, color: available ? '#ffe36e' : '#9a7651' };
  return { text: String(Math.round(object.mass)), color: labelColor(available) };
};

const ringEuler = new THREE.Euler();
const ringQuaternion = new THREE.Quaternion();
const orbitalPoint = (orbit, angle, target = new THREE.Vector3()) => {
  const x = Math.cos(angle) * orbit.radius;
  const y = Math.sin(angle) * orbit.radius;
  target.set(x, y, 0);
  ringEuler.set(orbit.tiltX ?? Math.PI / 2, orbit.tiltY ?? 0, 0, 'XYZ');
  ringQuaternion.setFromEuler(ringEuler);
  target.applyQuaternion(ringQuaternion);
  return target;
};

function createSatelliteVisual(definition) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(voxelGeometry('sphere', 6), glowMaterial(definition.color));
  core.scale.setScalar(definition.size);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(definition.size * 2.1, 12, 8),
    new THREE.MeshBasicMaterial({ color: definition.color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(core, halo);
  const trail = new THREE.Group();
  const trailParticles = [];
  const particleGeometry = voxelGeometry('box', 2);
  for (let index = 0; index < 7; index += 1) {
    const phase = index / 7;
    const material = new THREE.MeshBasicMaterial({
      color: definition.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particle = new THREE.Mesh(particleGeometry, material);
    particle.renderOrder = 8;
    trail.add(particle);
    trailParticles.push({ mesh: particle, phase });
  }
  return { group, core, halo, trail, trailParticles };
}

const trailOffset = new THREE.Vector3();
const tangentPoint = new THREE.Vector3();
const trailTangent = new THREE.Vector3();
const trailNormal = new THREE.Vector3();
const trailLift = new THREE.Vector3();

function updateSatelliteVisual(visual, orbit, time) {
  const satellitePosition = orbitalPoint(orbit, orbit.angle, visual.group.position);
  visual.core.rotation.x = time * orbit.speed * 1.4;
  visual.core.rotation.y = time * orbit.speed * orbit.direction;
  visual.halo.scale.setScalar(1 + Math.sin(time * 4 + orbit.phase) * 0.16);
  const ahead = orbitalPoint(orbit, orbit.angle + 0.025 * orbit.direction, tangentPoint);
  trailTangent.subVectors(ahead, satellitePosition).normalize();
  trailNormal.copy(satellitePosition).normalize();
  trailLift.crossVectors(trailTangent, trailNormal).normalize();
  for (const { mesh, phase } of visual.trailParticles) {
    const age = (time * 0.72 + phase) % 1;
    const distance = 0.025 + age * age * orbit.radius * 0.34;
    const lateral = Math.sin(phase * 19 + time * 2.4) * age * 0.045;
    const lift = Math.cos(phase * 13 + time * 2.9) * age * 0.028;
    trailOffset.copy(satellitePosition)
      .addScaledVector(trailTangent, -distance)
      .addScaledVector(trailLift, lateral)
      .addScaledVector(trailNormal, lift);
    mesh.position.copy(trailOffset);
    const fade = (1 - age) ** 1.8;
    mesh.scale.setScalar((0.025 + fade * 0.04) * (0.82 + phase * 0.28));
    mesh.material.opacity = fade * 0.78;
    mesh.rotation.set(time * (1.2 + phase), time * (0.8 + phase * 0.6), phase * Math.PI);
  }
}

function createPointCloud(count, size, color, opacity, blending = THREE.AdditiveBlending) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    blending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createAmbientSwarm(object, profile) {
  const seed = seedFor(object.id);
  const swarm = createPointCloud(
    profile.ambientCount,
    profile.ambientSize,
    object.color,
    profile.ambientOpacity,
  );
  swarm.position.set(object.x, object.size * 0.72, object.z);
  swarm.userData = { seed, radius: profile.ambientRadius * object.size, object };
  return swarm;
}

function updateAmbientSwarm(swarm, time, polarity = 'neutral') {
  const { object, seed, radius } = swarm.userData;
  const profile = profileFor(object.type);
  const positions = swarm.geometry.attributes.position.array;
  const sampleTime = polarity === 'dark' ? -time : time;
  for (let index = 0; index < profile.ambientCount; index += 1) {
    const [x, y, z] = ambientOffset(object.type, index, seed, sampleTime, radius);
    const flow = (time * 0.55 + index / profile.ambientCount) % 1;
    const flowScale = polarity === 'dark' ? 0.45 + flow * 0.85 : polarity === 'light' ? 1.15 - flow * 0.65 : 1;
    positions[index * 3] = x * flowScale;
    positions[index * 3 + 1] = y * flowScale;
    positions[index * 3 + 2] = z * flowScale;
  }
  swarm.geometry.attributes.position.needsUpdate = true;
  swarm.rotation.y = time * 0.1;
}

function createBurst(event) {
  const profile = profileFor(event.type);
  const seed = seedFor(event.objectId);
  const group = new THREE.Group();
  const baseY = event.size * 0.72;
  group.position.set(event.x, baseY, event.z);
  const outer = createPointCloud(profile.burstCount, profile.burstSize, event.color, 0.95);
  const inner = createPointCloud(Math.ceil(profile.burstCount * 0.38), profile.burstSize * 0.55, 0xffffff, 0.75);
  group.add(outer, inner);
  const velocities = [];
  const innerVelocities = [];
  for (let index = 0; index < profile.burstCount; index += 1) {
    const direction = burstDirection(event.type, index, profile.burstCount, seed);
    velocities.push([
      direction[0] * profile.burstSpeed,
      direction[1] * profile.burstSpeed * 0.82,
      direction[2] * profile.burstSpeed,
    ]);
    if (index < innerVelocities.length + 1 && innerVelocities.length < Math.ceil(profile.burstCount * 0.38)) {
      innerVelocities.push([direction[0] * profile.burstSpeed * 0.38, direction[1] * profile.burstSpeed * 0.24, direction[2] * profile.burstSpeed * 0.38]);
    }
  }
  const shardMaterial = new THREE.MeshBasicMaterial({ color: event.color, transparent: true, opacity: 0.92 });
  const shardCount = Math.min(7, Math.max(3, Math.floor(event.size * 2.8)));
  const shardGeometry = new THREE.TetrahedronGeometry(event.size * 0.11, 0);
  const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, shardCount);
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(shards);
  return {
    group,
    outer,
    inner,
    shards,
    velocities,
    innerVelocities,
    bornAt: 0,
    lifetime: profile.lifetime,
    type: event.type,
    seed,
  };
}

const burstMatrix = new THREE.Matrix4();
const burstPosition = new THREE.Vector3();
const burstScale = new THREE.Vector3();
const burstQuaternion = new THREE.Quaternion();

function updatePlayerTrail(points, count, time, stage, radius, velocity) {
  const positions = points.geometry.attributes.position.array;
  const speed = Math.hypot(velocity.x, velocity.z);
  const direction = speed > 0.1 ? { x: velocity.x / speed, z: velocity.z / speed } : { x: -0.2, z: 0.8 };
  for (let index = 0; index < 58; index += 1) {
    const active = index < count;
    const distance = 0.25 + (index / Math.max(1, count)) * (2.5 + radius * 0.85);
    const angle = stage.stageIndex * 0.8 + time * (0.8 + stage.energy * 1.4) + index * 0.53;
    const jitter = Math.sin(time * 2.2 + index * 1.7) * 0.12;
    positions[index * 3] = active ? -direction.x * distance + Math.cos(angle) * (0.12 + distance * 0.09) : 999;
    positions[index * 3 + 1] = active ? Math.sin(angle * 1.3) * (0.15 + distance * 0.12) : 999;
    positions[index * 3 + 2] = active ? -direction.z * distance + Math.sin(angle) * (0.12 + distance * 0.09) + jitter : 999;
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.material.color.copy(cssColor(stage.shellColor));
  points.material.size = 0.08 + stage.energy * 0.1;
  points.material.opacity = 0.56 + stage.energy * 0.34;
}

function updateBurst(burst, age) {
  const progress = clamp01(age / burst.lifetime);
  const eased = 1 - (1 - progress) ** 3;
  const positions = burst.outer.geometry.attributes.position.array;
  for (let index = 0; index < burst.velocities.length; index += 1) {
    const velocity = burst.velocities[index];
    positions[index * 3] = velocity[0] * eased;
    positions[index * 3 + 1] = velocity[1] * eased + progress * progress * -0.65;
    positions[index * 3 + 2] = velocity[2] * eased;
  }
  burst.outer.geometry.attributes.position.needsUpdate = true;
  const innerPositions = burst.inner.geometry.attributes.position.array;
  for (let index = 0; index < burst.innerVelocities.length; index += 1) {
    const velocity = burst.innerVelocities[index];
    innerPositions[index * 3] = velocity[0] * eased;
    innerPositions[index * 3 + 1] = velocity[1] * eased + progress * 0.35;
    innerPositions[index * 3 + 2] = velocity[2] * eased;
  }
  burst.inner.geometry.attributes.position.needsUpdate = true;
  const fade = (1 - progress) ** 1.35;
  burst.outer.material.opacity = 0.95 * fade;
  burst.inner.material.opacity = 0.75 * fade;
  burst.shards.material.opacity = 0.92 * fade;
  for (let index = 0; index < burst.shards.count; index += 1) {
    const direction = burstDirection(burst.type, index + 13, burst.shards.count, burst.seed + 101);
    burstPosition.set(direction[0] * eased * 1.6, direction[1] * eased * 1.6 + progress * 0.4, direction[2] * eased * 1.6);
    burstQuaternion.setFromAxisAngle(direction, progress * 4.2 + index);
    burstScale.setScalar(Math.max(0.04, 1 - progress * 0.72));
    burstMatrix.compose(burstPosition, burstQuaternion, burstScale);
    burst.shards.setMatrixAt(index, burstMatrix);
  }
  burst.shards.instanceMatrix.needsUpdate = true;
  burst.group.scale.setScalar(1 + progress * 0.45);
  return progress >= 1;
}

export function createScene(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CANDY_LIGHTING.background);
  scene.fog = new THREE.FogExp2(CANDY_LIGHTING.background, 0.025);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(CANDY_LIGHTING.hemisphereSky, CANDY_LIGHTING.hemisphereGround, 2.2));
  const keyLight = new THREE.DirectionalLight(CANDY_LIGHTING.key, 4.2);
  keyLight.position.set(-12, 24, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(CANDY_LIGHTING.rim, 2.3);
  rimLight.position.set(14, 12, -18);
  scene.add(rimLight);
  const fillLight = new THREE.PointLight(CANDY_LIGHTING.fill, 1.35, 28, 1.6);
  fillLight.position.set(2, 8, 13);
  scene.add(fillLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 40, 26, 20),
    new THREE.MeshStandardMaterial({ color: 0x281027, roughness: 0.78, metalness: 0.18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.set(0, -0.03, 2);
  scene.add(ground);
  const grid = new THREE.GridHelper(52, 26, 0xff62c7, 0x47223d);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  scene.add(grid);

  const structureMeshes = new Map();
  for (const structure of LEVEL.structures) {
    const material = glowMaterial(structure.color, structure.kind === 'phaseable' ? 0.38 : 0.78);
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(structure.width, structure.height, structure.depth), material);
    mesh.position.set(structure.x, structure.height / 2, structure.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    structureMeshes.set(structure.id, mesh);
    const label = createLabel(structure.kind === 'phaseable' ? 'SHIFT' : 'DASH', structure.kind === 'phaseable' ? '#ff8bdc' : '#fff1a8');
    label.position.set(structure.x, structure.height + 0.8, structure.z);
    scene.add(label);
    structureMeshes.set(`${structure.id}-label`, label);
  }

  const anchorMeshes = new Map();
  for (const anchor of LEVEL.anchors) {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(voxelGeometry('octahedron', 7), glowMaterial(anchor.color));
    shell.scale.setScalar(anchor.radius);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(anchor.radius * 1.35, 0.06, 8, 40), glowMaterial(anchor.color, 0.62));
    cage.rotation.x = Math.PI / 2;
    group.add(shell, cage);
    group.position.set(anchor.x, anchor.radius + 0.25, anchor.z);
    scene.add(group);
    anchorMeshes.set(anchor.id, group);
    const abilityLabel = anchor.ability === 'dash' ? 'DASH' : anchor.ability === 'gravity' ? 'PULL' : 'PHASE';
    const abilityColor = anchor.ability === 'dash' ? '#ffb257' : anchor.ability === 'gravity' ? '#58ffbf' : '#ff62c7';
    const label = createLabel(abilityLabel, abilityColor);
    label.position.set(anchor.x, anchor.radius * 2 + 1.2, anchor.z);
    label.scale.set(2.2, 1.1, 1);
    scene.add(label);
    anchorMeshes.set(`${anchor.id}-label`, label);
  }

  const objectMeshes = new Map();
  const ambientSwarms = new Map();
  const labels = new Map();
  for (const object of LEVEL.objects) {
    const mesh = voxelMesh(object.type, object.size, glowMaterial(object.color));
    mesh.position.set(object.x, object.size * 0.72, object.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.baseY = mesh.position.y;
    mesh.userData.baseColor = cssColor(object.color);
    mesh.userData.glints = addCandyGlints(mesh, object);
    scene.add(mesh);
    objectMeshes.set(object.id, mesh);
    const swarm = createAmbientSwarm(object, profileFor(object.type));
    scene.add(swarm);
    ambientSwarms.set(object.id, swarm);
    const label = createLabel(String(Math.round(object.mass)), labelColor(false));
    label.position.set(object.x, object.size * 1.35 + 0.6, object.z);
    scene.add(label);
    labels.set(object.id, label);
  }

  for (const obstacle of LEVEL.obstacles) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
      new THREE.MeshStandardMaterial({ color: 0x3a1732, emissive: 0x6d244f, emissiveIntensity: 0.65, roughness: 0.42 }),
    );
    mesh.position.set(obstacle.x, obstacle.height / 2, obstacle.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
  }

  const exit = new THREE.Group();
  const exitRing = new THREE.Mesh(
    new THREE.TorusGeometry(LEVEL.exit.radius, 0.18, 12, 48),
    glowMaterial(0xff5f8f, 0.65),
  );
  exitRing.rotation.x = Math.PI / 2;
  exit.add(exitRing);
  const exitBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(LEVEL.exit.radius * 0.72, LEVEL.exit.radius * 1.1, 5.5, 24, 1, true),
    glowMaterial(0xff5f8f, 0.1),
  );
  exitBeam.position.y = 2.75;
  exit.add(exitBeam);
  exit.position.set(LEVEL.exit.x, 0.1, LEVEL.exit.z);
  scene.add(exit);

  const player = new THREE.Group();
  const bodyMaterial = glowMaterial(0xffb1e8);
  // 玩家糖心分辨率高于普通糖果怪，保证放大后仍能读出方块层次。
  const body = new THREE.Mesh(voxelGeometry('sphere', 12), bodyMaterial);
  body.castShadow = true;
  player.add(body);
  const shellMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.2 });
  const shell = new THREE.Mesh(voxelGeometry('sphere', 6), shellMaterial);
  shell.scale.setScalar(1.08);
  player.add(shell);
  const ringGroup = new THREE.Group();
  const ringMaterials = [];
  const ringMeshes = [];
  for (const ringDefinition of PLANETARY_RINGS) {
    const material = createRingMaterial(ringDefinition);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringDefinition.radius, 0.045, 10, 96), material);
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    ringGroup.add(ring);
    ringMaterials.push(material);
    ringMeshes.push(ring);
  }
  player.add(ringGroup);
  const satelliteLayer = new THREE.Group();
  const satelliteVisuals = new Map();
  for (const definition of satelliteOrbitState(90, 0)) {
    const visual = createSatelliteVisual(definition);
    visual.group.visible = false;
    visual.trail.visible = false;
    satelliteLayer.add(visual.group, visual.trail);
    satelliteVisuals.set(definition.id, visual);
  }
  player.add(satelliteLayer);
  const trail = createPointCloud(58, 0.12, 0x9dffe9, 0.72);
  trail.userData.phase = Array.from({ length: 58 }, (_, index) => index * 0.83);
  player.add(trail);
  const gravityField = new THREE.Mesh(
    new THREE.RingGeometry(6.7, 7.2, 72),
    new THREE.MeshBasicMaterial({ color: 0xff62c7, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  gravityField.rotation.x = Math.PI / 2;
  gravityField.position.y = -1.05;
  const playerLight = new THREE.PointLight(CANDY_LIGHTING.playerLight, 1.5, 9, 1.5);
  playerLight.position.y = 1.8;
  player.add(playerLight);
  scene.add(player);

  const stageShockwave = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.5, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  stageShockwave.rotation.x = Math.PI / 2;
  stageShockwave.visible = false;
  scene.add(stageShockwave);
  let stageShockwaveAge = 0;

  const dimensionTunnel = new THREE.Group();
  const tunnelRings = [];
  for (let index = 0; index < 11; index += 1) {
    const hue = index / 11;
    const material = new THREE.MeshBasicMaterial({ color: rgbColor(hue, 0.9, 0.68), transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3 + index * 1.7, 0.035 + index * 0.012, 8, 64), material);
    ring.position.y = index * 3.2;
    ring.rotation.x = Math.PI / 2;
    dimensionTunnel.add(ring);
    tunnelRings.push(ring);
  }
  scene.add(dimensionTunnel);

  const particles = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 70 }, (_, index) => {
      const angle = index * 2.399;
      const radius = 9 + (index % 11) * 2.1;
      return new THREE.Vector3(Math.cos(angle) * radius, 1.5 + (index % 9) * 1.2, Math.sin(angle) * radius);
    })),
    new THREE.PointsMaterial({ color: 0xaaffed, size: 0.08, transparent: true, opacity: 0.6 }),
  );
  scene.add(particles);

  const activeBursts = [];
  const seenCollectionEvents = new Set();
  const seenActionEvents = new Set();
  const seenStageEvents = new Set();
  const spawnCollectionBursts = (events, now) => {
    for (const event of events ?? []) {
      if (seenCollectionEvents.has(event.id)) continue;
      seenCollectionEvents.add(event.id);
      const burst = createBurst(event);
      burst.bornAt = now;
      activeBursts.push(burst);
      scene.add(burst.group);
    }
  };
  const spawnActionBursts = (events, now) => {
    for (const event of events ?? []) {
      if (seenActionEvents.has(event.id)) continue;
      seenActionEvents.add(event.id);
      const isIgnition = event.type === 'stellarIgnition';
      const isAnchor = event.type === 'anchorBreak';
      const isPolarity = event.type === 'polarityFlip';
      const burst = createBurst({
        ...event,
        objectId: event.structureId ?? event.anchorId ?? event.objectId ?? event.type,
        type: isIgnition ? 'core' : isAnchor || isPolarity ? 'crystal' : 'cube',
        size: isIgnition ? 2.4 : isAnchor ? 1.5 : isPolarity ? 1.35 : 1.1,
      });
      burst.bornAt = now;
      activeBursts.push(burst);
      scene.add(burst.group);
    }
  };

  const cameraTarget = new THREE.Vector3();
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  let previous = { x: LEVEL.start.x, z: LEVEL.start.z };
  return {
    render(state, time) {
      spawnCollectionBursts(state.collectionEvents, time);
      spawnActionBursts(state.actionEvents, time);
      const { player: playerState } = state;
      const stage = playerVisualForMass(playerState.mass, playerState.ignited);
      const charge = stageChargeProgress(playerState.mass);
      const chargePulse = charge.progress >= 0.7 ? Math.sin(time * 5.5) * stage.chargePulse * ((charge.progress - 0.7) / 0.3) : 0;
      const ascending = state.status === 'ascending';
      const ascensionProgress = ascending ? clamp01(state.ascensionElapsed / 4) : 0;
      const phaseActive = playerState.abilities?.phase.activeFor > 0;
      const dashActive = playerState.abilities?.dash.activeFor > 0;
      const lighting = lightingState({
        mass: playerState.mass,
        ignited: playerState.ignited,
        ascensionProgress,
        dashActive,
        gravityActive: playerState.abilities?.gravity.active,
      });
      renderer.toneMappingExposure += (lighting.exposure - renderer.toneMappingExposure) * 0.12;
      keyLight.intensity += (lighting.keyIntensity - keyLight.intensity) * 0.08;
      rimLight.intensity += (lighting.rimIntensity - rimLight.intensity) * 0.08;
      fillLight.intensity += (lighting.fillIntensity - fillLight.intensity) * 0.08;
      playerLight.intensity += (lighting.playerIntensity - playerLight.intensity) * 0.12;
      playerLight.distance += (lighting.playerDistance - playerLight.distance) * 0.12;
      playerLight.color.set(lighting.playerColor);
      player.position.set(playerState.x, playerState.radius + ascensionProgress * 3.5, playerState.z);
      player.scale.setScalar(playerState.radius * (1 + ascensionProgress * 0.22));
      const coreColor = cssColor(stage.coreColor);
      const shellColor = cssColor(stage.shellColor);
      const chargeGlow = 1 + chargePulse * 0.35;
      bodyMaterial.color.copy(coreColor);
      bodyMaterial.emissive.copy(coreColor);
      bodyMaterial.emissiveIntensity = playerState.ignited
        ? 7.5 + Math.sin(time * 8) * 1.4
        : stage.glow * chargeGlow + ascensionProgress * 3;
      if (playerState.ignited) {
        bodyMaterial.color.setHex(0xfff7d6);
        bodyMaterial.emissive.setHex(0xffd86b);
      }
      shellMaterial.color.copy(shellColor);
      shellMaterial.opacity = playerState.ignited ? 0.92 : phaseActive ? 0.08 : stage.shellOpacity + ascensionProgress * 0.2;
      if (playerState.ignited) shellMaterial.color.setHex(0xffca70);
      bodyMaterial.opacity = phaseActive ? 0.42 : 1;
      bodyMaterial.transparent = phaseActive;
      gravityField.material.opacity += (((playerState.abilities?.gravity.active ? 0.55 : 0)) - gravityField.material.opacity) * 0.18;
      gravityField.rotation.z += playerState.abilities?.gravity.active ? 0.04 : 0.006;
      const trailCount = Math.min(58, stage.trailCount + (dashActive ? 16 : 0));
      updatePlayerTrail(trail, trailCount, time, stage, playerState.radius, playerState);
      ringGroup.rotation.set(0, 0, 0);
      const ringMotion = ringMotionState(state.status, ascensionProgress, time);
      const satelliteState = satelliteOrbitState(playerState.mass, time, state.status, ascensionProgress);
      const satelliteByRing = new Map();
      for (const orbit of satelliteState) satelliteByRing.set(orbit.ringId, orbit);
      ringMeshes.forEach((ring, index) => {
        const ringData = stage.rings.find((item) => item.id === PLANETARY_RINGS[index].id);
        const motion = ringMotion[index];
        ring.visible = Boolean(ringData);
        if (!ringData) return;
        const mat = ringMaterials[index];
        const pulse = ringData.status === 'charging' && ringData.progress >= 0.7
          ? Math.max(0, chargePulse)
          : 0;
        const satellite = satelliteByRing.get(PLANETARY_RINGS[index].id);
        mat.uniforms.uProgress.value = ringData.status === 'complete' ? 1 : ringData.progress;
        mat.uniforms.uOpacity.value = Math.min(0.85, 0.45 + ringData.progress * 0.3 + pulse * 0.4);
        mat.uniforms.uOffset.value = ringData.status === 'complete' ? motion.spin / (Math.PI * 2) : 0;
        mat.uniforms.uPulse.value = pulse + ascensionProgress * 0.35;
        mat.uniforms.uFlowPhase.value = motion.flowPhase + ascensionProgress * 1.8;
        mat.uniforms.uFlowDirection.value = motion.direction;
        mat.uniforms.uComplete.value = ringData.status === 'complete' ? 1 : 0;
        const ringSpin = ringData.status === 'complete' ? motion.spin : 0;
        ring.rotation.set(motion.tiltX, motion.tiltY, ringSpin);
      });
      const activeSatelliteIds = new Set(satelliteState.map((orbit) => orbit.id));
      satelliteVisuals.forEach((visual, id) => {
        const visible = activeSatelliteIds.has(id);
        visual.group.visible = visible;
        visual.trail.visible = visible;
      });
      for (const orbit of satelliteState) {
        const visual = satelliteVisuals.get(orbit.id);
        if (visual) updateSatelliteVisual(visual, orbit, time);
      }
      if (state.stageUpEvents && state.stageUpEvents.length > 0) {
        const event = state.stageUpEvents.find((item) => !seenStageEvents.has(item.id));
        if (event) {
          seenStageEvents.add(event.id);
          stageShockwave.visible = true;
          stageShockwaveAge = 0;
          stageShockwave.position.set(event.x, 0.1, event.z);
          stageShockwave.material.color.copy(cssColor(stage.shellColor));
        }
      }
      if (stageShockwave.visible) {
        const renderDelta = Math.max(0, Math.min(0.05, time - (stageShockwave.userData.lastTime ?? time)));
        stageShockwave.userData.lastTime = time;
        stageShockwaveAge += renderDelta;
        const swProgress = clamp01(stageShockwaveAge / 0.9);
        const swRadius = 0.5 + swProgress * (playerState.radius * 6 + 4);
        stageShockwave.scale.setScalar(swRadius);
        stageShockwave.material.opacity = (1 - swProgress) * 0.8;
        if (swProgress >= 1) stageShockwave.visible = false;
      }
      const dx = playerState.x - previous.x;
      const dz = playerState.z - previous.z;
      body.rotation.x += dz / Math.max(playerState.radius, 0.1);
      body.rotation.z -= dx / Math.max(playerState.radius, 0.1);
      shell.rotation.y += 0.003 + stage.energy * 0.006;
      previous = { x: playerState.x, z: playerState.z };
      for (const object of state.objects) {
        const mesh = objectMeshes.get(object.id);
        const swarm = ambientSwarms.get(object.id);
        if (!mesh || !swarm) continue;
        mesh.visible = object.active;
        swarm.visible = object.active;
        if (object.active) {
          mesh.position.x = object.x;
          mesh.position.z = object.z;
          swarm.position.x = object.x;
          swarm.position.z = object.z;
          mesh.rotation.y += 0.003 + object.mass * 0.00005;
          mesh.position.y = mesh.userData.baseY + Math.sin(time * 1.7 + object.mass) * 0.12;
          swarm.position.y = mesh.position.y;
          updateAmbientSwarm(swarm, time, object.polarity);
          const available = playerState.mass + 2 >= object.mass && object.polarity !== 'dark';
          const polarityAmount = object.polarity === 'dark'
            ? clamp01(object.polarityCharge / POLARITY_FLIP_DURATION)
            : object.polarity === 'light' ? 1 : 0;
          const targetObjectColor = object.polarity === 'dark'
            ? polarityTargetColor.copy(POLARITY_DARK_COLOR).lerp(POLARITY_LIGHT_COLOR, polarityAmount)
            : object.polarity === 'light' ? POLARITY_LIGHT_COLOR : mesh.userData.baseColor;
          mesh.material.color.lerp(targetObjectColor, 0.12);
          mesh.material.emissive.lerp(targetObjectColor, 0.12);
          swarm.material.color.lerp(targetObjectColor, 0.12);
          mesh.material.emissiveIntensity += ((available ? 2.4 : object.polarity === 'dark' ? 1.5 + polarityAmount * 2 : 0.55) - mesh.material.emissiveIntensity) * 0.08;
          swarm.material.opacity += ((available || object.polarity === 'dark' ? profileFor(object.type).ambientOpacity : 0.12) - swarm.material.opacity) * 0.08;
          if (mesh.userData.glints) {
            mesh.userData.glints.rotation.y = time * 0.35;
            mesh.userData.glints.children.forEach((glint, index) => {
              glint.material.opacity = (0.38 + Math.sin(time * 3 + index * 2) * 0.22) * (available ? 1 : 0.55);
            });
          }
          const label = labels.get(object.id);
          if (label) {
            const targetLabel = objectLabelState(object, available);
            const texture = labelTexture(targetLabel.text, targetLabel.color);
            if (label.material.map !== texture) label.material.map = texture;
            label.material.needsUpdate = true;
            label.position.x = object.x;
            label.position.z = object.z;
            label.position.y = mesh.userData.baseY + object.size * 0.85 + 0.9 + Math.sin(time * 1.7 + object.mass) * 0.12;
            const labelDistance = Math.hypot(playerState.x - object.x, playerState.z - object.z);
            label.visible = labelDistance < 18;
          }
        } else {
          const label = labels.get(object.id);
          if (label) label.visible = false;
        }
      }
      for (const structure of state.structures ?? []) {
        const mesh = structureMeshes.get(structure.id);
        const label = structureMeshes.get(`${structure.id}-label`);
        if (mesh) {
          mesh.visible = structure.active;
          if (structure.kind === 'phaseable') mesh.material.opacity = phaseActive ? 0.08 : 0.38 + Math.sin(time * 3) * 0.08;
        }
        if (label) label.visible = structure.active && Math.hypot(playerState.x - structure.x, playerState.z - structure.z) < 20;
      }
      for (const anchor of state.anchors ?? []) {
        const group = anchorMeshes.get(anchor.id);
        if (!group) continue;
        group.visible = anchor.active;
        if (!anchor.active) continue;
        const beingHit = (anchor.ability === 'dash' && dashActive)
          || (anchor.ability === 'gravity' && playerState.abilities?.gravity.active)
          || (anchor.ability === 'phase' && phaseActive);
        const dist = Math.hypot(playerState.x - anchor.x, playerState.z - anchor.z);
        const inRange = dist < 6;
        group.rotation.y += anchor.ability === 'dash' ? 0.025 : -0.018;
        const baseScale = 1 + Math.sin(time * 4 + anchor.x) * 0.08;
        const hitScale = beingHit && inRange ? 1.3 + Math.sin(time * 20) * 0.15 : 1;
        group.scale.setScalar(baseScale * hitScale);
        const shell = group.children[0];
        if (shell && shell.material) {
          shell.material.emissiveIntensity = beingHit && inRange ? 4 + Math.sin(time * 20) : 1.4;
        }
      }
      const coreMesh = objectMeshes.get('core');
      if (coreMesh && coreMesh.visible) {
        if (!state.encounter.coreUnlocked) {
          coreMesh.material.emissiveIntensity = 0.25 + Math.sin(time * 2) * 0.08;
          coreMesh.rotation.y += 0.004;
        } else {
          coreMesh.material.emissiveIntensity = 2.8 + Math.sin(time * 6) * 0.6;
          coreMesh.rotation.y += 0.02;
        }
      }
      const exitOpen = Boolean(playerState.ignited);
      exitRing.material.color.setHex(exitOpen ? 0x58ffbf : 0xff5f8f);
      exitRing.material.emissive.setHex(exitOpen ? 0x58ffbf : 0xff5f8f);
      exit.rotation.y += exitOpen ? 0.018 : 0.004;
      const tunnelOpacity = ascending ? Math.sin(Math.PI * ascensionProgress) * 0.78 : 0;
      dimensionTunnel.visible = tunnelOpacity > 0.01;
      dimensionTunnel.position.set(playerState.x, playerState.radius * 0.55, playerState.z);
      dimensionTunnel.rotation.z += 0.012 + stage.energy * 0.01;
      tunnelRings.forEach((ring, index) => {
        ring.material.opacity = tunnelOpacity * (1 - index / (tunnelRings.length + 2));
        ring.material.color.copy(cssColor(stage.ringColors[index % stage.ringColors.length]));
        ring.scale.setScalar(1 + ascensionProgress * 0.55);
      });
      particles.rotation.y += 0.0004;
      for (let index = activeBursts.length - 1; index >= 0; index -= 1) {
        const burst = activeBursts[index];
        if (updateBurst(burst, time - burst.bornAt)) {
          scene.remove(burst.group);
          activeBursts.splice(index, 1);
        }
      }
      const sizeFactor = Math.pow(playerState.radius / 1.15, 0.62);
      const distance = ascending ? 10 - ascensionProgress * 4 + playerState.radius * 1.2 : 14 + playerState.radius * 1.8 * sizeFactor;
      const dashAmount = dashActive ? 1 : 0;
      camera.fov += ((52 + dashAmount * 7) - camera.fov) * 0.12;
      camera.updateProjectionMatrix();
      cameraTarget.set(playerState.x + 9, distance, playerState.z + 11 + playerState.radius * 0.6);
      camera.position.lerp(cameraTarget, ascending ? 0.085 : dashActive ? 0.08 : 0.045);
      camera.lookAt(playerState.x, ascending ? playerState.radius + ascensionProgress * 3.2 : 0.5 + playerState.radius * 0.25, playerState.z);
      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      scene.traverse((item) => {
        if (item.geometry) item.geometry.dispose();
        if (item.material) {
          const materials = Array.isArray(item.material) ? item.material : [item.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
