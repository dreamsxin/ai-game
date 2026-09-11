// 把城市数据翻译成 three.js 对象。
// 地面用一张按格生成的 DataTexture（水域/路网/用地一次画完），楼宇用一个 InstancedMesh，
// 所以整座城不管多大都只有两次 draw call 级别的开销。
import * as THREE from 'three';
import { ROAD_NONE, ROAD_SPECS, TERRAIN_WATER, ZONE_WATER, zoneSpec } from '../game/rules.js';

export const colToX = (city, col) => (col - city.cols / 2) * city.cellMeters;
export const rowToZ = (city, row) => (row - city.rows / 2) * city.cellMeters;
export const xToCol = (city, x) => Math.floor(x / city.cellMeters + city.cols / 2);
export const zToRow = (city, z) => Math.floor(z / city.cellMeters + city.rows / 2);

export const linearRgb = (hex) => {
  const color = new THREE.Color(hex);
  return [color.r, color.g, color.b];
};

/** 逐格铺出「这格是什么用地」，路面和水域优先级更高。 */
export function rasterZones(city) {
  const zones = new Array(city.cols * city.rows).fill(null);
  for (const block of city.blocks) {
    for (let row = block.row; row < block.row + block.rows; row += 1) {
      for (let col = block.col; col < block.col + block.cols; col += 1) {
        zones[row * city.cols + col] = block.zone;
      }
    }
  }
  return zones;
}

export function groundTexture(city) {
  const zones = rasterZones(city);
  const data = new Uint8Array(city.cols * city.rows * 4);
  const paint = new THREE.Color();
  for (let index = 0; index < zones.length; index += 1) {
    const road = city.roads[index];
    if (city.terrain[index] === TERRAIN_WATER && road === ROAD_NONE) {
      paint.set(zoneSpec(ZONE_WATER).color);
    } else if (road !== ROAD_NONE) {
      paint.set(ROAD_SPECS[road].color);
    } else {
      // 没被街区覆盖的缝隙按人行道处理，免得出现纯黑格。
      paint.set(zones[index] ? zoneSpec(zones[index]).color : 0x1b2030);
      // 地块底色压暗但要留得住颜色，楼体才是画面主角，用地又还看得出来。
      paint.multiplyScalar(0.58);
    }
    const offset = index * 4;
    data[offset] = Math.round(paint.r * 255);
    data[offset + 1] = Math.round(paint.g * 255);
    data[offset + 2] = Math.round(paint.b * 255);
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, city.cols, city.rows);
  // 邻近采样：地图要的是「格子边界清楚」，插值会把路网糊成一团。
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 楼宇实例：几何是单位立方体，缩放放在实例矩阵里，颜色按用地并按高度提亮。
 * instanceId 与 city.buildings 的下标一一对应，点选就靠这个对应关系。
 */
export function buildingInstances(city) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // 立方体原点挪到底面，缩放高度时楼就不会陷进地里。
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshLambertMaterial({ vertexColors: false });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, city.buildings.length));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(Math.max(1, city.buildings.length) * 3),
    3,
  );
  mesh.count = city.buildings.length;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (const building of city.buildings) {
    dummy.position.set(
      colToX(city, building.col + building.cols / 2),
      0,
      rowToZ(city, building.row + building.rows / 2),
    );
    dummy.scale.set(
      building.cols * city.cellMeters,
      building.height,
      building.rows * city.cellMeters,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(building.id, dummy.matrix);
    color.set(zoneSpec(building.zone).color);
    // 越高越亮：夜景灯光的廉价替代，天际线的层次全靠它。
    color.multiplyScalar(0.62 + Math.min(0.55, building.height / 220));
    if (building.landmark) color.offsetHSL(0, 0.1, 0.12);
    mesh.instanceColor.setXYZ(building.id, color.r, color.g, color.b);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}
