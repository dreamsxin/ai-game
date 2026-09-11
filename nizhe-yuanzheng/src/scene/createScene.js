// 唯一引用 Three.js 的文件。它只读模拟状态，从不写回。
// 分工：地形与道具在建关时一次性生成，每帧只更新车、轮子、货物、缆绳和车辙颜色。
import * as THREE from 'three';
import { CELLS, heightAt } from '../game/terrain.js';
import { MATERIALS } from '../game/rules.js';
import { cargoLayout } from '../game/cargo.js';
import { winchMount } from '../game/winch.js';
import { advanceCamera, createCameraState } from './camera.js';
import { SITE_COLORS, cargoBox, truckParts } from './parts.js';

const SKY = 0x9fb4c4;
const FOG_NEAR = 60;
const FOG_FAR = 340;
// 车辙颜色每隔几帧刷一次就够：它变得很慢，但顶点数很多。
const RUT_REFRESH_FRAMES = 12;
const SPRAY_COUNT = 160;

/** 地形网格。顶点顺序和高度场数组一一对应，所以可以直接按下标写入。 */
function buildTerrain(terrain, track) {
  const geometry = track(new THREE.PlaneGeometry(terrain.size, terrain.size, CELLS, CELLS));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) position.setY(index, terrain.height[index]);
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
  geometry.computeVertexNormals();
  const material = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** 把材质色和车辙深度写进顶点色。压过的地方更深更湿，一眼能看出哪条辙是自己压的。 */
function paintTerrain(terrain, mesh) {
  const colors = mesh.geometry.attributes.color;
  const verts = CELLS + 1;
  const color = new THREE.Color();
  for (let iz = 0; iz < verts; iz += 1) {
    const cz = Math.min(CELLS - 1, iz);
    for (let ix = 0; ix < verts; ix += 1) {
      const cell = cz * CELLS + Math.min(CELLS - 1, ix);
      const material = MATERIALS[terrain.material[cell]];
      const rut = material.ruts > 0 ? terrain.ruts[cell] / material.ruts : 0;
      color.setHex(material.color).multiplyScalar(1 - rut * 0.42);
      colors.setXYZ(iz * verts + ix, color.r, color.g, color.b);
    }
  }
  colors.needsUpdate = true;
}

/** 树和石头用实例化绘制。四百多个道具如果各自一个 Mesh，一开局就掉帧。 */
function buildProps(level, track, add) {
  const trees = level.props.filter((prop) => prop.type === 'tree');
  const rocks = level.props.filter((prop) => prop.type === 'rock');
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();

  const trunkGeometry = track(new THREE.CylinderGeometry(0.34, 0.5, 1, 6));
  const trunk = new THREE.InstancedMesh(trunkGeometry, track(new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 })), Math.max(1, trees.length));
  const canopyGeometry = track(new THREE.ConeGeometry(1, 1, 7));
  const canopy = new THREE.InstancedMesh(canopyGeometry, track(new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.9 })), Math.max(1, trees.length));
  trees.forEach((tree, index) => {
    const scale = tree.radius / 0.5;
    matrix.compose(new THREE.Vector3(tree.x, tree.y + tree.height * 0.3, tree.z), quaternion, new THREE.Vector3(scale, tree.height * 0.6, scale));
    trunk.setMatrixAt(index, matrix);
    const crown = tree.height * 0.62;
    matrix.compose(new THREE.Vector3(tree.x, tree.y + tree.height * 0.66 + crown * 0.4, tree.z), quaternion, new THREE.Vector3(tree.radius * 4.2, crown, tree.radius * 4.2));
    canopy.setMatrixAt(index, matrix);
  });

  const rockGeometry = track(new THREE.IcosahedronGeometry(1, 0));
  const rock = new THREE.InstancedMesh(rockGeometry, track(new THREE.MeshStandardMaterial({ color: 0x6e7069, roughness: 0.95, flatShading: true })), Math.max(1, rocks.length));
  rocks.forEach((stone, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), stone.radius * 3.1);
    matrix.compose(new THREE.Vector3(stone.x, stone.y + stone.height * 0.25, stone.z), quaternion, new THREE.Vector3(stone.radius, stone.height * 0.7, stone.radius));
    rock.setMatrixAt(index, matrix);
  });

  for (const mesh of [trunk, canopy, rock]) {
    mesh.castShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    add(mesh);
  }
  return [trunk, canopy, rock];
}

/** 路线标杆。没有它玩家在 512 米见方的荒地上根本找不到路。 */
function buildRoutePoles(level, track, add) {
  const points = [];
  for (let index = 0; index + 1 < level.route.length; index += 1) {
    const a = level.route[index];
    const b = level.route[index + 1];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.round(span / 22));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      // 立在路肩上，别挡着车道。
      const nx = -(b.z - a.z) / span;
      const nz = (b.x - a.x) / span;
      const offset = a.width + 1.6;
      points.push({ x: x + nx * offset, z: z + nz * offset });
    }
  }
  const geometry = track(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 5));
  const material = track(new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0x5a3200, roughness: 0.6 }));
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length));
  const matrix = new THREE.Matrix4();
  points.forEach((point, index) => {
    matrix.setPosition(point.x, heightAt(level.terrain, point.x, point.z) + 1.2, point.z);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  add(mesh);
  return mesh;
}

/**
 * 卡车。车身部件挂在 chassis 子组里，每帧按 comLift 下移——重心因为装货上移了，
 * 车壳不能跟着飘起来。轮子不挂在车上：它们的世界坐标由悬挂解算直接给出。
 */
function buildTruck(spec, track, add) {
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  for (const part of truckParts(spec)) {
    const geometry = track(new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z));
    const material = track(new THREE.MeshStandardMaterial({
      color: part.color,
      roughness: part.name === 'glass' ? 0.15 : 0.72,
      metalness: part.name === 'glass' ? 0.4 : 0.16,
      emissive: part.name.startsWith('light') ? 0x554122 : 0x000000,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    mesh.castShadow = true;
    chassis.add(mesh);
  }
  const cargoRoot = new THREE.Group();
  chassis.add(cargoRoot);
  add(group);

  const wheels = spec.axles.map((axle) => {
    const geometry = track(new THREE.CylinderGeometry(axle.radius, axle.radius, axle.width, 14));
    geometry.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, track(new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.98 })));
    mesh.castShadow = true;
    add(mesh);
    return { mesh, angle: 0 };
  });

  return { group, chassis, cargoRoot, wheels };
}

/** 场地圈：货场、交付点、加油点各一个平躺的环。 */
function buildSites(level, track, add) {
  const rings = [];
  const entries = [
    { site: level.depot, color: SITE_COLORS.depot },
    { site: level.site, color: SITE_COLORS.site },
    ...level.refuel.map((site) => ({ site, color: SITE_COLORS.refuel })),
  ];
  for (const entry of entries) {
    const geometry = track(new THREE.RingGeometry(entry.site.radius - 1.1, entry.site.radius, 40));
    geometry.rotateX(-Math.PI / 2);
    const material = track(new THREE.MeshBasicMaterial({ color: entry.color, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(entry.site.x, entry.site.y + 0.35, entry.site.z);
    add(mesh);
    rings.push({ mesh, site: entry.site });
  }
  return rings;
}

/** 泥浆飞溅。粒子池循环使用，打滑的轮子往后甩泥点。 */
function buildSpray(track, add) {
  const geometry = track(new THREE.BufferGeometry());
  const positions = new Float32Array(SPRAY_COUNT * 3);
  const velocities = new Float32Array(SPRAY_COUNT * 3);
  const life = new Float32Array(SPRAY_COUNT);
  for (let index = 0; index < SPRAY_COUNT; index += 1) positions[index * 3 + 1] = -999;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = track(new THREE.PointsMaterial({ color: 0x5a4630, size: 0.22, transparent: true, opacity: 0.85 }));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  add(points);
  return { points, positions, velocities, life, cursor: 0, attribute: geometry.attributes.position };
}

/**
 * 建场景。host 是承载 canvas 的 DOM 节点，level/spec 决定地形和车。
 * 返回 { render, setMode, dispose }：render 每帧调一次，只读 state。
 */
export function createScene(host, level, spec) {
  const terrain = level.terrain;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.4, 900);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const disposables = [];
  const track = (resource) => {
    disposables.push(resource);
    return resource;
  };
  const add = (object) => {
    scene.add(object);
    return object;
  };

  scene.add(new THREE.HemisphereLight(0xdce8f2, 0x3c3a30, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  // 阴影相机只盖车周围一小块，跟着车走——整张 512 米的图不可能一次投影清楚。
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(sun.target);

  const ground = buildTerrain(terrain, track);
  add(ground);
  paintTerrain(terrain, ground);

  const waterGeometry = track(new THREE.PlaneGeometry(terrain.size, terrain.size));
  waterGeometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeometry, track(new THREE.MeshStandardMaterial({
    color: 0x2f5d6b,
    transparent: true,
    opacity: 0.78,
    roughness: 0.22,
    metalness: 0.1,
  })));
  water.position.y = terrain.water;
  add(water);

  const props = buildProps(level, track, add);
  const poles = buildRoutePoles(level, track, add);
  const sites = buildSites(level, track, add);
  const truck = buildTruck(spec, track, add);
  const spray = buildSpray(track, add);

  const cableGeometry = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]));
  const cable = new THREE.Line(cableGeometry, track(new THREE.LineBasicMaterial({ color: 0xf2e6c8 })));
  cable.visible = false;
  add(cable);

  const rig = createCameraState();
  let mode = 'chase';
  let frames = 0;
  let rutVersion = -1;
  let cargoCount = -1;
  const cargoMeshes = [];
  const tempVector = new THREE.Vector3();

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

  /** 车厢里的货只在件数变化时重建，不是每帧。 */
  const syncCargo = (cargo) => {
    if (cargo.length === cargoCount) return;
    cargoCount = cargo.length;
    for (const mesh of cargoMeshes) truck.cargoRoot.remove(mesh);
    cargoMeshes.length = 0;
    for (const item of cargoLayout(spec, cargo)) {
      const part = cargoBox(item);
      const geometry = track(new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z));
      const mesh = new THREE.Mesh(geometry, track(new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.8 })));
      mesh.position.set(part.position.x, part.position.y, part.position.z);
      mesh.castShadow = true;
      truck.cargoRoot.add(mesh);
      cargoMeshes.push(mesh);
    }
  };

  /** 打滑的轮子往身后甩泥。只在软地上甩，硬岩上甩泥会很假。 */
  const emitSpray = (vehicle, dt) => {
    for (const wheel of vehicle.wheels) {
      if (!wheel.contact || wheel.sink < 0.05 || (wheel.waste ?? 0) < 0.45) continue;
      const index = spray.cursor % SPRAY_COUNT;
      spray.cursor += 1;
      const base = index * 3;
      spray.positions[base] = wheel.contactPoint.x;
      spray.positions[base + 1] = wheel.contactPoint.y + 0.1;
      spray.positions[base + 2] = wheel.contactPoint.z;
      const speed = 1.5 + wheel.waste * 5;
      spray.velocities[base] = -wheel.forward.x * speed + (wheel.side ?? 1) * 0.4;
      spray.velocities[base + 1] = 2.2 + wheel.waste * 2;
      spray.velocities[base + 2] = -wheel.forward.z * speed;
      spray.life[index] = 0.75;
    }
    for (let index = 0; index < SPRAY_COUNT; index += 1) {
      if (spray.life[index] <= 0) continue;
      const base = index * 3;
      spray.life[index] -= dt;
      spray.velocities[base + 1] -= 12 * dt;
      spray.positions[base] += spray.velocities[base] * dt;
      spray.positions[base + 1] += spray.velocities[base + 1] * dt;
      spray.positions[base + 2] += spray.velocities[base + 2] * dt;
      if (spray.life[index] <= 0) spray.positions[base + 1] = -999;
    }
    spray.attribute.needsUpdate = true;
  };

  return {
    setMode(next) {
      mode = next;
    },
    render(state, dt) {
      const vehicle = state.vehicle;
      frames += 1;

      truck.group.position.set(vehicle.position.x, vehicle.position.y, vehicle.position.z);
      truck.group.quaternion.set(vehicle.quaternion.x, vehicle.quaternion.y, vehicle.quaternion.z, vehicle.quaternion.w);
      truck.chassis.position.y = -vehicle.comLift;
      syncCargo(state.cargo);

      for (let index = 0; index < truck.wheels.length; index += 1) {
        const wheel = vehicle.wheels[index];
        const visual = truck.wheels[index];
        visual.angle += wheel.spin * dt;
        visual.mesh.position.set(wheel.center.x, wheel.center.y, wheel.center.z);
        visual.mesh.quaternion.set(vehicle.quaternion.x, vehicle.quaternion.y, vehicle.quaternion.z, vehicle.quaternion.w);
        // 先按转向绕车身 y 转，再按轮速绕轮轴转。负号是为了让前进时轮子往前滚。
        visual.mesh.rotateY(-wheel.steer);
        visual.mesh.rotateX(-visual.angle);
      }

      if (state.winch.anchor) {
        const mount = winchMount(spec);
        tempVector.set(mount.x, mount.y - vehicle.comLift, mount.z).applyQuaternion(truck.group.quaternion).add(truck.group.position);
        const positions = cable.geometry.attributes.position;
        positions.setXYZ(0, tempVector.x, tempVector.y, tempVector.z);
        positions.setXYZ(1, state.winch.anchor.x, state.winch.anchor.y, state.winch.anchor.z);
        positions.needsUpdate = true;
        cable.geometry.computeBoundingSphere();
        cable.material.color.setHex(state.winch.tension > 0 ? 0xffd479 : 0xf2e6c8);
        cable.visible = true;
      } else {
        cable.visible = false;
      }

      emitSpray(vehicle, dt);
      if (frames % RUT_REFRESH_FRAMES === 0 && terrain.version !== rutVersion) {
        rutVersion = terrain.version;
        paintTerrain(terrain, ground);
      }

      const groundY = heightAt(terrain, vehicle.position.x, vehicle.position.z);
      advanceCamera(rig, vehicle, mode, dt, groundY);
      camera.position.set(rig.position.x, rig.position.y, rig.position.z);
      camera.lookAt(rig.target.x, rig.target.y, rig.target.z);
      if (camera.fov !== rig.fov) {
        camera.fov = rig.fov;
        camera.updateProjectionMatrix();
      }

      // 太阳跟着车走，阴影贴图才用得上那 1024。
      sun.target.position.set(vehicle.position.x, vehicle.position.y, vehicle.position.z);
      sun.position.set(vehicle.position.x + 26, vehicle.position.y + 42, vehicle.position.z + 18);
      water.position.set(vehicle.position.x, terrain.water, vehicle.position.z);

      const pulse = 0.55 + Math.sin(state.elapsed * 2.4) * 0.2;
      for (const ring of sites) ring.mesh.material.opacity = pulse;

      renderer.render(scene, camera);
    },
    dispose() {
      observer.disconnect();
      for (const mesh of props) mesh.dispose();
      poles.dispose();
      for (const resource of disposables) resource.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}




