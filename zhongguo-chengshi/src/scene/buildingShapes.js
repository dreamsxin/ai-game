// 每种建筑形态的体块拆解。同一套参数下，重庆的板楼/吊脚楼和西安的合院/大殿
// 必须拆成完全不同的体块组合，风格差异才会「一眼认出来」而不只是换个颜色。
import { KINDS } from '../city/styles.js';


/**
 * 坡屋顶。底模是 4 边锥，它的方形底边是斜的，所以要先转 45°、
 * 再按 √2 放大，才能正好盖住 w×d 的平面。
 */
export function addRoof(ctx, x, y, z, w, h, d, rot, color) {
  ctx.roofs.add(x, y, z, w * 1.4142, h, d * 1.4142, rot + Math.PI / 4, color);
}

/** 局部坐标换算：u 沿开间方向，n 沿进深方向 */
function axes(rot) {

  return { ux: Math.cos(rot), uz: Math.sin(rot), nx: -Math.sin(rot), nz: Math.cos(rot) };
}

/** 玻璃幕墙条：贴在进深方向两个长立面上，夜里靠它发光 */
function curtainWall(ctx, b, y0, height, inset = 0.6) {
  if (height < 6) return;
  const { nx, nz } = axes(b.rot);
  const glassColor = ctx.palette.glass;
  for (const side of [1, -1]) {
    ctx.glass.add(
      b.x + nx * side * (b.d / 2 - inset), y0 + 1.6, b.z + nz * side * (b.d / 2 - inset),
      b.w * 0.9, height - 3.2, 1.1, b.rot, glassColor,
    );
  }
}

/** 屋顶霓虹招牌与幕墙灯带：赛博深圳拉满，古都西安几乎为零 */
function rooftopNeon(ctx, b, top) {
  const chance = ctx.style.features.rooftopSign * ctx.neon;
  if (chance <= 0.01) return;
  const roll = (b.lit * 997) % 1;
  if (roll > chance) return;
  const color = roll > chance * 0.5 ? ctx.palette.accent : ctx.palette.accent2;
  ctx.signs.add(b.x, top + 0.6, b.z, b.w * 0.56, Math.min(6, 2 + b.w * 0.05), 1.2, b.rot, color);

  if (ctx.style.features.neon > 0.7 && b.height > 60 && roll < chance * 0.45) {
    // 只给一部分高楼加横向灯带，而且做薄、略微内收，
    // 否则整栋楼被灯带糊满，看上去就是一根纯色发光棒
    for (let k = 1; k <= 3; k += 1) {
      ctx.signs.add(
        b.x, b.base + b.plinth + (b.height * k) / 4, b.z,
        b.w * 0.99, 0.55, b.d * 0.99, b.rot, k % 2 ? ctx.palette.accent : ctx.palette.accent2,
      );
    }
  }
}


function addPlinth(ctx, b) {
  // 依山而建的关键：地块四角有高差时，先用挡土墙把最低角垫平
  if (b.plinth < 1.2) return b.base;
  if (b.kind === KINDS.stilt) {
    const { ux, uz, nx, nz } = axes(b.rot);
    for (const su of [-0.36, 0.36]) {
      for (const sn of [-0.34, 0.34]) {
        const px = b.x + ux * b.w * su + nx * b.d * sn;
        const pz = b.z + uz * b.w * su + nz * b.d * sn;
        ctx.pillars.add(px, b.base - 1, pz, 1.5, b.plinth + 1.6, 1.5, 0, ctx.palette.rock);
      }
    }
    return b.base + b.plinth;
  }
  ctx.solid.add(b.x, b.base - 0.5, b.z, b.w + 2.2, b.plinth + 0.8, b.d + 2.2, b.rot, ctx.palette.rock);
  return b.base + b.plinth;
}

function glassTower(ctx, b, y0) {
  const { palette } = ctx;
  const shaft = b.height * 0.8;
  ctx.glass.add(b.x, y0, b.z, b.w, shaft, b.d, b.rot, palette.glass);
  ctx.glass.add(b.x, y0 + shaft, b.z, b.w * 0.86, b.height * 0.2, b.d * 0.86, b.rot, palette.glass);
  ctx.solid.add(b.x, y0 + b.height, b.z, b.w * 0.88, 1.8, b.d * 0.88, b.rot, palette.roof);
  if (b.height > 110) {
    ctx.pillars.add(b.x, y0 + b.height + 1.8, b.z, 2.4, b.height * 0.13, 2.4, 0, palette.accent2);
  }
  rooftopNeon(ctx, b, y0 + b.height);
}

/** 板式高层：拆成三个单元模块、屋顶高低错落，就是国内住宅最常见的那种板楼 */
function slab(ctx, b, y0) {
  const { palette } = ctx;
  const { ux, uz } = axes(b.rot);
  const facade = palette.buildings[b.color];
  const mods = [-1, 0, 1];
  const modW = (b.w / 3) * 0.98;
  const tweak = [1, 0.955, 1.03];
  for (let i = 0; i < 3; i += 1) {
    const off = mods[i] * (b.w / 3);
    const h = b.height * tweak[i];
    ctx.solid.add(b.x + ux * off, y0, b.z + uz * off, modW, h, b.d, b.rot, facade);
    ctx.solid.add(b.x + ux * off, y0 + h, b.z + uz * off, modW * 1.03, 1.1, b.d * 1.06, b.rot, palette.roof);
  }
  curtainWall(ctx, b, y0, b.height);
  rooftopNeon(ctx, b, y0 + b.height);
}

/** 瓷砖外墙老楼：屋顶必须有水箱和加建，这是国内旧城区最强的识别特征 */
function tileBlock(ctx, b, y0) {
  const { palette } = ctx;
  const { ux, uz, nx, nz } = axes(b.rot);
  ctx.solid.add(b.x, y0, b.z, b.w, b.height, b.d, b.rot, palette.buildings[b.color]);
  ctx.solid.add(b.x, y0 + b.height, b.z, b.w * 1.03, 1, b.d * 1.03, b.rot, palette.roof);
  const top = y0 + b.height + 1;
  const tanks = 1 + Math.floor(((b.lit * 31) % 1) * 3);
  for (let i = 0; i < tanks; i += 1) {
    const u = (i / tanks - 0.3) * b.w * 0.6;
    const n = (((b.lit * (7 + i)) % 1) - 0.5) * b.d * 0.5;
    ctx.solid.add(
      b.x + ux * u + nx * n, top, b.z + uz * u + nz * n,
      Math.min(6, b.w * 0.2), 2.4, Math.min(5, b.d * 0.24), b.rot, palette.rock,
    );
  }
  curtainWall(ctx, b, y0, b.height, 0.9);
  rooftopNeon(ctx, b, top);
}

/** 吊脚楼：底下一排立柱撑在坡上，中段挑出阳台，山城最典型的民居 */
function stilt(ctx, b, y0) {
  const { palette } = ctx;
  ctx.solid.add(b.x, y0, b.z, b.w, b.height, b.d, b.rot, palette.buildings[b.color]);
  const decks = Math.max(1, Math.floor(b.height / 12));
  for (let i = 1; i <= decks; i += 1) {
    ctx.solid.add(
      b.x, y0 + (b.height * i) / (decks + 1), b.z,
      b.w * 1.1, 0.55, b.d * 1.22, b.rot, palette.roof,
    );
  }
  if (b.height < 16) {
    addRoof(ctx, b.x, y0 + b.height, b.z, b.w * 1.14, 3.4, b.d * 1.3, b.rot, palette.roof);
  } else {

    ctx.solid.add(b.x, y0 + b.height, b.z, b.w * 1.04, 1.1, b.d * 1.08, b.rot, palette.roof);
  }
  curtainWall(ctx, b, y0, b.height, 0.8);
}

/** 合院：四面厢房围出一个天井，每一坊都是坡屋顶，这是里坊城市的基本单元 */
function courtyard(ctx, b, y0) {
  const { palette } = ctx;
  const { ux, uz, nx, nz } = axes(b.rot);
  const facade = palette.buildings[b.color];
  const wingD = Math.min(9.5, b.d * 0.3);
  const wingW = Math.min(9.5, b.w * 0.3);
  const h = Math.max(3.4, Math.min(b.height, 8.5));
  const wings = [
    { ou: 0, on: (b.d - wingD) / 2, w: b.w, d: wingD },
    { ou: 0, on: -(b.d - wingD) / 2, w: b.w, d: wingD },
    { ou: (b.w - wingW) / 2, on: 0, w: wingW, d: Math.max(2, b.d - wingD * 2) },
    { ou: -(b.w - wingW) / 2, on: 0, w: wingW, d: Math.max(2, b.d - wingD * 2) },
  ];
  for (let i = 0; i < wings.length; i += 1) {
    const wing = wings[i];
    const x = b.x + ux * wing.ou + nx * wing.on;
    const z = b.z + uz * wing.ou + nz * wing.on;
    const wh = i < 2 ? h : h * 0.88;
    ctx.solid.add(x, y0, z, wing.w, wh, wing.d, b.rot, facade);
    addRoof(ctx, x, y0 + wh, z, wing.w * 1.08, 2.6 + wing.d * 0.16, wing.d * 1.32, b.rot, palette.roof);
  }
}

/** 殿宇：台基 + 朱红立柱 + 大挑檐屋顶，古都风格的骨架 */
function hall(ctx, b, y0) {
  const { palette } = ctx;
  const { ux, uz, nx, nz } = axes(b.rot);
  const h = Math.max(5, b.height);
  ctx.solid.add(b.x, y0, b.z, b.w * 1.14, 2, b.d * 1.2, b.rot, palette.rock);
  ctx.solid.add(b.x, y0 + 2, b.z, b.w, h, b.d, b.rot, palette.buildings[b.color]);
  for (const su of [-0.4, -0.13, 0.13, 0.4]) {
    ctx.pillars.add(
      b.x + ux * b.w * su + nx * b.d * 0.52, y0 + 2, b.z + uz * b.w * su + nz * b.d * 0.52,
      1.5, h, 1.5, 0, palette.accent,
    );
  }
  addRoof(ctx, b.x, y0 + 2 + h, b.z, b.w * 1.32, Math.max(4.5, h * 0.55), b.d * 1.5, b.rot, palette.roof);
}

/** 楼阁塔：一层层收分、每层挑檐，塔尖收头。西安杭州的制高点全靠它 */
function pagoda(ctx, b, y0) {
  const { palette } = ctx;
  const tiers = Math.max(3, Math.min(11, Math.round(b.height / 9)));
  const tierH = (b.height * 0.86) / tiers;
  let y = y0;
  ctx.solid.add(b.x, y - 1.4, b.z, b.w * 1.5, 1.8, b.d * 1.5, b.rot, palette.rock);
  for (let i = 0; i < tiers; i += 1) {
    const scale = 1 - (i / tiers) * 0.42;
    ctx.solid.add(b.x, y, b.z, b.w * scale, tierH * 0.74, b.d * scale, b.rot, palette.buildings[b.color]);
    addRoof(
      ctx, b.x, y + tierH * 0.74, b.z,
      b.w * scale * 1.42, tierH * 0.42, b.d * scale * 1.42, b.rot + i * 0.05, palette.roof,
    );
    y += tierH;
  }
  ctx.pillars.add(b.x, y, b.z, 1.6, b.height * 0.12, 1.6, 0, palette.accent2);
}

/** 白墙黑瓦民居：小体量、硬山顶、带一间偏房，水乡的密集低层就是它堆出来的 */
function waterHouse(ctx, b, y0) {
  const { palette } = ctx;
  const { ux, uz } = axes(b.rot);
  const h = Math.max(3.2, Math.min(b.height, 9));
  ctx.solid.add(b.x, y0 - 0.4, b.z, b.w * 1.06, 0.8, b.d * 1.06, b.rot, palette.roof);
  ctx.solid.add(b.x, y0, b.z, b.w, h, b.d, b.rot, palette.buildings[b.color]);
  addRoof(ctx, b.x, y0 + h, b.z, b.w * 1.1, 2.2 + b.d * 0.2, b.d * 1.24, b.rot, palette.roof);
  if ((b.lit * 13) % 1 > 0.45) {
    const off = b.w * 0.62;
    const sw = b.w * 0.44;
    const sd = b.d * 0.66;
    const sh = h * 0.72;
    ctx.solid.add(b.x + ux * off, y0, b.z + uz * off, sw, sh, sd, b.rot, palette.buildings[b.color]);
    addRoof(ctx, b.x + ux * off, y0 + sh, b.z + uz * off, sw * 1.1, 1.8, sd * 1.2, b.rot, palette.roof);
  }
}

/** 厂房：长条低矮体量 + 锯齿屋面 + 烟囱，产业带一眼就能分出来 */
function factory(ctx, b, y0) {
  const { palette } = ctx;
  const { ux, uz } = axes(b.rot);
  const h = Math.max(4, b.height);
  ctx.solid.add(b.x, y0, b.z, b.w, h, b.d, b.rot, palette.buildings[b.color]);
  const teeth = Math.max(2, Math.round(b.w / 18));
  for (let i = 0; i < teeth; i += 1) {
    const u = (i / (teeth - 1 || 1) - 0.5) * b.w * 0.82;
    addRoof(ctx, b.x + ux * u, y0 + h, b.z + uz * u, b.w / teeth * 0.9, 2.6, b.d * 0.9, b.rot, palette.roof);
  }
  if ((b.lit * 17) % 1 > 0.55) {
    const u = b.w * 0.36;
    ctx.pillars.add(b.x + ux * u, y0, b.z + uz * u, 3.4, h * 2.4, 3.4, 0, palette.rock);
  }
}

const SHAPES = {
  [KINDS.glassTower]: glassTower,
  [KINDS.crown]: crownTower,
  [KINDS.podiumTower]: podiumTower,
  [KINDS.slab]: slab,
  [KINDS.tile]: tileBlock,
  [KINDS.stilt]: stilt,
  [KINDS.courtyard]: courtyard,
  [KINDS.hall]: hall,
  [KINDS.pagoda]: pagoda,
  [KINDS.waterHouse]: waterHouse,
  [KINDS.factory]: factory,
};

/** 轻轨穿楼：把楼拆成洞口上下两段，中间留空让轨道和站台穿过去 */
function pierced(ctx, b, y0) {
  const { palette } = ctx;
  const facade = palette.buildings[b.color];
  const holeBottom = Math.max(y0 + 3, b.pierced.y);
  const holeTop = holeBottom + b.pierced.height;
  const top = y0 + b.height;
  ctx.solid.add(b.x, y0, b.z, b.w, holeBottom - y0, b.d, b.rot, facade);
  // 洞口两侧留出结构柱，楼才不像是浮在空中
  const { ux, uz } = axes(b.rot);
  for (const su of [-0.44, 0.44]) {
    ctx.solid.add(
      b.x + ux * b.w * su, holeBottom, b.z + uz * b.w * su,
      b.w * 0.12, b.pierced.height, b.d, b.rot, facade,
    );
  }
  if (top > holeTop) {
    ctx.solid.add(b.x, holeTop, b.z, b.w, top - holeTop, b.d, b.rot, facade);
    ctx.solid.add(b.x, top, b.z, b.w * 1.03, 1.1, b.d * 1.03, b.rot, palette.roof);
    curtainWall(ctx, b, holeTop, top - holeTop, 0.9);
  }
  curtainWall(ctx, b, y0, holeBottom - y0, 0.9);
  ctx.signs.add(b.x, holeTop + 1.2, b.z, b.w * 0.5, 3, 1.2, b.rot, palette.accent);
}

export function addBuilding(ctx, b) {
  const y0 = addPlinth(ctx, b);
  if (b.pierced) {
    pierced(ctx, b, y0);
    return;
  }
  (SHAPES[b.kind] ?? tileBlock)(ctx, b, y0);
}

/** 带冠顶的超高层：一层层往里收 + 顶部塔尖，赛博深圳的天际线主力 */
function crownTower(ctx, b, y0) {


  const { palette } = ctx;
  const cuts = [[0.44, 1], [0.26, 0.84], [0.18, 0.64], [0.12, 0.42]];
  let y = y0;
  for (const [frac, scale] of cuts) {
    const h = b.height * frac;
    ctx.glass.add(b.x, y, b.z, b.w * scale, h, b.d * scale, b.rot, palette.glass);
    ctx.solid.add(b.x, y + h, b.z, b.w * scale * 1.06, 1.4, b.d * scale * 1.06, b.rot, palette.roof);
    y += h;
  }
  ctx.pillars.add(b.x, y, b.z, 3, b.height * 0.16, 3, 0, palette.accent);
  rooftopNeon(ctx, b, y);
}

/** 裙楼 + 塔楼：国内商业综合体最常见的组合 */
function podiumTower(ctx, b, y0) {

  const { palette } = ctx;
  const podH = Math.min(Math.max(b.height * 0.17, 8), 28);
  const towerH = Math.max(b.height - podH, 6);
  ctx.solid.add(b.x, y0, b.z, b.w, podH, b.d, b.rot, palette.buildings[b.color]);
  ctx.solid.add(b.x, y0 + podH, b.z, b.w * 1.04, 1.2, b.d * 1.04, b.rot, palette.roof);
  ctx.glass.add(b.x, y0 + podH, b.z, b.w * 0.64, towerH, b.d * 0.64, b.rot, palette.glass);
  ctx.solid.add(b.x, y0 + podH + towerH, b.z, b.w * 0.68, 1.6, b.d * 0.68, b.rot, palette.roof);
  rooftopNeon(ctx, b, y0 + b.height);
}
