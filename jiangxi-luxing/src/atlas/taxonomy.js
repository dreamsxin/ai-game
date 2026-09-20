// 分区与类别：地图配色、筛选器和图例都从这里取，改一处全局生效。
// 颜色用十六进制数字（three 侧直接用），CSS 侧用 hexOf() 转字符串。

export const REGIONS = [
  { id: 'lake', name: '环鄱阳湖', cities: '南昌 · 九江', color: 0x6fd3c7, blurb: '省会与庐山夹着中国最大的淡水湖，滕王阁到湖口都在这一带' },
  { id: 'northeast', name: '赣东北', cities: '上饶 · 景德镇 · 鹰潭 · 婺源', color: 0x8fb8ff, blurb: '三清山与龙虎山的丹霞、婺源古村和瓷都窑火，密度最高的一块' },
  { id: 'west', name: '赣西', cities: '宜春 · 萍乡 · 新余', color: 0xa9d86e, blurb: '武功山与明月山的高山草甸，山下是温汤温泉' },
  { id: 'central', name: '赣中', cities: '吉安 · 抚州', color: 0xffc46b, blurb: '吉泰盆地的书院与赣派古村，井冈山从这里往西南爬' },
  { id: 'south', name: '赣南', cities: '赣州', color: 0xff8fb1, blurb: '客家围屋、宋城赣州与共和国摇篮，东江源头也在这儿' },
];

export const CATEGORIES = [
  { id: 'mountain', name: '名山奇峰', color: 0x9ccc65, icon: '山' },
  { id: 'water', name: '湖江水色', color: 0x4fc3f7, icon: '水' },
  { id: 'village', name: '古村晒秋', color: 0xf5d76e, icon: '村' },
  { id: 'kiln', name: '瓷都窑火', color: 0x9fd8ff, icon: '瓷' },
  { id: 'red', name: '红色印记', color: 0xff8a80, icon: '红' },
  { id: 'relic', name: '人文古迹', color: 0xffab91, icon: '迹' },
  { id: 'wild', name: '山野秘境', color: 0xc5e1a5, icon: '野' },
];

export const SEASONS = [
  { id: 'all', name: '不限季节', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: 'spring', name: '春 3-5 月', months: [3, 4, 5] },
  { id: 'summer', name: '夏 6-8 月', months: [6, 7, 8] },
  { id: 'autumn', name: '秋 9-11 月', months: [9, 10, 11] },
  { id: 'winter', name: '冬 12-2 月', months: [12, 1, 2] },
];

export const regionOf = (id) => REGIONS.find((r) => r.id === id);
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id);
export const hexOf = (color) => `#${color.toString(16).padStart(6, '0')}`;
