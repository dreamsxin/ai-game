import { KINDS } from './tiles.js';

// 五关递进：先放宽目标熟悉手感，再靠增加果实种类压低连锁频率来提升难度。
export const LEVELS = [
  {
    id: 1,
    name: '果园初摘',
    kinds: 5,
    moves: 20,
    target: 6000,
    stars: [6000, 9000, 12000],
    tip: '相邻两颗换位，三颗同色就消。',
  },
  {
    id: 2,
    name: '蜜瓜小径',
    kinds: 5,
    moves: 22,
    target: 9000,
    stars: [9000, 12000, 16000],
    tip: '四连能换来一颗直线爆果，整行整列一起收。',
  },
  {
    id: 3,
    name: '莓果集市',
    kinds: 5,
    moves: 24,
    target: 13000,
    stars: [13000, 17000, 22000],
    tip: 'L 形和 T 形消除留下爆破果，炸掉周围九格。',
  },
  {
    id: 4,
    name: '橙风长廊',
    kinds: 6,
    moves: 28,
    target: 14000,
    stars: [14000, 18000, 23000],
    tip: '多了一种果实，连锁没那么好凑，五连出的彩虹果更值钱。',
  },
  {
    id: 5,
    name: '甜果之巅',
    kinds: 6,
    moves: 32,
    target: 18000,
    stars: [18000, 24000, 30000],
    tip: '连锁越长倍率越高，先制造下落再收特殊果实。',
  },
];

export const levelCount = LEVELS.length;

export const levelAt = (index) => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))];

export const levelKinds = (level) => KINDS.slice(0, Math.min(KINDS.length, level.kinds));

export const hasNextLevel = (index) => index < LEVELS.length - 1;
