// 取景：把 100×150 的场地摆进一台固定的斜俯视相机里。
//
// 这一份只有数学，不 import three，所以能在 node --test 里跑。
// 摆相机这件事有两条硬要求，摆错了不是「不好看」而是「玩不了」：
// 1. 整块场地必须全在画面里——纵版射击看不见上半屏等于闭着眼打。
// 2. 远处不能压得太扁：斜角越平远处敌人越小，小到看不见就成了盲区。
// 两条都在 view.test.js 里被守着。
//
// 坐标约定（后面每个模块都照这个来）：
//   世界 X = 场地 x - 50      （左负右正）
//   世界 Z = 场地 y - 75      （+Z 朝镜头，也就是屏幕下方／近处）
//   世界 Y = 高度，地面 0，战机在 SHIP_ALT
// 于是「往上是远方」就是 -Z 方向，敌人从远处压过来这件事有了真实的纵深。

export const FIELD_W = 100;
export const FIELD_H = 150;

// 俯角和视场是一对：角度越平、视场越大，纵深越强，但远处那一半也越糊。
// 58°／58° 量出来的远近尺寸比约 0.7——立体感足够，远处的敌人还认得出形状。
export const TILT = 58;
export const FOV = 58;

/** 各类东西的飞行高度。地面 0，抬得越高投影上越往画面上方挪。 */
export const ALT = {
  ground: 1.4,
  low: 3.2,
  ship: 6,
  enemy: 6.6,
  boss: 8.4,
  shot: 6,
  ceiling: 17,
};

/** 相机盯着的地方：场地中心略偏下，让战机附近落在画面中段而不是贴着底边。 */
const TARGET = { x: 0, y: ALT.ship, z: 4 };
const MARGIN = 0.94;

const RAD = Math.PI / 180;

export const worldX = (x) => x - FIELD_W / 2;
export const worldZ = (y) => y - FIELD_H / 2;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a) => {
  const len = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
};

/** 场地这只盒子的八个角。取景要保证这八个点全在画面内。 */
export const fieldCorners = () => {
  const points = [];
  for (const x of [0, FIELD_W]) {
    for (const y of [0, FIELD_H]) {
      for (const h of [0, ALT.ceiling]) {
        points.push({ x: worldX(x), y: h, z: worldZ(y) });
      }
    }
  }
  return points;
};

/**
 * 把一个世界点投到 NDC（[-1,1] 就是画面内）。
 * 用的是 three 的相机约定：相机看向自己的 -Z。
 */
export function project(point, camera, aspect, fov = FOV) {
  const zAxis = norm(sub(camera.pos, camera.target));
  const xAxis = norm(cross({ x: 0, y: 1, z: 0 }, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const v = sub(point, camera.pos);
  const depth = -dot(v, zAxis);
  const half = Math.tan((fov / 2) * RAD);
  return {
    x: dot(v, xAxis) / (depth * half * aspect),
    y: dot(v, yAxis) / (depth * half),
    depth,
  };
}

/**
 * 求相机位置：俯角和 fov 定死，只解「退多远」。
 * 迭代法——投影尺寸和距离近似成反比，乘几轮就收敛了。
 */
function solveView(aspect, tilt, fov) {
  const dir = { x: 0, y: Math.sin(tilt * RAD), z: Math.cos(tilt * RAD) };
  const corners = fieldCorners();
  let distance = FIELD_H;
  for (let pass = 0; pass < 40; pass += 1) {
    const camera = {
      pos: { x: TARGET.x + dir.x * distance, y: TARGET.y + dir.y * distance, z: TARGET.z + dir.z * distance },
      target: TARGET,
    };
    let worst = 0;
    let behind = false;
    for (const corner of corners) {
      const ndc = project(corner, camera, aspect, fov);
      if (ndc.depth <= 1) {
        behind = true;
        break;
      }
      worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y));
    }
    if (behind) {
      distance *= 1.6;
      continue;
    }
    const ratio = worst / MARGIN;
    if (Math.abs(ratio - 1) < 0.0005) break;
    distance *= ratio;
  }
  return {
    pos: { x: TARGET.x + dir.x * distance, y: TARGET.y + dir.y * distance, z: TARGET.z + dir.z * distance },
    target: { ...TARGET },
    distance,
    tilt,
    fov,
  };
}

// 同一个屏幕比例只解一次。拖动每帧都要问「一个像素等于几格」，重解四十轮纯属浪费。
const viewCache = new Map();

/** 取景。返回的对象是共享的，别去改它。 */
export function fitView(aspect, { tilt = TILT, fov = FOV } = {}) {
  const key = `${aspect.toFixed(4)}|${tilt}|${fov}`;
  let hit = viewCache.get(key);
  if (!hit) {
    hit = solveView(aspect, tilt, fov);
    viewCache.set(key, hit);
  }
  return hit;
}

/**
 * 一个 CSS 像素等于几个场地格——**按场地上那一处的深度算**。
 *
 * 2.5D 里这不是一个常数：远处压得扁，同样拖一像素在远端要走更多格。
 * 相对拖动如果照「场地高 / 画布高」这种平均值换算，竖向会慢掉四成、
 * 而且船越往上越粘（0.202 对真实的 0.325，往上到 y=30 处真实值是 0.501）。
 * 所以走位换算必须问这一份，而且要带上船当前的 y。
 */
export function pixelScale(aspect, width, height, fieldY, options) {
  const camera = fitView(aspect, options);
  const fov = options?.fov ?? FOV;
  const probe = 6;
  const at = (fx, fy) => project({ x: worldX(fx), y: ALT.ship, z: worldZ(fy) }, camera, aspect, fov);
  const mid = FIELD_W / 2;
  const left = at(mid - probe, fieldY);
  const right = at(mid + probe, fieldY);
  const near = at(mid, fieldY + probe);
  const far = at(mid, fieldY - probe);
  // NDC 到像素：Δpx = Δndc / 2 × 边长。
  const spanX = Math.abs(((right.x - left.x) / 2) * width);
  const spanY = Math.abs(((near.y - far.y) / 2) * height);
  return {
    sx: spanX > 0 ? (probe * 2) / spanX : 0,
    sy: spanY > 0 ? (probe * 2) / spanY : 0,
  };
}

/**
 * 远近尺寸比：同一个东西摆在场地最远端和最近端，屏幕上的大小之比。
 * 屏幕尺寸和距离成反比，所以这个比值就是「近端距离 / 远端距离」。
 * 太接近 1 说明画面根本没有纵深；太小说明远处小到看不清。
 */
export function farNearScale(aspect, options) {
  const camera = fitView(aspect, options);
  const far = project({ x: 0, y: ALT.enemy, z: worldZ(0) }, camera, aspect, options?.fov ?? FOV);
  const near = project({ x: 0, y: ALT.enemy, z: worldZ(FIELD_H) }, camera, aspect, options?.fov ?? FOV);
  return near.depth / far.depth;
}
