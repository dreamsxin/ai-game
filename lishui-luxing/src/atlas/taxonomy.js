// 分区（九个县市区）、类别与季节。地图配色、筛选器、图例都从这里取。
// 颜色取《千里江山图》的矿物色系：石青、石绿、赭石、朱砂、绢黄、淡墨。
// 这套色板同时供 three 侧（十六进制数字）和 CSS 侧（hexOf 转字符串）使用。

export const PALETTE = {
  qingDeep: 0x1d4470,  // 石青（深）
  qing: 0x2f6a94,      // 石青
  qingPale: 0x5a92b5,  // 石青（淡）
  lvDeep: 0x2e6b4f,    // 石绿（深）
  lv: 0x4e8a63,        // 石绿
  lvPale: 0x86ad78,    // 石绿（淡）
  zhe: 0x9c6b45,       // 赭石
  zhePale: 0xc08a5c,   // 赭石（淡）
  juan: 0xe9dcbb,      // 绢底
  juanDeep: 0xd9c69a,  // 绢底（深）
  zhu: 0xb5402f,       // 朱砂
  jin: 0xc9a44c,       // 泥金
  mo: 0x3b3a34,        // 淡墨
};

/** 九个县市区。丽水下辖一区一市七县，分区就照行政区划走，找景点最直观 */
export const REGIONS = [
  { id: 'liandu', name: '莲都', color: PALETTE.qingPale, blurb: '市区所在，瓯江穿城，古堰画乡与东西岩都在这里' },
  { id: 'longquan', name: '龙泉', color: PALETTE.qing, blurb: '剑瓷之乡，江浙第一高峰黄茅尖' },
  { id: 'qingtian', name: '青田', color: PALETTE.lvPale, blurb: '石雕与侨乡，瓯江下切成峡' },
  { id: 'jinyun', name: '缙云', color: PALETTE.zhePale, blurb: '仙都鼎湖峰，火山流纹岩与古村' },
  { id: 'suichang', name: '遂昌', color: PALETTE.lv, blurb: '南尖岩云海、唐代金窟' },
  { id: 'songyang', name: '松阳', color: PALETTE.zhe, blurb: '传统村落保护第一县，田园松阴溪' },
  { id: 'yunhe', name: '云和', color: PALETTE.lvDeep, blurb: '七百层梯田与云和湖' },
  { id: 'qingyuan', name: '庆元', color: PALETTE.qingDeep, blurb: '百山祖国家公园、廊桥之乡' },
  { id: 'jingning', name: '景宁', color: PALETTE.jin, blurb: '全国唯一的畲族自治县，云中大漈' },
];

export const CATEGORIES = [
  { id: 'peak', name: '峰峦叠翠', color: PALETTE.qing, glyph: '峰' },
  { id: 'water', name: '江湖烟波', color: PALETTE.qingPale, glyph: '水' },
  { id: 'village', name: '古村人家', color: PALETTE.zhe, glyph: '村' },
  { id: 'craft', name: '器物匠作', color: PALETTE.zhu, glyph: '器' },
  { id: 'relic', name: '碑刻遗迹', color: PALETTE.mo, glyph: '迹' },
  { id: 'field', name: '田畴林泉', color: PALETTE.lv, glyph: '田' },
  { id: 'she', name: '畲乡风物', color: PALETTE.jin, glyph: '畲' },
];

export const SEASONS = [
  { id: 'all', name: '不限季节', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: 'spring', name: '春 三至五月', months: [3, 4, 5] },
  { id: 'summer', name: '夏 六至八月', months: [6, 7, 8] },
  { id: 'autumn', name: '秋 九至十一月', months: [9, 10, 11] },
  { id: 'winter', name: '冬 十二至二月', months: [12, 1, 2] },
];

export const regionOf = (id) => REGIONS.find((r) => r.id === id);
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
export const hexOf = (color) => `#${color.toString(16).padStart(6, '0')}`;
