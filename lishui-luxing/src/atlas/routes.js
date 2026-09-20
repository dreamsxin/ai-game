// 推荐行程。stops 只放景点 id，顺序即地理顺序；地图上画成一条缎带，站点可逐个点开。
// days 是含往返的舒服天数。丽水县与县之间多是山路，实际车程往往比直线距离长一倍，
// 所以每条线都刻意压少了每天的站数。

export const ROUTES = [
  {
    id: 'ouyun',
    name: '瓯江山水诗路 四日',
    color: 0x2f6a94,
    days: 4,
    theme: '沿瓯江从青田上行到缙云：峡口、湖、古堰、石柱',
    pace: '全程沿江与高速，是丽水唯一不太需要爬山的一条',
    months: '4-6 月、9-10 月最好；雨雾天江面反而更好看',
    stops: ['shimendong', 'qianxiahu', 'nanminghu', 'guyan', 'xiandu'],
    notes: [
      '石门洞尽量从江上码头进，气势和公路进完全不同',
      '古堰画乡留一个傍晚：两岸渡船最后一班之后，江边基本没人',
      '仙都排在最后一天清早，雾还没散的时候上鼎湖峰对岸',
    ],
  },
  {
    id: 'jianci',
    name: '剑瓷云山 三日',
    color: 0xb5402f,
    days: 3,
    theme: '龙泉一县看透"一把剑、一炉瓷、一座江浙第一高峰"',
    pace: '两天在市区与上垟之间，一天上山',
    months: '5-10 月；七八月山上避暑最值',
    stops: ['qingcizhen', 'dayao', 'jianchi', 'longquanshan'],
    notes: [
      '青瓷体验课要提前约，作品烧成后寄回要两到四周，安排在第一天最合适',
      '大窑先看博物馆再进山，否则满地瓷片看不懂',
      '龙泉山单独占一天，山上比市区低 8-10℃，外套别落在酒店',
    ],
  },
  {
    id: 'guxiang',
    name: '松阳古村 四日',
    color: 0x9c6b45,
    days: 4,
    theme: '传统村落保护第一县：黄泥老屋、崖居村、茶园与老街',
    pace: '以松阳老城为基地，每天出去一个方向，不换住处',
    months: '3-5 月、10-12 月；11 月杨家堂最金',
    stops: ['laojie', 'yangjiatang', 'chenjiapu', 'damushan', 'shicang'],
    notes: [
      '住松阳老城，四个方向的村子都在半小时车程内，比每天换民宿省心',
      '杨家堂安排在下午四五点，陈家铺安排在清早，这两站是掐时间的',
      '村里没有商店也没有餐馆，出发前带足水',
    ],
  },
  {
    id: 'yunhai',
    name: '云海梯田 三日',
    color: 0x4e8a63,
    days: 3,
    theme: '云和梯田 + 云和湖 + 南尖岩，专门为云海和梯田来',
    pace: '两处都要住山上，为的是清早那两个小时',
    months: '4-5 月灌水如镜，9-10 月稻黄加云海',
    stops: ['yunhetitian', 'xiangong', 'nanjianyan'],
    notes: [
      '云和梯田住坑根石寨或崇头，五点半上观景台',
      '云和湖安排在下午，船班末班早，别拖到傍晚',
      '南尖岩住山下农家乐，雨后转晴的清早云海概率最高',
    ],
  },
  {
    id: 'shexiang',
    name: '畲乡廊桥 五日',
    color: 0xc9a44c,
    days: 5,
    theme: '景宁到庆元：畲族村寨、云中高山盆地、木拱廊桥与国家公园',
    pace: '全程山路，建议自驾或包车，每天只安排一处',
    months: '5-10 月；农历三月三畲族歌会最热闹',
    stops: ['chimushan', 'dajun', 'dajie', 'baishanzu', 'yueshan', 'daji-village'],
    notes: [
      '先去畲族博物馆再进畲村，看表演时才知道每样东西的来处',
      '云中大漈住一晚，早上看雾从梯田里升起来',
      '百山祖与月山之间是一段长山路，中午前出发别赶夜路',
    ],
  },
  {
    id: 'xianducun',
    name: '缙云仙都古村 三日',
    color: 0xc08a5c,
    days: 3,
    theme: '缙云短线：鼎湖峰、千年古村、石头村与高山台地',
    pace: '四处都在一小时车程内，但岩下与大洋都在山上，压成两天会很赶',
    months: '全年；春秋最舒服，盛夏上大洋避暑',
    stops: ['xiandu', 'heyang', 'yanxia', 'dayangshan'],
    notes: [
      '第一天仙都（清早看雾）+ 河阳古民居，两处都在平地上',
      '第二天岩下石头村，第三天大洋山，山路各占半天',
      '缙云烧饼要吃炭炉现打的，镇上的店比景区门口好',
      '岩下进村路窄，赶早去避开会车',
    ],
  },
];

export const routeById = (id) => ROUTES.find((r) => r.id === id);
