// 机翼的「读法」：把 wings.js 里那套火力配置换算成看得见的形状。
//
// 为什么这一层是独立的、而且不碰 three 和 DOM：
// 同一套数字要画两次——场上那副三维机翼（models.js）和选翼界面上那张小图（App.jsx 的 SVG）。
// 两边各算一遍必然会分叉，于是「选的时候看着像五路扇形，飞起来只有一根管子」。
// 所以**翼型轮廓、翼弦、炮口位置、炮管长短、招牌零件**只在这里算一次，两边都从这里取。
//
// 两条踩过的坑写在这里：
// 1. **判定层的 `dx` 不能照抄**。它只有 ±1～3 格（子弹几乎贴着机身出膛），
//    照抄过去五根管子会全挤在座舱底下，「2 路」和「5 路」画出来一模一样。
//    `wingSeats` 把它按同一个系数放大到翼展上，左右对称与相对次序都保住。
// 2. **光靠炮管数区分不够**。玩家两次报的都是同一件事：「机翼都一样」。
//    所以现在**翼型本身**也从机制里长出来：带环的、挂炸弹的、前后都有火力的、
//    只有一根穿甲管的、超短程的……八种轮廓，一眼就能分堆。

import { WINGS } from '../game/wings.js';
import { wingSkin } from './palette.js';

/** 最外侧炮口探到多远（场地格）。翼展是 12.8 格，所以留一点余量给翼尖灯。 */
export const SEAT_EDGE = 4.6;

/** 翼根、翼尖的横向位置（场地格）。**翼尖必须钉在 6.4**：那是判定用的半翼展。 */
export const WING_ROOT_X = 1.4;
export const WING_TIP_X = 6.4;

const specOf = (code) => WINGS[code] ?? WINGS.C;

/**
 * 八种翼型。每一种都对应一类机制，点是右半片翼面的轮廓（场地格）：
 * x 向外，z 向机尾为正（和 models.js 的世界朝向一致）。
 * 左半片一律镜像，所以只写一半。
 */
export const WING_OUTLINES = {
  // 后掠三角：没有特别机制的那些（加农、排炮之外的直射系）。
  delta: [
    [1.4, -2.6],
    [6.4, 1.4],
    [6.4, 2.5],
    [1.4, 3.3],
  ],
  // 大后掠扇形翼，后缘带一道缺口：多路带角度的散射（宽幅、三向）。
  fan: [
    [1.4, -3.2],
    [6.4, 2.0],
    [6.4, 3.4],
    [3.4, 2.3],
    [1.4, 3.8],
  ],
  // 平直长翼：多路平行射击（排炮）。没有后掠，因为它的火力也不偏。
  straight: [
    [1.4, -2.2],
    [6.4, -1.7],
    [6.4, 2.1],
    [1.4, 2.6],
  ],
  // 前掠短翼：射程极短的那些（防卫、霰弹、火焰）。前掠看着就「只管眼前」。
  swept: [
    [1.4, -0.6],
    [6.4, -3.0],
    [6.4, -1.4],
    [1.4, 2.8],
  ],
  // 细长针翼：只有一根管子的重火力（穿甲、激光、引力井）。翼弦很薄。
  needle: [
    [1.4, -3.0],
    [6.4, -1.2],
    [6.4, -0.3],
    [1.4, 1.4],
  ],
  // 挂架翼：带对地炸弹的那些。后缘两块挂架是炸弹真正挂的地方。
  pylon: [
    [1.4, -2.0],
    [6.4, -1.4],
    [6.4, 1.2],
    [5.0, 1.2],
    [5.0, 3.2],
    [3.0, 3.2],
    [3.0, 1.4],
    [1.4, 2.2],
  ],
  // 前后对称的菱形翼：前后都有火力的那些（前后炮、交叉炮）。
  twin: [
    [1.4, -3.0],
    [6.4, -0.7],
    [6.4, 0.7],
    [1.4, 3.0],
  ],
  // 环形护翼：翼面短而圆，真正干活的是绕着机身转的那一圈铁球。
  ring: [
    [1.4, -1.9],
    [4.8, -1.4],
    [6.4, 0.4],
    [4.8, 2.4],
    [1.4, 2.6],
  ],
};

export const WING_SHAPES = Object.keys(WING_OUTLINES);

/** 这一路朝哪打（弧度，0 朝前）。判定层用速度分量表达方向，这里换成角度。 */
export const boltAim = (bolt) => Math.atan2(bolt.vx ?? 0, -(bolt.vy ?? -1));

/** 这一发能飞多远（场地格）。短程机翼的「射程外等于没有」就是按这个读的。 */
export const boltReach = (bolt) => Math.hypot(bolt.vx ?? 0, bolt.vy ?? 0) * (bolt.life ?? 1);

/**
 * 这只机翼有哪些招牌零件。
 * **注意数据住在两层**：铁球数和量子分身写在机翼记录上（`orbs` / `echo`），
 * 而引力井的井口、链弧的跳数、反物质的碎片数写在**那一发子弹**上。
 * 第一版按 `spec.well` 找，于是引力井的发射环和链弧的线圈从来没被画出来过——
 * 这条是 wingIcon.test.js 抓出来的。
 */
export function wingTraits(spec) {
  const volley = spec.volley ?? [];
  return {
    orbs: spec.orbs ?? 0,
    orbDist: spec.orbDist ?? 9.5,
    echo: Boolean(spec.echo),
    well: volley.some((bolt) => bolt.well),
    chain: volley.some((bolt) => bolt.chain),
    burst: volley.some((bolt) => bolt.burst > 0),
  };
}

/**
 * 这只机翼长哪一类轮廓。判定顺序就是「哪条机制更决定它怎么用」：
 * 环 > 对地 > 前后 > 单根重管 > 超短程 > 多路散射 > 多路平行 > 其余。
 */
export function wingShape(spec) {
  const volley = spec.volley ?? [];
  const aims = volley.map((bolt) => Math.abs(boltAim(bolt)));
  const reach = Math.max(0, ...volley.map(boltReach));
  if ((spec.orbs ?? 0) > 0) return 'ring';
  if (volley.some((bolt) => bolt.ground)) return 'pylon';
  if (aims.some((aim) => aim > (2 * Math.PI) / 3)) return 'twin';
  if (volley.length === 1 && (volley[0].pierce === 'armor' || volley[0].kind === 'beam' || volley[0].well)) {
    return 'needle';
  }
  if (reach < 24) return 'swept';
  if (volley.length >= 3 && Math.max(...aims) >= Math.PI / 6) return 'fan';
  if (volley.length >= 3) return 'straight';
  return 'delta';
}

/** 右半片翼面的轮廓点（场地格）。翼弦倍率只拉纵深，不动翼展。 */
export function wingProfile(spec) {
  const chord = wingChord(spec);
  return WING_OUTLINES[wingShape(spec)].map(([x, z]) => [x, z * chord]);
}

/**
 * 翼弦（纵向有多深）的倍率。路数越多越深、冷却越长越钝：
 * 「射速快的看起来就该轻」这件事得画出来。
 */
export function wingChord(spec) {
  const routes = spec.volley?.length ?? 1;
  return Math.min(1.45, Math.max(0.78, 0.74 + routes * 0.1 + (spec.cool >= 0.25 ? 0.16 : 0)));
}

/** 每一路火力的炮口横向位置（场地格）。见文件头第 1 条坑。 */
export function wingSeats(spec) {
  const volley = spec.volley ?? [];
  const widest = Math.max(0, ...volley.map((bolt) => Math.abs(bolt.dx ?? 0)));
  const gain = widest > 0 ? Math.min(2.6, SEAT_EDGE / widest) : 0;
  return volley.map((bolt) => (bolt.dx ?? 0) * gain);
}

/** 一路火力画成多长的管子（场地格）。穿甲最长、激光更长、贴脸的那路只有一个短嘴。 */
export function boltBarrel(bolt) {
  if (bolt.ground) return 0;
  if (bolt.pierce === 'armor') return 6.2;
  if (bolt.kind === 'beam') return 7.4;
  if (bolt.kind === 'short') return 1.6;
  return 3.6;
}

/**
 * 小图的画布。选翼卡片上的图不到 70 像素宽，所以一切尺寸都按这个框来定。
 * `cz` 是翼根在图上的纵向位置——机头那边要留出炮管的地儿（激光那根最长），
 * 所以它不在正中间。wingIcon.test.js 守着「谁都别画到框外」。
 */
export const ICON = { w: 64, h: 40, cx: 32, cz: 19, unit: 26 / WING_TIP_X };

/**
 * 选翼界面上那张小图。返回的是纯数据（点、线、圆、环），由 App.jsx 摆成 SVG。
 * 和场上那副三维机翼同源：轮廓、路数、朝向、炸弹、吊篮、招牌零件都对得上，
 * 所以「挑的时候看到的」就是「飞起来带的」。
 */
export function wingIcon(code) {
  const spec = specOf(code);
  const volley = spec.volley ?? [];
  const skin = wingSkin(spec);
  const shape = wingShape(spec);
  const profile = wingProfile(spec);
  const seats = wingSeats(spec);
  const traits = wingTraits(spec);
  const { cx, cz, unit } = ICON;

  const px = (x, side = 1) => cx + side * x * unit;
  const py = (z) => cz + z * unit;
  const panel = (side) => profile.map(([x, z]) => `${px(x, side).toFixed(2)},${py(z).toFixed(2)}`).join(' ');

  const nose = Math.min(...profile.map(([, z]) => z));
  const tail = Math.max(...profile.map(([, z]) => z));

  const barrels = [];
  const bombs = [];
  for (const [i, bolt] of volley.entries()) {
    const x = px(seats[i]);
    if (bolt.ground) {
      // 炸弹挂在后缘挂架上：藏在翼面底下的东西等于没画。
      bombs.push({ x, y: py(tail) + 1.5, r: 2.6 });
      continue;
    }
    const aim = boltAim(bolt);
    const len = boltBarrel(bolt) * unit * 0.3;
    const base = py(nose) + 3;
    barrels.push({
      x1: x,
      y1: base,
      x2: x + Math.sin(aim) * len,
      y2: base - Math.cos(aim) * len,
      width: bolt.kind === 'flame' ? 3.4 : bolt.pierce === 'armor' ? 2.6 : 1.8,
    });
  }

  // 环形护翼：把那一圈真的画出来（半径跟着 orbDist 走，斜俯视所以压成椭圆）。
  // 这是「B 计划那一路」在选翼界面上唯一看得懂的表达方式。
  // 半径留了 6 像素余量给球本身，否则远环那一型会被卡片裁掉左右两颗球。
  const ringR = Math.min(ICON.w / 2 - 6, traits.orbDist * unit * 0.62);
  const ring =
    traits.orbs > 0
      ? {
          rx: ringR,
          ry: Math.min(13, ringR * 0.44),
          cx,
          cy: cz + 2,
          orbs: traits.orbs,
          r: Math.max(1.8, Math.min(3.4, (spec.orbR ?? 2.6) * 0.9)),
        }
      : null;

  // 招牌零件：引力井的发射环、量子分身的棱镜、链弧的线圈、反物质的弹舱。
  const parts = [];
  if (traits.well) parts.push({ kind: 'well', x: cx, y: py(nose) + 4, r: 5 });
  if (traits.echo) parts.push({ kind: 'echo', x: cx, y: py(0), r: 3.4 });
  if (traits.burst) parts.push({ kind: 'bulb', x: cx, y: py(nose) + 3, r: 3.2 });
  if (traits.chain) {
    parts.push({ kind: 'coil', x: cx - 7, y: py(0), r: 2.2 });
    parts.push({ kind: 'coil', x: cx + 7, y: py(0), r: 2.2 });
  }

  return {
    code: spec.code ?? code,
    shape,
    skin,
    box: ICON,
    // 机身只是一枚小尖：这张图的主角是机翼，不是飞机。
    hull: `${cx},${py(nose) - 1.5} ${cx + 3.2},${py(tail)} ${cx - 3.2},${py(tail)}`,
    panels: [panel(-1), panel(1)],
    // 前缘灯带：从翼根拉到翼尖，翼型的后掠／前掠靠这条线读出来。
    leads: [-1, 1].map((side) => ({
      x1: px(profile[0][0], side),
      y1: py(profile[0][1]),
      x2: px(profile[1][0], side),
      y2: py(profile[1][1]),
    })),
    tips: [-1, 1].map((side) => ({
      x: px(WING_TIP_X, side) - (side > 0 ? 2.4 : 0),
      y: py(profile[1][1]) - 1,
      w: 2.4,
      h: Math.max(4, (profile[2][1] - profile[1][1]) * unit + 3),
    })),
    barrels,
    bombs,
    ring,
    parts,
  };
}
