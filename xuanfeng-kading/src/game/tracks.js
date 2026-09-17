// 关卡表。八条赛道只有四个旋钮：**弯道密度、路面宽度、圈数、对手档位**，
// 名次门槛跟着往上收（前三 → 前二 → 冠军）。
//
// 弯道密度是这里最要紧的一个，因为它决定了这一关能攒出多少氮气：
// 谐波阶数 k 越高、振幅越大，弯就越密越紧——氮气变多，但每个弯都更容易漂飞。
// 所以后面几关不是「对手变强了」这么单薄，而是整条赛道的氮气收支都换了一副样子。
//
// 时限不手写，按赛道长度反推（见 buildLevel）：改宽改弯之后不用回来对时间。

import { buildCourse } from './course.js';

export const LEVELS = [
  {
    key: 'huhui',
    name: '环湖热身',
    tint: '#3ba7ff',
    radius: 92,
    harmonics: [{ k: 3, amp: 0.055 }],
    width: 30,
    laps: 2,
    rivals: 3,
    rivalSkill: 0.3,
    qualify: 3,
  },
  {
    key: 'shuangzi',
    name: '双子弯',
    tint: '#4de0c0',
    radius: 90,
    harmonics: [{ k: 4, amp: 0.06 }, { k: 2, amp: 0.05, phase: 1.1 }],
    width: 29,
    laps: 2,
    rivals: 3,
    rivalSkill: 0.4,
    qualify: 3,
  },
  {
    key: 'gangqu',
    name: '港区夜巡',
    tint: '#ffb64d',
    radius: 88,
    harmonics: [{ k: 4, amp: 0.075 }, { k: 3, amp: 0.04, phase: 0.6 }],
    width: 28,
    laps: 2,
    rivals: 4,
    rivalSkill: 0.48,
    qualify: 3,
  },
  {
    key: 'shandao',
    name: '山道回环',
    tint: '#8be04d',
    radius: 86,
    harmonics: [{ k: 5, amp: 0.075 }, { k: 2, amp: 0.05, phase: 2.2 }],
    width: 27,
    laps: 3,
    rivals: 4,
    rivalSkill: 0.56,
    qualify: 2,
  },
  {
    key: 'xiagu',
    name: '峡谷连喷',
    tint: '#ff8a5c',
    radius: 84,
    harmonics: [{ k: 5, amp: 0.09 }, { k: 3, amp: 0.045, phase: 1.7 }],
    width: 26,
    laps: 3,
    rivals: 4,
    rivalSkill: 0.64,
    qualify: 2,
  },
  {
    key: 'nihong',
    name: '霓虹八字',
    tint: '#c77bff',
    radius: 82,
    harmonics: [{ k: 6, amp: 0.085 }, { k: 3, amp: 0.055, phase: 0.4 }],
    width: 25,
    laps: 3,
    rivals: 5,
    rivalSkill: 0.68,
    qualify: 2,
  },
  {
    key: 'chilun',
    name: '齿轮工厂',
    tint: '#ff6f91',
    radius: 80,
    harmonics: [{ k: 6, amp: 0.1 }, { k: 4, amp: 0.05, phase: 2.6 }],
    width: 24,
    laps: 3,
    rivals: 5,
    rivalSkill: 0.74,
    qualify: 1,
  },
  {
    key: 'xuanfeng',
    name: '旋风终盘',
    tint: '#ffd447',
    radius: 78,
    harmonics: [{ k: 7, amp: 0.095 }, { k: 3, amp: 0.06, phase: 1.3 }, { k: 11, amp: 0.012 }],
    width: 24,
    laps: 3,
    rivals: 5,
    rivalSkill: 0.78,
    qualify: 1,
  },
];

export const LEVEL_COUNT = LEVELS.length;

/** 对手名册。名字和颜色固定，所以「上一关那个黄车」在下一关还是同一个人。 */
export const RIVALS = [
  { name: '老K', color: '#ff6b6b' },
  { name: '阿甘', color: '#ffd447' },
  { name: '苏打', color: '#4de0c0' },
  { name: '电风扇', color: '#c77bff' },
  { name: '铁蛋', color: '#ff9f4d' },
];

export const PLAYER_COLOR = '#5ad1ff';

// 赛道几何一关只算一次。谐波密采 4096 点不算贵，但每次重开都算一遍就是白扔。
const cache = new Map();

export function levelCourse(index) {
  const level = LEVELS[index];
  if (!cache.has(level.key)) cache.set(level.key, buildCourse(level));
  return cache.get(level.key);
}

/**
 * 关卡的完整参数。时限按「全程平均 15 m/s」反推再加 12 秒余量——
 * 15 m/s 远低于抓地上限，所以时限惩罚的是一路冲进草地，而不是慢了一点。
 */
export function buildLevel(index) {
  const level = LEVELS[index];
  const course = levelCourse(index);
  return {
    ...level,
    index,
    course,
    time: Math.round((course.length * level.laps) / 15 + 12),
  };
}

/** 名次换星星：冠军三星，亚军两星，只要达标就至少一星。 */
export const starsFor = (rank) => (rank === 1 ? 3 : rank === 2 ? 2 : 1);
