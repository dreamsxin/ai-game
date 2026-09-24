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
