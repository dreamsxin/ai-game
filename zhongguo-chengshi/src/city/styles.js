// 五座城市的「配方表」。这一层只有数据：色板、地形、路网、天际线、特色构筑物。
// 切换风格之所以能一眼认出来，靠的是这里每一栏都拉开差距，而不是只换个颜色。

/** 建筑形态。渲染层按 kind 造完全不同的体块，所以权重表决定了城市的「长相」。 */
export const KINDS = {
  glassTower: 'glassTower', // 玻璃幕墙塔楼
  podiumTower: 'podiumTower', // 裙楼 + 塔楼
  slab: 'slab', // 板式高层住宅
  tile: 'tile', // 瓷砖外墙老楼
  stilt: 'stilt', // 吊脚楼 / 依山踏步楼
  courtyard: 'courtyard', // 合院
  hall: 'hall', // 大屋顶殿宇
  pagoda: 'pagoda', // 楼阁塔
  waterHouse: 'waterHouse', // 白墙黑瓦水乡民居
  factory: 'factory', // 厂房 / 园区
  crown: 'crown', // 带冠顶的超高层
};

const rgb = (hex) => hex;

export const STYLES = [
  {
    id: 'chongqing',
    name: '重庆 8D 魔幻',
    subtitle: 'Chongqing · 立体山城',
    tagline: '层叠立交、轻轨穿楼、依山而建的高差感',
    cityName: '雾都',
    palette: {
      skyTop: rgb(0x59677d),
      skyBottom: rgb(0xa8b4c4),
      fog: rgb(0x8996a8),
      fogDensity: 1.55,
      ground: rgb(0x4d5348),
      rock: rgb(0x6b6a63),
      road: rgb(0x565a63),
      roadElevated: rgb(0x9c9a90),

      water: rgb(0x3c6b6a),
      waterFoam: rgb(0x86a8a2),

      accent: rgb(0xff8a3d),
      accent2: rgb(0xffc96b),
      buildings: [0xb9b4a6, 0xcdc7b8, 0x9ba2a6, 0xa8836a, 0xd6cfbf, 0x848d97, 0xc2b6a2, 0x6f7a80],
      roof: rgb(0x6e6a62),
      glass: rgb(0x8fa3a8),
      vegetation: rgb(0x50663f),
    },
    terrain: {
      style: 'mountain',
      relief: 118, // 主城区最高最低点的高差（米），重庆靠它立住
      roughness: 0.82,
      water: 'confluence', // 两江汇流
      riverWidth: 0.13,
      terraces: true, // 依山切台地
    },
    layout: { pattern: 'organic', blockSize: 0.42, density: 0.86, curvy: 0.9 },
    skyline: { avgHeight: 62, variance: 0.78, landmarks: 3, landmarkHeight: 320, floorHeight: 3.1 },
    zones: { commercial: 0.3, residential: 0.52, industrial: 0.18, parks: 0.12 },
    kinds: [
      [KINDS.slab, 0.3], [KINDS.tile, 0.24], [KINDS.stilt, 0.2],
      [KINDS.podiumTower, 0.14], [KINDS.glassTower, 0.09], [KINDS.factory, 0.03],
    ],
    features: {
      interchange: 3, // 层叠立交的数量强度
      monorail: 1, // 轻轨 + 穿楼车站
      cableCar: 2, // 过江索道
      bridge: 4, // 跨江大桥
      cityWall: 0,
      canal: 0,
      neon: 0.55,
      rooftopSign: 0.5,
      stiltPlinth: 1, // 依山吊脚基座
      stairs: 1, // 山城步道
    },
    lighting: { preset: 'overcast', exposure: 1.05, sunHeight: 0.52, sunAzimuth: 2.1 },
    districts: ['渝中半岛', '江北嘴', '南岸', '沙坪坝', '弹子石', '大石坝'],
  },
  {
    id: 'shanghai',
    name: '上海陆家嘴',
    subtitle: 'Shanghai · 玻璃金融城',
    tagline: '超高层簇群、环形高架、黄浦江拐弯',
    cityName: '沪',
    palette: {
      skyTop: rgb(0x2f5a8c),
      skyBottom: rgb(0xc6dcf0),
      fog: rgb(0xbcd2e6),
      fogDensity: 0.75,
      ground: rgb(0x5b6470),
      rock: rgb(0x6e7580),
      road: rgb(0x5a606b),
      roadElevated: rgb(0xc2c8d0),

      water: rgb(0x3d5a72),
      waterFoam: rgb(0x9fb8c9),
      accent: rgb(0xffd489),
      accent2: rgb(0x7fd3ff),
      buildings: [0x8fb4dc, 0xa6c8e6, 0xdfe7ef, 0xd8c294, 0x7ea2c6, 0xeef2f6, 0xb8c6d4, 0x9fb0c2],
      roof: rgb(0x8e99a6),
      glass: rgb(0x9dc8e8),
      vegetation: rgb(0x4f7a4a),
    },
    terrain: {
      style: 'delta',
      relief: 7,
      roughness: 0.18,
      water: 'bend', // 江湾
      riverWidth: 0.17,
      terraces: false,
    },
    layout: { pattern: 'radial', blockSize: 0.62, density: 0.74, curvy: 0.35 },

    skyline: { avgHeight: 118, variance: 0.86, landmarks: 4, landmarkHeight: 600, floorHeight: 4.2 },
    zones: { commercial: 0.56, residential: 0.34, industrial: 0.1, parks: 0.14 },
    kinds: [
      [KINDS.glassTower, 0.38], [KINDS.podiumTower, 0.26], [KINDS.crown, 0.12],
      [KINDS.slab, 0.16], [KINDS.tile, 0.06], [KINDS.factory, 0.02],
    ],
    features: {
      interchange: 2,
      monorail: 0,
      cableCar: 0,
      bridge: 2,
      cityWall: 0,
      canal: 0,
      neon: 0.8,
      rooftopSign: 0.35,
      stiltPlinth: 0,
      stairs: 0,
    },
    lighting: { preset: 'clear', exposure: 1.12, sunHeight: 0.72, sunAzimuth: 1.1 },
    districts: ['陆家嘴', '外滩', '静安', '徐汇滨江', '前滩', '北外滩'],
  },
  {
    id: 'xian',
    name: '古都西安',
    subtitle: "Xi'an · 里坊城墙",
    tagline: '棋盘里坊、包围全城的城墙、坡屋顶限高',
    cityName: '长安',
    palette: {
      skyTop: rgb(0x9a7b52),
      skyBottom: rgb(0xe9d9bb),
      fog: rgb(0xd9c6a4),
      fogDensity: 1.15,
      ground: rgb(0x8d7a5c),
      rock: rgb(0x9c8a68),
      road: rgb(0x8a7b63),
      roadElevated: rgb(0xa89b84),

      water: rgb(0x4a6b5c),
      waterFoam: rgb(0x9fa88c),

      accent: rgb(0xb5402c),
      accent2: rgb(0xe0b45c),
      buildings: [0xc9ab7c, 0xb69a70, 0x8f8778, 0xa8442f, 0xd8c49a, 0x9c8c72, 0xc0b498, 0x7d7566],
      roof: rgb(0x4f5359), // 青灰瓦
      glass: rgb(0xb6a888),
      vegetation: rgb(0x5f7444),
    },
    terrain: {
      style: 'plain',
      relief: 16,
      roughness: 0.24,
      water: 'moat', // 护城河
      riverWidth: 0.06,
      terraces: false,
    },
    layout: { pattern: 'grid', blockSize: 0.92, density: 0.7, curvy: 0.05 },
    skyline: { avgHeight: 21, variance: 0.3, landmarks: 3, landmarkHeight: 64, floorHeight: 3.6 },
    zones: { commercial: 0.32, residential: 0.5, industrial: 0.18, parks: 0.18 },
    kinds: [
      [KINDS.courtyard, 0.36], [KINDS.hall, 0.16], [KINDS.tile, 0.24],
      [KINDS.slab, 0.14], [KINDS.pagoda, 0.06], [KINDS.factory, 0.04],
    ],
    features: {
      interchange: 0,
      monorail: 0,
      cableCar: 0,
      bridge: 1,
      cityWall: 1, // 完整方形城墙 + 城门楼
      canal: 0,
      neon: 0.12,
      rooftopSign: 0.05,
      stiltPlinth: 0,
      stairs: 0,
    },
    lighting: { preset: 'dust', exposure: 1.08, sunHeight: 0.34, sunAzimuth: 3.6 },
    districts: ['碑林', '莲湖', '雁塔', '新城', '曲江', '未央'],
  },
  {
    id: 'shenzhen',
    name: '赛博深圳',
    subtitle: 'Shenzhen · 霓虹湾区',
    tagline: '超级街区、霓虹幕墙、高架穿行的夜城',
    cityName: '鹏城',
    palette: {
      skyTop: rgb(0x0a0a24),
      skyBottom: rgb(0x2c1c54),
      fog: rgb(0x241a44),
      fogDensity: 1.35,
      ground: rgb(0x262b45),
      rock: rgb(0x303653),
      road: rgb(0x2c3557),
      roadElevated: rgb(0x4a5883),


      water: rgb(0x0d1a34),
      waterFoam: rgb(0x2f6d90),
      accent: rgb(0x35f0e0),
      accent2: rgb(0xff2f92),
      buildings: [0x2b3757, 0x35496f, 0x24304e, 0x3c2c62, 0x27405e, 0x453a76, 0x1f2f4f, 0x364d72],
      roof: rgb(0x18213a),
      glass: rgb(0x3d80b8),

      vegetation: rgb(0x27553f),
    },
    terrain: {
      style: 'coast',

      relief: 26,
      roughness: 0.34,
      water: 'bay', // 海湾
      riverWidth: 0.2,
      terraces: false,
    },
    layout: { pattern: 'superblock', blockSize: 0.86, density: 0.8, curvy: 0.12 },

    skyline: { avgHeight: 138, variance: 0.8, landmarks: 5, landmarkHeight: 560, floorHeight: 4 },
    zones: { commercial: 0.5, residential: 0.32, industrial: 0.18, parks: 0.1 },
    kinds: [
      [KINDS.crown, 0.24], [KINDS.glassTower, 0.32], [KINDS.podiumTower, 0.22],
      [KINDS.slab, 0.14], [KINDS.factory, 0.08],
    ],
    features: {
      interchange: 2,
      monorail: 2, // 高架轨道
      cableCar: 0,
      bridge: 2,
      cityWall: 0,
      canal: 0,
      neon: 1, // 拉满
      rooftopSign: 0.7,

      stiltPlinth: 0,
      stairs: 0,
    },
    lighting: { preset: 'night', exposure: 1.3, sunHeight: 0.2, sunAzimuth: 5.1 },
    districts: ['福田CBD', '南山科技园', '前海', '罗湖', '后海', '宝安'],
  },
  {
    id: 'hangzhou',
    name: '杭州江南水乡',
    subtitle: 'Hangzhou · 白墙黑瓦',
    tagline: '密水网、拱桥、白墙黑瓦的低矮天际线',
    cityName: '临安',
    palette: {
      skyTop: rgb(0x7f939c),
      skyBottom: rgb(0xdfe9e4),
      fog: rgb(0xcbdad6),
      fogDensity: 1.45,
      ground: rgb(0x5f7355),
      rock: rgb(0x6f7d68),
      road: rgb(0x86887f),
      roadElevated: rgb(0xa3a59b),

      water: rgb(0x4d7a78),
      waterFoam: rgb(0xa8bfbb),

      accent: rgb(0x6fae8f),
      accent2: rgb(0xc9d6c4),
      buildings: [0xeef0e8, 0xe4e7dd, 0xf2f4ee, 0xd8dcd2, 0xe9ebe2, 0xdfe3d8, 0xf0f1ea, 0xd2d7cb],
      roof: rgb(0x363c41), // 黑瓦
      glass: rgb(0xc4d2cd),
      vegetation: rgb(0x476b3f),
    },
    terrain: {
      style: 'watertown',
      relief: 22,
      roughness: 0.3,
      water: 'lake', // 湖 + 水网
      riverWidth: 0.1,
      terraces: false,
    },
    layout: { pattern: 'organic', blockSize: 0.3, density: 0.66, curvy: 0.75 },
    skyline: { avgHeight: 11, variance: 0.24, landmarks: 2, landmarkHeight: 46, floorHeight: 3.2 },
    zones: { commercial: 0.26, residential: 0.6, industrial: 0.14, parks: 0.3 },
    kinds: [
      [KINDS.waterHouse, 0.54], [KINDS.courtyard, 0.2], [KINDS.tile, 0.12],
      [KINDS.hall, 0.06], [KINDS.pagoda, 0.04], [KINDS.slab, 0.04],
    ],
    features: {
      interchange: 0,
      monorail: 0,
      cableCar: 0,
      bridge: 5, // 密集拱桥
      cityWall: 0,
      canal: 1, // 水巷
      neon: 0.18,
      rooftopSign: 0.05,
      stiltPlinth: 0,
      stairs: 0,
    },
    lighting: { preset: 'mist', exposure: 1.1, sunHeight: 0.46, sunAzimuth: 2.6 },
    districts: ['西湖', '拱墅', '上城', '运河', '钱塘', '余杭'],
  },
];

export const DEFAULT_STYLE = 'chongqing';
export const styleOf = (id) => STYLES.find((s) => s.id === id) ?? STYLES[0];

/** 地形样式可以被用户单独覆盖，所以列表独立于风格预设 */
export const TERRAIN_STYLES = [
  { id: 'mountain', name: '山城高差' },
  { id: 'plain', name: '平原' },
  { id: 'delta', name: '江湾三角洲' },
  { id: 'coast', name: '海岸线' },
  { id: 'watertown', name: '水网湖区' },
];

export const STREET_PATTERNS = [
  { id: 'grid', name: '棋盘里坊' },
  { id: 'radial', name: '环形放射' },
  { id: 'organic', name: '依山自由' },
  { id: 'superblock', name: '超级街区' },
];

export const LIGHT_PRESETS = [
  { id: 'clear', name: '晴日', elev: 0.62, azim: 1.1, sun: 0xfff3d8, ambient: 0.55, skyMul: 1.14, night: 0 },
  { id: 'overcast', name: '雾都阴天', elev: 0.55, azim: 2.1, sun: 0xd8e0e8, ambient: 0.82, skyMul: 0.98, night: 0 },

  { id: 'dust', name: '黄土落日', elev: 0.3, azim: 3.6, sun: 0xffc184, ambient: 0.62, skyMul: 1.02, night: 0.1 },

  { id: 'mist', name: '烟雨', elev: 0.5, azim: 2.6, sun: 0xe8f0ea, ambient: 0.82, skyMul: 0.9, night: 0 },
  { id: 'night', name: '入夜', elev: 0.17, azim: 5.1, sun: 0x7f95e0, ambient: 0.52, skyMul: 0.46, night: 1 },

];


export const lightPresetOf = (id) => LIGHT_PRESETS.find((p) => p.id === id) ?? LIGHT_PRESETS[0];

/** 把 [[kind, weight], ...] 拆成两个平行数组，喂给 random.weighted */
export function kindTable(style) {
  return {
    list: style.kinds.map((k) => k[0]),
    weights: style.kinds.map((k) => k[1]),
  };
}

