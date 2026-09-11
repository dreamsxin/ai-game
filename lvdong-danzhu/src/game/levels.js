import { paletteOf } from './marbles.js';

// 六关递进：球越来越快，颜色变多让同色三连更难凑，弹珠墙也下压得更勤。
// waves 是这一关还会挤进来多少行弹珠，全部清空才算过关。
// startRows + waves 必须小于 GRID_ROWS，否则光靠堆积就会越线，关卡直接成死关。
export const LEVELS = [
  {
    id: 1,
    name: '初拍热场',
    colors: 3,
    bpm: 90,
    startRows: 3,
    waves: 2,
    descendBeats: 14,
    speed: 13,
    target: 2100,
    stars: [2100, 3200, 4400],
    tip: '同色撞同色，连成三颗以上整组消，球会直接穿过去。',
  },
  {
    id: 2,
    name: '霓光副歌',
    colors: 3,
    bpm: 100,
    startRows: 3,
    waves: 3,
    descendBeats: 13,
    speed: 14,
    target: 2700,
    stars: [2700, 4000, 5500],
    tip: '踩着拍子接球攒律动倍率，最高两倍。',
  },
  {
    id: 3,
    name: '碎拍回响',
    colors: 4,
    bpm: 108,
    startRows: 4,
    waves: 3,
    descendBeats: 12,
    speed: 15,
    target: 3200,
    stars: [3200, 4700, 6400],
    tip: '消掉支撑点，上面挂不住的弹珠会整片掉下来。',
  },
  {
    id: 4,
    name: '双色跃动',
    colors: 4,
    bpm: 116,
    startRows: 4,
    waves: 4,
    descendBeats: 11,
    speed: 16,
    target: 3700,
    stars: [3700, 5400, 7300],
    tip: '异色撞两下也能砸碎，用来给同色组开路。',
  },
  {
    id: 5,
    name: '高速切分',
    colors: 5,
    bpm: 124,
    startRows: 4,
    waves: 4,
    descendBeats: 10,
    speed: 17,
    target: 3800,
    stars: [3800, 5600, 7600],
    tip: '一趟飞行里连消越多次，连消倍率越高。',
  },
  {
    id: 6,
    name: '终章律动',
    colors: 5,
    bpm: 132,
    startRows: 5,
    waves: 5,
    descendBeats: 9,
    speed: 18,
    target: 4700,
    stars: [4700, 6800, 9200],
    tip: '先在底部凿出缺口，再让球钻进墙里连锁。',
  },
];

export const levelCount = LEVELS.length;

export const levelAt = (index) => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, index))];

export const levelColors = (level) => paletteOf(level.colors);

export const hasNextLevel = (index) => index < LEVELS.length - 1;
