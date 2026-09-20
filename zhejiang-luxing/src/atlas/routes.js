// 推荐行程。stops 里只放景点 id，顺序就是地理顺序（不跳来跳去），
// 路线在地图上画成一条缎带，点站点会跳到对应景点。
// days 是「含往返的舒服天数」，赶一点可以压掉一天，写在 pace 里。

export const ROUTES = [
  {
    id: 'jiangnan',
    name: '江南经典 5 日',
    color: 0x6fd3c7,
    days: 5,
    theme: '西湖 + 水乡古镇 + 绍兴老城，第一次来浙江的标准答案',
    pace: '每天一个主景点，全程高铁 + 打车即可，不需要自驾',
    months: '3-5 月、9-11 月最好；梅雨季别安排户外为主的一天',
    stops: ['xihu', 'lingyin', 'xixi', 'wuzhen', 'nanxun', 'luxun'],
    notes: [
      '杭州留两天：一天环西湖，一天灵隐 + 西溪，别把两处挤在同一天',
      '乌镇住景区内一晚，是这条线唯一「必须住对地方」的一站',
      '南浔安排在乌镇之后，两个古镇气质不同才不会腻',
    ],
  },
  {
    id: 'shanhai',
    name: '山海奇观 6 日',
    color: 0xffc46b,
    days: 6,
    theme: '浙南的火山流纹岩、瀑布与海边石村，看点密度最高的一条',
    pace: '景点之间 1-2 小时车程，建议自驾；高铁站之间转乘也可行',
    months: '4-6 月、9-11 月；7-9 月注意台风',
    stops: ['tiantai', 'shenxianju', 'linhai', 'shitang', 'yandang', 'nanxijiang'],
    notes: [
      '雁荡山排在傍晚抵达：灵峰夜景是这条线的最大惊喜，白天看不到',
      '石塘住山顶民宿，第二天推窗看日出，不用起大早赶路',
      '神仙居走北门上、南门下，索道单程就够',
    ],
  },
  {
    id: 'islands',
    name: '东海跳岛 5 日',
    color: 0xff8fb1,
    days: 5,
    theme: '从渔港到佛门道场再到最东端的日出，一路都在船上',
    pace: '全程看船班和天气行事，务必留一天缓冲',
    months: '5-10 月；冬季大风封航频繁',
    stops: ['shipu', 'putuoshan', 'dongji', 'shengsi'],
    notes: [
      '先在石浦吃开渔季的海鲜，再从沈家门上岛，顺路不折返',
      '东极岛是全线风险点：被风浪困住一两天是常态，别把返程机票订在最后一天',
      '普陀山至少两天，第一天三大寺，第二天佛顶山或洛迦山',
    ],
  },
  {
    id: 'westhills',
    name: '浙西秘境 5 日',
    color: 0xa9d86e,
    days: 5,
    theme: '钱塘江上游：湖、江、古村与丹霞，一条适合自驾的慢线',
    pace: '自驾最佳，村镇之间公共交通很薄',
    months: '3-5 月、9-11 月；夏天湖区适合玩水',
    stops: ['qiandaohu', 'fuchunjiang', 'zhuge', 'jianglang', 'gengong'],
    notes: [
      '千岛湖的船票要提前三天订，它决定整条线的起点日期',
      '富春江沿江公路自己就是景点，别急着赶去下一站',
      '江郎山与廿八都分两个半天，爬完山再进古镇',
    ],
  },
  {
    id: 'terrace',
    name: '浙南古村梯田 5 日',
    color: 0xc5e1a5,
    days: 5,
    theme: '丽水到温州的山里：石柱、黄泥老屋、七百层梯田',
    pace: '山路多弯，自驾或包车，每天开车不超过两小时',
    months: '4-5 月梯田灌水如镜，9-11 月稻黄加云海',
    stops: ['xiandu', 'songyang', 'yunhe', 'nanxijiang'],
    notes: [
      '云和梯田住山上村子，清晨五六点上观景台等云海',
      '松阳的古村分散，挑杨家堂 + 陈家铺两个就够，不要贪多',
      '仙都赶早上去，雾气是「仙」字的全部来源',
    ],
  },
  {
    id: 'weekend',
    name: '杭州周末 2 日',
    color: 0x8fb8ff,
    days: 2,
    theme: '两天把杭州的湖、山、茶和五千年一起看掉',
    pace: '全程地铁 + 共享单车，不用打车',
    months: '全年；春秋最舒服',
    stops: ['xihu', 'longjing', 'lingyin', 'liangzhu'],
    notes: [
      '第一天环湖 + 九溪十八涧，第二天灵隐 + 良渚，动线一西一北不折返',
      '灵隐飞来峰记得提前一天预约，这条线最容易翻车的一步',
      '良渚先看博物院再进公园，否则土台看不懂',
    ],
  },
];

export const routeById = (id) => ROUTES.find((r) => r.id === id);
