// 千年江山图——矿物色谱。取自《千里江山图》的青绿山水体系，纯常量 + 纯函数。
//
// 最要紧的一条（丽水山水图那张图上验过）：**天不是蓝的**。
// 画里的「天」就是绢本身，所以天空、雾、留白全都用绢色系；
// 一旦把天画成蓝的，配色再对也只是一张彩色地形图，不是那张画。
//
// 色带按「高度」走：谷底绢黄赭石 → 山腰石绿 → 峰顶石青。
// 这是整张卷子唯一的颜色逻辑，所有山峦共用它，朝代自己的 tint 只用在题签印章上。

export const SILK = '#e6d6a8';        // 绢底
export const SILK_DEEP = '#d9c48c';   // 绢底压深，用于卷边与阴影
export const SILK_PALE = '#f0e4c2';   // 绢底提亮，用于云雾与留白
export const OCHRE = '#b0743c';       // 赭石，山脚与坡土
export const OCHRE_PALE = '#c89a62';  // 淡赭
export const MALACHITE = '#6d9c66';   // 石绿，山腰
export const MALACHITE_DEEP = '#4f7d55';
export const AZURITE = '#2f6f9e';     // 石青，峰顶
export const AZURITE_DEEP = '#1f4f78';
export const CINNABAR = '#b93b2b';    // 朱砂，印章与事件标记
export const GAMBOGE = '#d8a73e';     // 藤黄，书籍标记
export const INK = '#2b2620';         // 墨
export const INK_SOFT = '#5b5244';

/** 三类条目各自的标记色：事件朱砂、人物石青、书籍藤黄。 */
export const KIND_COLOR = {
  event: CINNABAR,
  figure: AZURITE_DEEP,
  book: '#8a6a22',
};

/** 三类条目的中文名，面板与筛选条共用。 */
export const KIND_NAME = {
  event: '事件',
  figure: '人物',
  book: '典籍',
};

function hex(value) {
  const n = value.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function toHex([r, g, b]) {
  const part = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** 两色之间线性插值，t 会被夹到 0..1。 */
export function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const ca = hex(a);
  const cb = hex(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k]);
}

/**
 * 高度色带：h 为 0..1 的相对高度。
 * 0 是谷底（赭石偏绢），0.4 左右已经是石绿，0.66 以上开始转石青。
 *
 * 档位按**这张卷子的平均峰高**（power 多在 0.5—0.8）标定，不是按 0—1 均分：
 * 丽水那张图上试过，色带标高了整张画就是一片赭黄，石青永远出不来。
 */
export function ridgeColor(h) {
  const k = Math.max(0, Math.min(1, h));
  if (k < 0.18) return mix(OCHRE_PALE, OCHRE, k / 0.18);
  if (k < 0.42) return mix(OCHRE, MALACHITE, (k - 0.18) / 0.24);
  if (k < 0.66) return mix(MALACHITE, MALACHITE_DEEP, (k - 0.42) / 0.24);
  return mix(MALACHITE_DEEP, AZURITE, (k - 0.66) / 0.34);
}

/**
 * 远近层的空气透视：depth 0 是最近的一层，1 是最远的一层。
 * 远山不是变灰而是**淡入绢底**——留白就是这么来的。
 */
export function hazed(color, depth) {
  return mix(color, SILK_PALE, Math.max(0, Math.min(1, depth)) * 0.82);
}
