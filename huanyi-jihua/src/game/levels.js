// 关卡数据。16 关分 4 章，每章 4 关，结构照街机原作那条线走：
// 穿越障碍区 → 打掉运载火箭换机翼 → 迎战 Boss。
//
// 三条来自原作的规则在这里落成数据：
// 1. 只有每章第一关（第 1、5、9、13 关）能在开打前挑机翼，中途换翼只能靠打掉运载火箭。
// 2. 第 4n+2 关（第 2、6、10、14 关）有跳关门，跳过去省 4 关，但 Boss 一点没削弱。
// 3. Boss 血量不是手调的，是「推荐机翼的有效 DPS × 目标时长」反推出来的（见 bossHp）。

import { LAB_CHAPTER, WEAKNESS, codesFor, effectiveDps, recommendedWing } from './wings.js';

const wave = (at, kind, count, opts = {}) => ({ at, kind, count, ...opts });

/**
 * Boss 血量：拿对机翼要打 ttk 秒。拿错了倍率只剩 chip，时间自然翻几倍——
 * 「选错机翼会变成漫长的消耗」这句话由这个算式保证，不靠手填数字。
 *
 * 两个折扣都是实测量出来的，不是拍的：
 * - HIT_RATE 按弱点分。侧面弱点最苛刻：只有那两发横射算数，还得贴到和 Boss 齐平的高度。
 * - PATTERN_HIT 按走位分。跑得越快的 Boss 越难命中，蜈蚣那条线尤其。
 * playthrough.test.js 守着实测时长落在 ttk 附近，这两张表跑偏了测试就会红。
 */
const HIT_RATE = { core: 0.45, side: 0.21, low: 0.45, swarm: 0.45 };
const PATTERN_HIT = { sweep: 1, twin: 1, ring: 1, fortress: 1, centipede: 0.5, fortressCore: 0.8 };

const bossHp = (weak, ttk, pattern) =>
  Math.round(effectiveDps(recommendedWing(weak), weak) * ttk * HIT_RATE[weak] * PATTERN_HIT[pattern]);

const boss = (name, weak, ttk, pattern) => ({ name, weak, ttk, pattern, hp: bossHp(weak, ttk, pattern) });

export const CHAPTERS = [
  { key: 'I', name: '要塞外围', sky: '#0b1430', deep: '#1b2f6b', star: '#8fb8ff' },
  { key: 'II', name: '机翼追索', sky: '#161029', deep: '#4a2360', star: '#e6a6ff' },
  { key: 'III', name: '生体舰队', sky: '#0d1f1c', deep: '#1d5c4a', star: '#8affd0' },
  { key: 'IV', name: '葛布纳斯', sky: '#220d13', deep: '#7a1f2c', star: '#ffb08a' },
];

export const LEVELS = [
  {
    key: '01',
    name: '试作返航',
    chapter: 0,
    select: true,
    wingDrops: ['C'],
    waves: [
      wave(1.5, 'zako', 5, { from: 'top', spread: 34 }),
      wave(6, 'zako', 5, { from: 'top', spread: 52 }),
      wave(11, 'carrier', 1, { wing: 'C' }),
      wave(16, 'diver', 4),
    ],
    boss: boss('掠夺者前哨', 'swarm', 12, 'sweep'),
  },
  {
    key: '02',
    name: '弃翼训练',
    chapter: 0,
    skip: true,
    wingDrops: ['S'],
    waves: [
      wave(1.5, 'wall', 3),
      wave(7, 'zako', 6, { from: 'top', spread: 60 }),
      wave(12, 'carrier', 1, { wing: 'S' }),
      wave(17, 'turret', 2),
    ],
    boss: boss('双联炮座', 'side', 13, 'twin'),
  },
  {
    key: '03',
    name: '装甲回廊',
    chapter: 0,
    wingDrops: ['J'],
    waves: [
      wave(1.5, 'wall', 4),
      wave(8, 'carrier', 1, { wing: 'J' }),
      wave(13, 'turret', 3),
      wave(18, 'zako', 6, { from: 'side', spread: 40 }),
    ],
    boss: boss('铠核', 'core', 14, 'ring'),
  },
  {
    key: '04',
    name: '低空防线',
    chapter: 0,
    wingDrops: ['D'],
    waves: [
      wave(1.5, 'ground', 4),
      wave(7, 'carrier', 1, { wing: 'D' }),
      wave(12, 'ground', 5),
      wave(18, 'diver', 5),
    ],
    boss: boss('地表堡垒', 'low', 14, 'fortress'),
  },
  {
    key: '05',
    name: '夺回第一枚机翼',
    chapter: 1,
    select: true,
    wingDrops: ['J', 'C'],
    waves: [
      wave(1.5, 'zako', 7, { from: 'top', spread: 58 }),
      wave(7, 'wall', 4),
      wave(12, 'carrier', 2, { wing: 'J' }),
      wave(18, 'turret', 3),
    ],
    boss: boss('壳甲运输舰', 'core', 15, 'ring'),
  },
  {
    key: '06',
    name: '运载火箭群',
    chapter: 1,
    skip: true,
    wingDrops: ['W', 'M'],
    waves: [
      wave(1.5, 'carrier', 2, { wing: 'W' }),
      wave(8, 'zako', 8, { from: 'top', spread: 66 }),
      wave(14, 'carrier', 2, { wing: 'M' }),
      wave(19, 'diver', 6),
    ],
    boss: boss('母体虫群', 'swarm', 15, 'sweep'),
  },
  {
    key: '07',
    name: '侧舷炮阵',
    chapter: 1,
    wingDrops: ['S', 'W'],
    waves: [
      wave(1.5, 'turret', 3),
      wave(8, 'carrier', 1, { wing: 'S' }),
      wave(13, 'wall', 5),
      wave(19, 'turret', 4),
    ],
    boss: boss('侧舷要塞', 'side', 16, 'twin'),
  },
  {
    key: '08',
    name: '沙海地垒',
    chapter: 1,
    wingDrops: ['D', 'F'],
    waves: [
      wave(1.5, 'ground', 5),
      wave(7, 'carrier', 1, { wing: 'D' }),
      wave(13, 'ground', 6),
      wave(19, 'zako', 7, { from: 'side', spread: 44 }),
    ],
    boss: boss('沙下巨炮', 'low', 16, 'fortress'),
  },
  {
    key: '09',
    name: '机器蜈蚣',
    chapter: 2,
    select: true,
    wingDrops: ['C', 'G', 'V'],
    waves: [
      wave(1.5, 'diver', 6),
      wave(7, 'zako', 9, { from: 'top', spread: 70 }),
      wave(10, 'carrier', 1, { wing: 'G' }),
      wave(13, 'carrier', 2, { wing: 'V' }),
      wave(18, 'diver', 7),
    ],
    boss: boss('机器蜈蚣', 'swarm', 17, 'centipede'),
  },
  {
    key: '10',
    name: '壳中之核',
    chapter: 2,
    skip: true,
    wingDrops: ['J', 'X', 'H'],
    waves: [
      wave(1.5, 'wall', 5),
      wave(8, 'carrier', 1, { wing: 'J' }),
      wave(13, 'turret', 4),
      wave(16, 'carrier', 1, { wing: 'X' }),
      wave(19, 'wall', 6),
    ],
    boss: boss('双层壳核', 'core', 17, 'ring'),
  },
  {
    key: '11',
    name: '三面夹击',
    chapter: 2,
    wingDrops: ['S', 'Q', 'A'],
    waves: [
      wave(1.5, 'zako', 8, { from: 'side', spread: 50 }),
      wave(7, 'carrier', 1, { wing: 'S' }),
      wave(10, 'carrier', 1, { wing: 'Q' }),
      wave(13, 'turret', 5),
      wave(19, 'diver', 7),
    ],
    boss: boss('三向母舰', 'side', 18, 'twin'),
  },
  {
    key: '12',
    name: '贴地推进',
    chapter: 2,
    wingDrops: ['D', 'Z', 'C'],
    waves: [
      wave(1.5, 'ground', 6),
      wave(7, 'carrier', 1, { wing: 'D' }),
      wave(13, 'ground', 7),
      wave(16, 'carrier', 1, { wing: 'Z' }),
      wave(19, 'turret', 4),
    ],
    boss: boss('履带巨兽', 'low', 18, 'fortress'),
  },
  {
    key: '13',
    name: '葛布纳斯外壁',
    chapter: 3,
    select: true,
    wingDrops: ['J', 'L', 'C'],
    waves: [
      wave(1.5, 'wall', 6),
      wave(8, 'turret', 5),
      wave(11, 'carrier', 1, { wing: 'L' }),
      wave(14, 'carrier', 2, { wing: 'J' }),
      wave(20, 'zako', 10, { from: 'top', spread: 74 }),
    ],
    boss: boss('外壁守核', 'core', 19, 'ring'),
  },
  {
    key: '14',
    name: '机翼库',
    chapter: 3,
    skip: true,
    wingDrops: ['H', 'G', 'F', 'SS'],
    waves: [
      wave(1.5, 'carrier', 3, { wing: 'H' }),
      wave(9, 'zako', 10, { from: 'top', spread: 78 }),
      wave(12, 'carrier', 1, { wing: 'G' }),
      wave(15, 'carrier', 2, { wing: 'SS' }),
      wave(20, 'diver', 8),
    ],
    boss: boss('库房主脑', 'swarm', 19, 'sweep'),
  },
  {
    key: '15',
    name: '双子炮座',
    chapter: 3,
    wingDrops: ['S', 'Q', 'W'],
    waves: [
      wave(1.5, 'turret', 5),
      wave(8, 'carrier', 1, { wing: 'S' }),
      wave(11, 'carrier', 1, { wing: 'Q' }),
      wave(14, 'wall', 7),
      wave(20, 'turret', 6),
    ],
    boss: boss('双子炮座', 'side', 20, 'twin'),
  },
  {
    key: '16',
    name: '移动堡垒',
    chapter: 3,
    wingDrops: ['J', 'X', 'SS'],
    waves: [
      wave(1.5, 'wall', 7),
      wave(8, 'turret', 6),
      wave(11, 'carrier', 1, { wing: 'X' }),
      wave(14, 'carrier', 2, { wing: 'J' }),
      wave(20, 'diver', 9),
    ],
    boss: boss('葛布纳斯移动堡垒', 'core', 22, 'fortressCore'),
  },
];

export const levelCount = LEVELS.length;

export const levelAt = (index) => LEVELS[Math.min(Math.max(index, 0), LEVELS.length - 1)];

/** Boss 出场时间：最后一波之后再放 6 秒，让玩家有空捡机翼、也有空后悔。 */
export const bossAt = (level) => Math.max(...level.waves.map((item) => item.at)) + 6;

/** 跳关门跳到哪一关。跳 4 关，越过终点就当没这道门。 */
export const skipTarget = (index) => (LEVELS[index]?.skip ? Math.min(index + 4, LEVELS.length - 1) : index + 1);

/** 关卡情报：Boss 弱点的描述和推荐机翼，选翼界面和 HUD 都读这一份。 */
export const briefing = (index) => {
  const level = levelAt(index);
  const weak = WEAKNESS[level.boss.weak];
  return {
    boss: level.boss.name,
    weak: level.boss.weak,
    label: weak.label,
    hint: weak.hint,
    pick: recommendedWing(level.boss.weak),
    drops: level.wingDrops,
    // 这一关的选单里有哪些机翼。实验机翼从第 3 章起解锁。
    codes: codesFor(level.chapter),
    lab: level.chapter >= LAB_CHAPTER,
  };
};

/** 每章第一关才给选机翼，其余关卡只能带着上一关剩下的翅膀继续飞。 */
export const canSelect = (index) => Boolean(levelAt(index).select);
