// 地形、建筑目录、关卡与评分的唯一真源。
// 建筑用字符串 id，格子里只存 id：这样存档、测试和渲染层说的是同一套名字。
export const TERRAIN_GRASS = 0;
export const TERRAIN_FOREST = 1;
export const TERRAIN_WATER = 2;

export const EMPTY = '';
export const ROAD = 'road';

// 四邻：道路连通、服务判定都只走这四个方向，斜角不算接壤。
export const NEIGHBOURS = [
  { dc: 0, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
];

const define = (id, spec) => ({
  id,
  homes: 0,
  jobs: 0,
  power: 0,
  supply: 0,
  appeal: 0,
  radius: 0,
  needsRoad: true,
  isRoad: false,
  ...spec,
});

// 一栏建筑就是一条经济链：住宅出人，商铺工厂出岗位，电厂供电，公园补环境分。
// 数值定得让「先修路 → 住宅商铺配对 → 补电 → 补公园」这条顺序自然浮现。
export const BUILDINGS = {
  road: define('road', {
    name: '道路', hint: '连回城门才算通车', cost: 8, upkeep: 0, isRoad: true, needsRoad: false,
  }),
  house: define('house', {
    name: '住宅', hint: '每栋容纳 12 人', cost: 40, upkeep: 2, homes: 12, power: 2,
  }),
  shop: define('shop', {
    name: '商铺', hint: '8 个岗位，略微提升环境', cost: 60, upkeep: 3, jobs: 8, power: 3, appeal: 1, radius: 2,
  }),
  factory: define('factory', {
    name: '工厂', hint: '20 个岗位，但污染周边', cost: 90, upkeep: 5, jobs: 20, power: 6, appeal: -5, radius: 3,
  }),
  power: define('power', {
    name: '电厂', hint: '供电 36，噪音很大', cost: 120, upkeep: 8, supply: 36, appeal: -7, radius: 3,
  }),
  park: define('park', {
    name: '公园', hint: '环境 +6，不用接路', cost: 30, upkeep: 2, appeal: 6, radius: 3, needsRoad: false,
  }),
};

// 工具栏顺序＝解锁顺序，也是新手该按的顺序。
export const BUILD_ORDER = ['road', 'house', 'shop', 'factory', 'power', 'park'];
export const TOOL_BULLDOZE = 'bulldoze';

export const buildingOf = (id) => BUILDINGS[id] ?? null;

// 林地要先清出场地，水面永远不能盖。
export const CLEAR_FOREST_COST = 10;
export const DEMOLISH_COST = 4;

export const terrainCost = (terrain) => (terrain === TERRAIN_FOREST ? CLEAR_FOREST_COST : 0);
export const isBuildable = (terrain) => terrain !== TERRAIN_WATER;

// 环境分：底子 52，靠公园和林地往上抬，工厂电厂往下压，最后夹在 0..100。
export const BASE_APPEAL = 52;
export const FOREST_APPEAL = 1;
export const FOREST_APPEAL_CAP = 6;
export const WATER_APPEAL = 2;
export const WATER_APPEAL_CAP = 6;
export const NATURE_RADIUS = 2;

// 一个岗位养 2.2 个居民：岗位和住宅任一短缺都会卡住人口。
export const WORKERS_PER_JOB = 2.2;
export const TAX_PER_CITIZEN = 0.9;
// 环境分低于这条线，居民开始搬走。
export const APPEAL_FLOOR = 40;
export const GROWTH_RATE = 0.2;
export const DECLINE_RATE = 0.25;
// 连续赤字到这个月数就破产，给玩家留出补救窗口。
export const BANKRUPT_MONTHS = 4;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// 六关递进：先跑通路网和住宅，再引入供电缺口、污染治理，最后是大盘调度。
export const LEVELS = [
  { name: '落基镇', cols: 12, rows: 12, water: 0.04, forest: 0.1, target: 60, budget: 520, par: 20 },
  { name: '双溪口', cols: 14, rows: 12, water: 0.08, forest: 0.14, target: 120, budget: 520, par: 26 },
  { name: '工坊区', cols: 14, rows: 14, water: 0.08, forest: 0.16, target: 200, budget: 620, par: 32 },
  { name: '绿荫台', cols: 16, rows: 14, water: 0.12, forest: 0.2, target: 300, budget: 700, par: 38 },
  { name: '临港城', cols: 16, rows: 16, water: 0.16, forest: 0.16, target: 420, budget: 780, par: 44 },
  { name: '天际都', cols: 18, rows: 16, water: 0.12, forest: 0.18, target: 600, budget: 880, par: 52 },
];

export const LEVEL_COUNT = LEVELS.length;
export const levelRecipe = (index) => LEVELS[clamp(index, 0, LEVEL_COUNT - 1)];

// 三星要求在 par 之内达标，二星允许多花一半，剩下都算一星——达标本身不该被判失败。
export const starsFor = (months, par) => {
  if (months <= par) return 3;
  if (months <= par + Math.ceil(par / 2)) return 2;
  return 1;
};

// 一个月的真实秒数，speed 是它的倍率。
export const MONTH_SECONDS = 2.4;
export const SPEEDS = [0, 1, 2];

// 世界尺寸：一格 1 单位，楼体比格子略小，缝隙让街区看得出边界。
export const TILE_SPAN = 1;
export const TILE_GAP = 0.08;
