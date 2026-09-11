// 几何装配层：把城市数据变成尽量少的 draw call。
// 所有方块塞进一个 InstancedMesh，所有坡屋顶塞进一个，路面/桥面这类带状物合并成一张网格。
import * as THREE from 'three';

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();

/** 实例收集器：先攒下所有变换和颜色，最后一次性生成 InstancedMesh */
class Instances {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.items = [];
  }

  /** y 是体块底面高度，内部会换算成中心点 */
  add(x, y, z, w, h, d, rot, color, opts) {
    this.items.push([x, y, z, w, h, d, rot || 0, color, opts?.pivot ?? 0.5]);
    return this;
  }

  build(name) {
    const count = this.items.length;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, count));
    mesh.name = name;
    mesh.count = count;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < count; i += 1) {
      const [x, y, z, w, h, d, rot, color, pivot] = this.items[i];
      V.set(x, y + h * pivot, z);
      S.set(w, h, d);
      E.set(0, -rot, 0);
      Q.setFromEuler(E);
      M.compose(V, Q, S);
      mesh.setMatrixAt(i, M);
      mesh.setColorAt(i, C.set(color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}

/**
 * 带状几何：沿折线左右各偏移半宽，缝成一条带子。
 * 路面、桥面、匝道、水巷、城墙压顶全都是这个形状。
 */
export function ribbonGeometry(strips) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  for (const strip of strips) {
    const { pts, width, color, lift = 0, follow = null } = strip;
    if (!pts || pts.length < 2) continue;
    C.set(color);
    const start = positions.length / 3;
    const half = width / 2;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next[0] - prev[0];
      let tz = next[2] - prev[2];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      const nx = -tz;
      const nz = tx;
      for (const side of [-1, 1]) {
        const ex = p[0] + nx * half * side;
        const ez = p[2] + nz * half * side;
        // 贴地的带子（路面、河岸）两侧各自采一次地形高度，
        // 否则横坡上整条带子是平的，上坡侧会埋进山里、下坡侧会悬空。
        positions.push(ex, follow ? follow(ex, ez) + lift : p[1] + lift, ez);
        normals.push(0, 1, 0);
        colors.push(C.r, C.g, C.b);
      }
    }

    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = start + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** 地形网格：按高度和坡度混色，水下压暗，山脊露岩 */
export function terrainMesh(city, palette) {
  const { terrain } = city;
  // 高度场本身就比城市大一圈，直接照它的范围建网格
  const extent = terrain.fieldSize;
  const segments = terrain.res;

  const geo = new THREE.PlaneGeometry(extent, extent, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const ground = new THREE.Color(palette.ground);
  const rock = new THREE.Color(palette.rock);
  const veg = new THREE.Color(palette.vegetation);
  const bed = new THREE.Color(palette.water).multiplyScalar(0.4);
  const peak = terrain.maxHeight || 1;


  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrain.heightAt(x, z);
    pos.setY(i, h);
    const slope = Math.min(1, terrain.slopeAt(x, z) * 1.6);
    const alt = Math.max(0, h) / peak;
    if (h < 0.2) {
      C.copy(bed);
    } else {
      C.copy(ground).lerp(veg, Math.max(0, 0.5 - slope * 0.8) * 0.88);
      C.lerp(rock, Math.min(1, slope * 0.85 + alt * 0.35));
      // 轻微色斑：平坦地块不这么处理就是一整片死板的纯色
      C.multiplyScalar(0.93 + (Math.sin(x * 0.0131) + Math.sin(z * 0.0173) + 2) * 0.035);
    }

    colors[i * 3] = C.r;
    colors[i * 3 + 1] = C.g;
    colors[i * 3 + 2] = C.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/**
 * 远景背景板：围着高度场外沿铺一圈方框，把边界高度一路平推到很远。
 * 内沿高度直接取自高度场，所以接缝严丝合缝；外沿远到被雾完全吃掉，
 * 于是画面里再也看不到「地形是一块方板」这件事。
 */
export function backdropMesh(city, palette) {
  const { terrain } = city;
  const inner = terrain.fieldHalf;
  const scale = 3.4;
  const steps = 40;
  const positions = [];
  const colors = [];
  const indices = [];
  const base = new THREE.Color(palette.ground).lerp(new THREE.Color(palette.vegetation), 0.3);

  // 四条边各铺一条带子，内沿点绕方形走一圈，外沿点是它按比例放大后的位置
  const perimeter = (t) => {
    const s = t * 4;
    const side = Math.min(3, Math.floor(s));
    const k = s - side;
    const v = -inner + 2 * inner * k;
    if (side === 0) return [v, -inner];
    if (side === 1) return [inner, v];
    if (side === 2) return [-v, inner];
    return [-inner, -v];
  };

  for (let i = 0; i <= steps * 4; i += 1) {
    const [ix, iz] = perimeter(i / (steps * 4));
    const y = terrain.heightAt(ix, iz);
    positions.push(ix, y, iz, ix * scale, y, iz * scale);
    const tint = 0.9 + (Math.sin(ix * 0.0031) + Math.sin(iz * 0.0037) + 2) * 0.05;
    for (let k = 0; k < 2; k += 1) {
      colors.push(base.r * tint, base.g * tint, base.b * tint);
    }
  }
  for (let i = 0; i < steps * 4; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'backdrop';
  return mesh;
}

/** 水面：一整块半透明平面，比地形略大一圈，免得看到边界 */

export function waterMesh(city, palette) {
  // 铺得足够大，让水面的边界落在雾的后面，视野里才没有那条水平硬边
  const geo = new THREE.PlaneGeometry(city.size * 16, city.size * 16, 1, 1);

  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: palette.water,
    transparent: true,
    opacity: 0.92,
    roughness: 0.08,
    metalness: 0.55,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.15;
  mesh.name = 'water';
  return mesh;
}

export { Instances };
