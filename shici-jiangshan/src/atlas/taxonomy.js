// 朝代、主题与配色。地图配色、筛选器、图例都从这里取。
// 颜色取《千里江山图》的矿物色系：石青、石绿、赭石、朱砂、绢黄、淡墨。

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
  zi: 0x6b4a72,        // 紫（紫矿）—— 十一条行迹把石青石绿赭石朱砂淡墨泥金都用尽了，
                       // 剩下的绢黄画成缎带会没入绢底，所以添一色；紫在绢上清楚，又不抢朱砂的印章
  jin: 0xc9a44c,       // 泥金
  mo: 0x3b3a34,        // 淡墨
};

/** Dynasties */
export const DYNASTIES = [
  { id: 'tang', name: '唐', color: PALETTE.qing, blurb: '诗的黄金时代 618-907' },
  { id: 'song', name: '宋', color: PALETTE.lv, blurb: '词的全盛时代 960-1279' },
  { id: 'yuan', name: '元', color: PALETTE.zhe, blurb: '元曲散曲兴起 1271-1368' },
];

/** Poetry themes / emotional categories */
export const THEMES = [
  { id: 'farewell', name: '送别离愁', color: PALETTE.qingPale, glyph: '别' },
  { id: 'nostalgia', name: '怀古思乡', color: PALETTE.zhe, glyph: '思' },
  { id: 'landscape', name: '山水田园', color: PALETTE.lv, glyph: '山' },
  { id: 'frontier', name: '边塞征戍', color: PALETTE.zhePale, glyph: '戍' },
  { id: 'ambition', name: '壮志忧国', color: PALETTE.zhu, glyph: '志' },
  { id: 'recluse', name: '隐逸闲适', color: PALETTE.lvPale, glyph: '隐' },
  { id: 'love', name: '爱情相思', color: PALETTE.jin, glyph: '情' },
  { id: 'elegy', name: '悲悼哀挽', color: PALETTE.qingDeep, glyph: '挽' },
];

export const dynastyOf = (id) => DYNASTIES.find((d) => d.id === id);
export const themeOf = (id) => THEMES.find((t) => t.id === id);
export const hexOf = (color) => `#${color.toString(16).padStart(6, '0')}`;
