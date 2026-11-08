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
 * 21 型机翼，21 条轮廓。
 *
 * 上一版只有八条轮廓，常规十五型里有好几型共用一条：玩家在场上认不出「我刚捡的是哪一套」。
 * 这一版一型一条，而且每条仍然**从机制里长出来**——族名写在注释里，形状跟着它怎么打：
 * 后掠三角＝直射，大扇形＝散射，平直＝平行，前掠＝贴脸，细针＝单根重管，
 * 挂架＝炸弹，菱形＝前后都打，环翼＝靠铁球吃饭。
 *
 * 三条硬约束（wingIcon.test.js 逐条守着）：
 * 1. 右半片的**翼尖必须正好探到 6.4**——那是判定用的半翼展，画窄了玩家会按错的宽度躲弹。
 * 2. 轮廓不自交，且从翼根前缘起、绕一圈回到翼根后缘，翼面才不会翻面或打结。
 * 3. 弦向最远的点乘上翼弦倍率仍落在选翼小图的框里，否则卡片上会被裁掉。
 */
export const WING_OUTLINES = {
  // ——— 直射系：后掠三角 ———
  C: [[1.4, -2.8], [6.4, 1.2], [6.4, 2.2], [1.4, 3.0]], // 加农：标准后掠三角
  // ——— 散射系：大后掠扇形，后缘一道缺口 ———
  W: [[1.4, -3.2], [6.4, 2.0], [6.4, 3.4], [3.4, 2.3], [1.4, 3.8]], // 宽幅：五路扇形
  // ——— 平行系：平直长翼 ———
  M: [[1.4, -2.2], [6.4, -1.7], [6.4, 2.1], [1.4, 2.6]], // 排炮：不求后掠，因为火力也不偏
  // ——— 贴脸系：前掠短翼 ———
  V: [[1.4, -0.6], [6.4, -3.0], [6.4, -1.4], [3.6, -0.9], [3.6, 1.6], [1.4, 2.8]], // 防卫：前掠 + 后缘舱口
  N: [[1.4, -0.2], [6.4, -3.0], [6.4, -1.8], [1.4, 2.3]], // 霰弹：掠得最狠，只管眼前
  F: [[1.4, -1.0], [5.0, -1.4], [6.4, -0.2], [4.6, 1.4], [1.4, 2.8]], // 火焰：宽根短刀
  // ——— 三向：宽扇形，翼尖分叉 ———
  S: [[1.4, -3.4], [6.4, 0.6], [6.4, 1.4], [5.2, 2.8], [3.2, 1.8], [1.4, 3.4]],
  // ——— 前后都打：菱形翼（尖翼尖 / 折角后缘）———
  A: [[1.4, -3.2], [5.4, -1.0], [6.4, 0], [5.4, 1.0], [1.4, 3.2]], // 前后：前后对称的尖菱形
  T: [[1.4, -3.0], [6.4, -0.4], [6.4, 0.8], [3.2, 2.0], [3.2, 3.2], [1.4, 2.6]], // 交叉：折角箭形
  // ——— 环翼：翼面短，真正干活的是那圈球 ———
  H: [[1.4, -2.0], [4.2, -1.6], [5.6, -0.6], [6.4, 0.6], [5.2, 2.2], [1.4, 2.8]], // 铁球：圆钝翼尖挂球
  O: [[1.4, -1.4], [4.2, -1.1], [5.7, -0.4], [6.4, 0.4], [4.8, 1.8], [1.4, 2.2]], // 护环：最短最圆
  E: [[1.4, -2.4], [5.6, -1.0], [6.4, 1.0], [4.2, 2.0], [1.4, 2.4]], // 远环：窄而长，环挂在外面
  // ——— 挂架系：后缘开挂架口 ———
  K: [[1.4, -1.8], [6.4, -1.2], [6.4, 1.0], [5.2, 1.0], [5.2, 2.6], [3.4, 2.6], [3.4, 1.2], [1.4, 2.2]], // 破地：两道挂架口
  D: [[1.4, -2.4], [6.4, -1.8], [6.4, 1.4], [4.4, 1.4], [4.4, 3.4], [1.4, 2.6]], // 对地：一道深挂架
  // ——— 单根重管：细长针翼 ———
  J: [[1.4, -3.6], [6.4, -1.6], [6.4, -0.9], [1.4, 0.8]], // 穿甲：最长最薄
  G: [[1.4, -3.2], [6.4, -1.4], [6.4, -0.4], [4.8, 1.2], [1.4, 1.0]], // 引力井：针翼带一个鼓包
  L: [[1.4, -3.4], [6.4, -1.0], [6.4, -0.5], [1.4, 0.6]], // 激光：薄得像一把刀
  // ——— 实验系的其余三型 ———
  Z: [[1.4, -2.6], [6.4, 0.8], [6.4, 2.0], [3.6, 1.6], [1.4, 2.8]], // 链弧：三角带一道线圈槽
  X: [[1.4, -2.4], [5.2, -1.2], [6.4, 0.2], [5.2, 1.8], [1.4, 3.0]], // 反物质：弹舱撑宽的翼尖
  Q: [[1.4, -3.0], [6.4, 0.6], [6.4, 1.6], [4.8, 1.2], [3.6, 2.2], [1.4, 2.8]], // 量子：分叉的后缘
  // ——— 秘密机翼：双折角箭形 ———
  SS: [[1.4, -3.2], [6.4, 0.2], [6.4, 1.2], [4.6, 0.6], [3.4, 2.6], [1.4, 2.8]],
};

export const WING_SHAPES = Object.keys(WING_OUTLINES);

/** 每一型属于哪一族。形状虽然一型一条，但「为什么长这样」仍要能和机制对上。 */
export const WING_FAMILY = {
  C: 'delta', W: 'fan', M: 'straight', V: 'swept', N: 'swept', F: 'swept', S: 'fan',
  A: 'twin', T: 'twin', H: 'ring', O: 'ring', E: 'ring', K: 'pylon', D: 'pylon',
  J: 'needle', G: 'needle', L: 'needle', Z: 'delta', X: 'delta', Q: 'delta', SS: 'twin',
};

/**
 * 翼尖装置：一型一件，装上之后**轮廓之外又多一层只属于这一型的识别点**。
 *
 * 为什么放在翼尖：斜俯视下翼面是一块扁板，翼尖是轮廓上最容易被眼睛抓住的地方，
 * 在那儿立一片小翼、吊一只舱、接一根撞角，缩到手机上也能分出「这是另一副翼」。
 *
 * `none` 也是设计：排炮、破地、对地三型的机翼本来就靠翼型和挂架说话，再加零件反而乱。
 * 所有装置都钉在 |x| ≤ 6.45 之内——判定翼展 12.8 不能因为好看就被画宽。
 */
export const WING_TRIM = {
  C: { tip: 'winglet' }, // 加农：翼尖小翼
  W: { tip: 'blade' }, // 宽幅：翼尖刀片
  M: { tip: 'none' }, // 排炮：干净，翼型自己够
  V: { tip: 'canard' }, // 防卫：翼根鸭翼，贴脸作战
  S: { tip: 'pod' }, // 三向：翼尖传感器吊舱
  A: { tip: 'fin' }, // 前后：后缘立尾
  H: { tip: 'pod' }, // 铁球：吊舱兼球座
  O: { tip: 'none' }, // 护环：翼面只是环的支架
  E: { tip: 'fin' }, // 远环：立尾配长环
  N: { tip: 'canard' }, // 霰弹：两片前掠鸭翼
  K: { tip: 'none' }, // 破地：炸弹就是它的零件
  D: { tip: 'none' }, // 对地：同上
  T: { tip: 'fin' }, // 交叉：折角翼配立尾
  J: { tip: 'spike' }, // 穿甲：翼根撞角，指向前方
  F: { tip: 'canard', strake: true }, // 火焰：鸭翼 + 边条
  G: { tip: 'spike' }, // 引力井：撞角兼发射导轨
  Z: { tip: 'pod' }, // 链弧：翼尖线圈舱
  L: { tip: 'spike', strake: true }, // 激光：撞角 + 边条，一条直线
  X: { tip: 'pod' }, // 反物质：翼尖弹舱
  Q: { tip: 'fin' }, // 量子：立尾像一面镜
  SS: { tip: 'winglet', strake: true }, // 秘密：全套
};

/** 这一型的翼尖装置。未知型号给一件「什么都没有」，渲染层不用判空。 */
export const wingTrim = (spec = {}) => WING_TRIM[spec.code] ?? { tip: 'none' };


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
 * 族名只是文档与测试用的说法——**轮廓是一型一条**，不再由族名查表得到
 * （那正是上一版「好几种翼共用一条轮廓」的根源）。
 * wingIcon.test.js 用族名反过来验「这条轮廓配不配得上它的火力」：
 * 环族必须真带铁球、挂架族必须真挂炸弹、贴脸族真的射不远。
 */

/** 右半片翼面的轮廓点（场地格）。翼弦倍率只拉纵深，不动翼展。 */
export function wingProfile(spec) {
  const chord = wingChord(spec);
  const outline = WING_OUTLINES[spec.code] ?? WING_OUTLINES.C;
  return outline.map(([x, z]) => [x, z * chord]);
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

  // 翼尖／翼根装置：和三维里那一件是同一份数据（wingTrim），俯视图里化成短线与小圆。
  // 有了它，卡片的差别不只是「轮廓略有不同」，而是「翼尖上多了一样东西」。
  const trim = wingTrim(spec);
  const fins = [];
  const pods = [];
  const tipFrontY = py(profile[1][1]);
  const tipRearY = py(profile[2][1]);
  for (const side of [-1, 1]) {
    if (trim.strake) {
      fins.push({ x1: px(1.75, side), y1: py(nose) + 2, x2: px(1.75, side), y2: py(tail) - 1.5, w: 1.3, kind: 'strake' });
    }
    if (trim.tip === 'winglet') {
      // 立起来的翼尖小翼，俯视看是一道贴着翼弦的短线。
      fins.push({ x1: px(6.0, side), y1: tipFrontY + 0.5, x2: px(6.0, side), y2: tipRearY - 0.5, w: 1.8, kind: 'winglet' });
    } else if (trim.tip === 'blade') {
      fins.push({ x1: px(5.2, side), y1: tipFrontY + 3, x2: px(6.35, side), y2: tipFrontY - 1, w: 2.0, kind: 'blade' });
    } else if (trim.tip === 'canard') {
      // 鸭翼朝前下方掠出去。前掠翼的机头本来就顶着画框上沿（霰弹最狠），
      // 所以它更多是「向外侧扫」而不是「往前顶」，不然卡片上会被裁掉。
      fins.push({
        x1: px(2.2, side),
        y1: py(nose) + 1.5,
        x2: px(4.0, side),
        y2: Math.max(1.6, py(nose) - 1.5),
        w: 1.8,
        kind: 'canard',
      });
    } else if (trim.tip === 'fin') {
      fins.push({ x1: px(5.4, side), y1: py(tail) - 1, x2: px(5.0, side), y2: py(tail) - 7, w: 1.6, kind: 'fin' });
    } else if (trim.tip === 'spike') {
      // 撞角朝前；针翼的机头本来就顶着画框，所以末端要收住，不能被卡片裁掉。
      fins.push({ x1: px(1.95, side), y1: py(nose) - 1, x2: px(1.95, side), y2: Math.max(1, py(nose) - 5), w: 1.2, kind: 'spike' });
    } else if (trim.tip === 'pod') {
      pods.push({ x: px(6.0, side), y: (tipFrontY + tipRearY) / 2, r: 2.2 });
    }
  }

  return {
    code: spec.code ?? code,
    family: WING_FAMILY[spec.code] ?? 'delta',
    trim,
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
    fins,
    pods,
    ring,
    parts,
  };
}
