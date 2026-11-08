// 配色。四章各一套，色彩是这一版的主张，所以它住在能被测试守住的地方。
//
// 两条规则被 palette.test.js 守着：
// 1. **每章的地形色必须够饱和**：这是「色彩鲜明」的具体含义，不是形容词。
//    灰蓝一片的星野看起来很"高级"，但四章会长得一模一样，玩家读不出自己推进到哪儿了。
// 2. **地形色一律避开敌弹那个红**。敌弹是全局唯一「碰到就掉翼」的东西，
//    它的颜色不能和背景撞——第四章是红色调的葛布纳斯，所以它的亮色走琥珀橙而不是红。

/** 威胁色：跟章节无关，四章一模一样。认颜色比认形状快。 */
export const HAZARD = {
  foe: '#ff2f5e', // 敌弹
  shell: '#ff8a3c', // 重弹（血厚，要几发才打掉）
  shot: '#fff6c8', // 我方常规弹
  pierce: '#6effc4', // 穿甲
  ground: '#ffb02e', // 对地炸弹
  lab: '#c9a6ff', // 实验机翼系
  gold: '#ffd447', // 弱点、道具金边
  cool: '#7fe3ff', // 下潜无敌、跳关门
  warm: '#ff5470', // 掉翼、裸机
};

/** 阶级色：Mk.I / II / III。越往上越暖越亮。 */
export const TIER_COLOR = ['#9fc2ff', '#6effc4', '#ffd447'];

/**
 * 相位过载（满阶后再捡同型号）的专属色：白青。
 * 不能沿用 Mk.III 的暖金，否则玩家分不出「这是满阶」还是「这是限时爆发」。
 */
export const OVERDRIVE_COLOR = '#e6ffff';
/** 相位翼场的结构色：冷白偏蓝，给能量骨架打底，阶级色再叠在上面。 */
export const PHASE_COLOR = '#b9f2ff';

/**
 * 21 型机翼，21 种色。
 *
 * 上一版只按「出身」分三色（常规钢蓝 / 实验紫 / 秘密金），于是常规那 15 种在场上
 * 全是同一片蓝——换了翼只有炮管数变了，玩家第二次报的还是「机翼都一样」。
 * 现在每一型一个色相，色相按「怎么打」排成一圈：暖橙是对地／火焰，黄绿是穿甲，
 * 青绿是护环，天蓝是直射，靛紫是实验系。
 *
 * **一头一尾都要留白**：0° 附近是敌弹的红（#ff2f5e ≈ 344°），绕过去；
 * 330°～18° 这一段不安排任何机翼，否则「自己的翼」和「碰到就掉翼的东西」会撞色。
 * palette.test.js 守着「两两色相差 ≥ 11°」和「谁都别掉进红区」。
 */
export const WING_HUES = {
  F: 18, // 火焰：橙红
  K: 32, // 破地：琥珀
  D: 46, // 对地：金
  SS: 62, // 秘密：金黄
  J: 82, // 穿甲：黄绿
  O: 100, // 护环：草绿
  V: 118, // 防卫：青绿
  N: 138, // 霰弹：松绿
  E: 158, // 远环：湖绿
  W: 176, // 宽幅：青
  S: 192, // 三向：天青
  C: 206, // 加农：冰蓝
  H: 220, // 铁球：钢蓝
  M: 234, // 排炮：靛蓝
  A: 246, // 前后：蓝紫
  T: 260, // 交叉：紫
  L: 272, // 激光：青紫
  G: 284, // 引力井：紫罗兰
  Z: 296, // 链弧：洋红紫
  X: 308, // 反物质：品红
  Q: 320, // 量子：粉紫
};

/** HSL → #rrggbb。色相表在运行时算出十六进制，SVG 与 three 用的是同一个字符串。 */
export function hslHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(((h % 360) + 360) % 360 / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  const hex = (value) =>
    Math.round(Math.min(1, Math.max(0, value + m)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * 一型一身皮。三个位置各司其职，不是同一桶色兑出来的三个亮度：
 * - body：翼面本体的暗色，负责「这是哪一型」的第一眼。
 * - edge：自发光与描边，在暗地面上把翼面从背景里托起来。
 * - lead：前缘灯、翼尖航灯、炮口闪光、护环的亮色——**识别这一型靠的就是它**。
 * - chrome：炮管与翼尖装置这类金属件的浅色，带一点本型的色相，白得不再一片死白。
 */
const skinAt = (hue) => ({
  body: hslHex(hue, 0.52, 0.24),
  edge: hslHex(hue, 0.74, 0.44),
  lead: hslHex(hue, 0.96, 0.67),
  chrome: hslHex(hue, 0.32, 0.86),
});

/** 按型号取皮。未知型号退回常规钢蓝，绝不返回 undefined（渲染层会当场崩）。 */
export const WING_SKINS = Object.fromEntries(
  Object.entries(WING_HUES).map(([code, hue]) => [code, skinAt(hue)]),
);

/**
 * 三条出身的兜底色。现在只给「没有 code 的记录」兜底用——
 * 正常路径一律走 WING_SKINS，那一份才是玩家在场上看到的那身皮。
 */
export const WING_SKIN = {
  plain: { body: '#22326b', edge: '#2b47b5', lead: '#7fe3ff', chrome: '#dfe9ff' },
  lab: { body: '#3a2a7a', edge: '#6f4ad0', lead: HAZARD.lab, chrome: '#efe6ff' },
  secret: { body: '#6a5216', edge: '#c79a1e', lead: HAZARD.gold, chrome: '#fff4cf' },
};

/** 这只机翼该穿哪身皮。参数是 wings.js 里那条记录。 */
export const wingSkin = (spec = {}) =>
  WING_SKINS[spec.code] ?? (spec.secret ? WING_SKIN.secret : spec.lab ? WING_SKIN.lab : WING_SKIN.plain);

export const CHAPTER_ART = [
  {
    key: 'I',
    name: '要塞外围',
    zenith: '#050a24',
    sky: '#1636a8',
    ground: '#0b1c4a',
    grid: '#39a8ff',
    ridge: '#2a5fd0',
    accent: '#00e5ff',
    star: '#bfe0ff',
    fog: '#0a1640',
  },
  {
    key: 'II',
    name: '机翼追索',
    zenith: '#120428',
    sky: '#6a1ba8',
    ground: '#22093f',
    grid: '#d454ff',
    ridge: '#8a2be2',
    accent: '#ff5ce1',
    star: '#f0c2ff',
    fog: '#1c0838',
  },
  {
    key: 'III',
    name: '生体舰队',
    zenith: '#03231c',
    sky: '#0d8f68',
    ground: '#06342a',
    grid: '#2bffb0',
    ridge: '#12a87a',
    accent: '#9dff3c',
    star: '#c4ffe8',
    fog: '#042a22',
  },
  {
    key: 'IV',
    name: '葛布纳斯',
    zenith: '#240604',
    sky: '#b03a0c',
    ground: '#3a0d08',
    grid: '#ffa22b',
    ridge: '#d8541a',
    accent: '#ffd23c',
    star: '#ffd9b0',
    fog: '#2e0a06',
  },
];

export const chapterArt = (index) => CHAPTER_ART[Math.min(Math.max(index | 0, 0), CHAPTER_ART.length - 1)];

/** 十六进制转 HSL。测试靠它断言饱和度和色相距离，运行时不用。 */
export function hsl(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: light };
  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: sat, l: light };
}

/** 两个色相隔多远（0—180）。用来断言「四章看得出区别」和「别撞上敌弹的红」。 */
export const hueGap = (a, b) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};
