import * as THREE from 'three';
import { LEVEL } from '../game/level.js';
import { ambientOffset, burstDirection, profileFor, seedFor } from '../game/effects.js';
import { PLANETARY_RINGS, playerVisualForMass, ringMotionState, stageChargeProgress } from '../game/progression.js';

const geometryFor = (object) => {
  const size = object.size;
  if (object.type === 'orb') return new THREE.IcosahedronGeometry(size, 2);
  if (object.type === 'cylinder') return new THREE.CylinderGeometry(size * 0.68, size * 0.82, size * 2, 16);
  if (object.type === 'cube') return new THREE.BoxGeometry(size * 1.55, size * 1.55, size * 1.55);
  if (object.type === 'prism') return new THREE.CylinderGeometry(size, size, size * 1.7, 3);
  return new THREE.OctahedronGeometry(size, object.type === 'core' ? 1 : 0);
};

const rgbColor = (hue, saturation = 0.86, lightness = 0.68) => new THREE.Color().setHSL(hue % 1, saturation, lightness);
const cssColor = (value) => new THREE.Color(value);

const glowMaterial = (color, opacity = 1) => new THREE.MeshStandardMaterial({
  color,
  emissive: color,
  emissiveIntensity: 1.45,
  roughness: 0.25,
  metalness: 0.2,
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

const labelColor = (available) => available ? '#a2ffe8' : '#5a8580';

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

function updateAmbientSwarm(swarm, time) {
  const { object, seed, radius } = swarm.userData;
  const profile = profileFor(object.type);
  const positions = swarm.geometry.attributes.position.array;
  for (let index = 0; index < profile.ambientCount; index += 1) {
    const [x, y, z] = ambientOffset(object.type, index, seed, time, radius);
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
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
    const angle = stage.stageIndex * 0.8 + time * stage.spin * 0.8 + index * 0.53;
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
  scene.background = new THREE.Color(0x061113);
  scene.fog = new THREE.FogExp2(0x061113, 0.025);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xa7fff0, 0x071018, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffb78b, 4.2);
  keyLight.position.set(-12, 24, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 40, 26, 20),
    new THREE.MeshStandardMaterial({ color: 0x0b2020, roughness: 0.78, metalness: 0.18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.set(0, -0.03, 2);
  scene.add(ground);
  const grid = new THREE.GridHelper(52, 26, 0x3df6cf, 0x174b48);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  scene.add(grid);

  const puzzleGroup = new THREE.Group();
  const puzzleModules = new Map();
  const puzzleColors = { white: 0xdffdf6, cyan: 0x73fbd3, coral: 0xff8f78, gold: 0xffca70 };
  const moduleSize = LEVEL.puzzle.moduleSize;
  for (const [id, module] of Object.entries(LEVEL.puzzle.modules)) {
    const group = new THREE.Group();
    const tileColor = id === LEVEL.puzzle.entry ? 0x297c6f : id === LEVEL.puzzle.checkpoint ? 0x793b72 : module.contents?.length ? 0x694334 : 0x173c3d;
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(moduleSize - 0.55, 0.22, moduleSize - 0.55),
      new THREE.MeshStandardMaterial({ color: tileColor, emissive: tileColor, emissiveIntensity: 0.42, roughness: 0.6, transparent: true, opacity: 0.86 }),
    );
    tile.position.y = 0.08;
    group.add(tile);
    const moduleLabel = createLabel(module.label, '#dffdf6');
    moduleLabel.position.y = 0.55;
    moduleLabel.scale.set(3.4, 1.7, 1);
    group.add(moduleLabel);
    for (const [direction, port] of Object.entries(module.ports ?? {})) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.8), glowMaterial(puzzleColors[port.color] ?? puzzleColors.white));
      const offset = moduleSize * 0.43;
      marker.position.set(direction === 'east' ? offset : direction === 'west' ? -offset : 0, 0.28, direction === 'south' ? offset : direction === 'north' ? -offset : 0);
      group.add(marker);
    }
    puzzleGroup.add(group);
    puzzleModules.set(id, group);
  }
  const plannedPath = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffca70, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthTest: false }),
  );
  plannedPath.renderOrder = 20;
  plannedPath.visible = false;
  puzzleGroup.add(plannedPath);
  scene.add(puzzleGroup);

  const objectMeshes = new Map();
  const ambientSwarms = new Map();
  const labels = new Map();
  for (const object of LEVEL.objects) {
    const mesh = new THREE.Mesh(geometryFor(object), glowMaterial(object.color));
    mesh.position.set(object.x, object.size * 0.72, object.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.baseY = mesh.position.y;
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
      new THREE.MeshStandardMaterial({ color: 0x173c3d, emissive: 0x0c4643, emissiveIntensity: 0.65, roughness: 0.42 }),
    );
    mesh.position.set(obstacle.x, obstacle.height / 2, obstacle.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
  }

  const exit = new THREE.Group();
  const exitRing = new THREE.Mesh(
    new THREE.TorusGeometry(LEVEL.exit.radius, 0.18, 12, 48),
    glowMaterial(0xff735c, 0.65),
  );
  exitRing.rotation.x = Math.PI / 2;
  exit.add(exitRing);
  const exitBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(LEVEL.exit.radius * 0.72, LEVEL.exit.radius * 1.1, 5.5, 24, 1, true),
    glowMaterial(0xff735c, 0.1),
  );
  exitBeam.position.y = 2.75;
  exit.add(exitBeam);
  exit.position.set(LEVEL.exit.x, 0.1, LEVEL.exit.z);
  scene.add(exit);

  const player = new THREE.Group();
  const bodyMaterial = glowMaterial(0x71ffe0);
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), bodyMaterial);
  body.castShadow = true;
  player.add(body);
  const shellMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.2 });
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.08, 2), shellMaterial);
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
  const trail = createPointCloud(58, 0.12, 0x9dffe9, 0.72);
  trail.userData.phase = Array.from({ length: 58 }, (_, index) => index * 0.83);
  player.add(trail);
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
  const spawnCollectionBursts = (events, now) => {
    for (const event of events ?? []) {
      const burst = createBurst(event);
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
      const planning = state.status === 'planning';
      const boardPositions = new Map();
      state.puzzle?.board.forEach((id, index) => {
        const row = Math.floor(index / LEVEL.puzzle.columns);
        const column = index % LEVEL.puzzle.columns;
        const x = LEVEL.puzzle.origin.x + column * moduleSize;
        const z = LEVEL.puzzle.origin.z + row * moduleSize;
        const module = puzzleModules.get(id);
        if (module) {
          module.position.set(x, 0, z);
          module.visible = planning || Boolean(state.puzzle?.committed);
        }
        boardPositions.set(id, new THREE.Vector3(x, 0.36, z));
      });
      if (state.puzzle?.committed && state.puzzle.analysis?.route) {
        plannedPath.geometry.setFromPoints(state.puzzle.analysis.route.map((routeStep) => boardPositions.get(routeStep.moduleId)));
        plannedPath.visible = true;
        plannedPath.material.opacity = 0.55 + Math.sin(time * 4) * 0.2;
      } else {
        plannedPath.visible = false;
      }
      const { player: playerState } = state;
      const stage = playerVisualForMass(playerState.mass);
      const charge = stageChargeProgress(playerState.mass);
      const chargePulse = charge.progress >= 0.7 ? Math.sin(time * 5.5) * stage.chargePulse * ((charge.progress - 0.7) / 0.3) : 0;
      const ascending = state.status === 'ascending';
      const ascensionProgress = ascending ? clamp01(state.ascensionElapsed / 4) : 0;
      player.position.set(playerState.x, playerState.radius + ascensionProgress * 3.5, playerState.z);
      player.scale.setScalar(playerState.radius * (1 + ascensionProgress * 0.22));
      const coreColor = cssColor(stage.coreColor);
      const shellColor = cssColor(stage.shellColor);
      const chargeGlow = 1 + chargePulse * 0.35;
      bodyMaterial.color.copy(coreColor);
      bodyMaterial.emissive.copy(coreColor);
      bodyMaterial.emissiveIntensity = stage.glow * chargeGlow + ascensionProgress * 3;
      shellMaterial.color.copy(shellColor);
      shellMaterial.opacity = stage.shellOpacity + ascensionProgress * 0.2;
      updatePlayerTrail(trail, stage.trailCount, time, stage, playerState.radius, playerState);
      ringGroup.rotation.set(0, 0, 0);
      const ringMotion = ringMotionState(state.status, ascensionProgress, time);
      ringMeshes.forEach((ring, index) => {
        const ringData = stage.rings.find((item) => item.id === PLANETARY_RINGS[index].id);
        const motion = ringMotion[index];
        ring.visible = Boolean(ringData);
        if (!ringData) return;
        const mat = ringMaterials[index];
        const pulse = ringData.status === 'charging' && ringData.progress >= 0.7
          ? Math.max(0, chargePulse)
          : 0;
        mat.uniforms.uProgress.value = ringData.status === 'complete' ? 1 : ringData.progress;
        mat.uniforms.uOpacity.value = Math.min(1, 0.62 + ringData.progress * 0.28 + pulse);
        mat.uniforms.uOffset.value = motion.spin / (Math.PI * 2);
        mat.uniforms.uPulse.value = pulse + ascensionProgress * 0.35;
        mat.uniforms.uFlowPhase.value = motion.flowPhase + ascensionProgress * 1.8;
        mat.uniforms.uFlowDirection.value = motion.direction;
        mat.uniforms.uComplete.value = ringData.status === 'complete' ? 1 : 0;
        ring.rotation.set(motion.tiltX, motion.tiltY, motion.spin);
      });
      if (state.stageUpEvents && state.stageUpEvents.length > 0) {
        const event = state.stageUpEvents[0];
        stageShockwave.visible = true;
        stageShockwaveAge = 0;
        stageShockwave.position.set(event.x, 0.1, event.z);
        stageShockwave.material.color.copy(cssColor(stage.shellColor));
      }
      if (stageShockwave.visible) {
        stageShockwaveAge += 0.016;
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
          mesh.rotation.y += 0.003 + object.mass * 0.00005;
          mesh.position.y = mesh.userData.baseY + Math.sin(time * 1.7 + object.mass) * 0.12;
          swarm.position.y = mesh.position.y;
          updateAmbientSwarm(swarm, time);
          const available = playerState.mass + 2 >= object.mass;
          mesh.material.emissiveIntensity += ((available ? 2.4 : 0.55) - mesh.material.emissiveIntensity) * 0.08;
          swarm.material.opacity += ((available ? profileFor(object.type).ambientOpacity : 0.12) - swarm.material.opacity) * 0.08;
          const label = labels.get(object.id);
          if (label) {
            const targetColor = labelColor(available);
            const currentColor = label.material.map === labelTexture(String(Math.round(object.mass)), targetColor) ? targetColor : null;
            if (currentColor !== targetColor) label.material.map = labelTexture(String(Math.round(object.mass)), targetColor);
            label.material.needsUpdate = true;
            label.position.y = mesh.userData.baseY + object.size * 0.85 + 0.9 + Math.sin(time * 1.7 + object.mass) * 0.12;
          }
        }
      }
      const exitOpen = playerState.mass >= 90;
      exitRing.material.color.setHex(exitOpen ? 0x7dffe4 : 0xff735c);
      exitRing.material.emissive.setHex(exitOpen ? 0x7dffe4 : 0xff735c);
      exit.rotation.y += exitOpen ? 0.018 : 0.004;
      const tunnelOpacity = ascending ? Math.sin(Math.PI * ascensionProgress) * 0.78 : 0;
      dimensionTunnel.visible = tunnelOpacity > 0.01;
      dimensionTunnel.position.set(playerState.x, playerState.radius * 0.55, playerState.z);
      dimensionTunnel.rotation.z += 0.012 + stage.spin * 0.01;
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
      if (planning) {
        const centerX = LEVEL.puzzle.origin.x + moduleSize;
        const centerZ = LEVEL.puzzle.origin.z + moduleSize;
        cameraTarget.set(centerX, 31, centerZ + 0.01);
        camera.position.lerp(cameraTarget, 0.1);
        camera.lookAt(centerX, 0, centerZ);
      } else {
        cameraTarget.set(playerState.x + 9, distance, playerState.z + 11 + playerState.radius * 0.6);
        camera.position.lerp(cameraTarget, ascending ? 0.085 : 0.045);
        camera.lookAt(playerState.x, ascending ? playerState.radius + ascensionProgress * 3.2 : 0.5 + playerState.radius * 0.25, playerState.z);
      }
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
