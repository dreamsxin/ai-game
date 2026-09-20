// 诗人行迹。stops 只放诗词 id，顺序即这个人走过的顺序（先地理、再年月，两者冲突时以诗里的时间为准）。
// 地图上画成一条缎带，站点可逐个点开；因为唐宋人走的是水驿与官道，
// 两站之间的直线距离常常只是实际行程的一半，所以线只说方向，不说里程。
//
// 字段约定：
//   id     唯一标识
//   name   线路名
//   poet   主角（主题线则写"多人"）
//   theme  一句话说这条线是什么
//   color  取自 PALETTE
//   stops  spots.js 里的真实 id，按行迹排序
//   notes  2-3 条，说这条线上发生了什么、为什么这样走
//   pace   一句话说这条线的节奏与读法

import { PALETTE } from './taxonomy.js';

export const ROUTES = [
  {
    id: 'libai',
    name: '李白行迹',
    poet: '李白',
    theme: '一生在路上：从三峡出川，经江汉、洛阳、庐山，最后走到剡中天姥',
    color: PALETTE.qing,
    stops: [
      'libai-zaofabaidicheng',
      'libai-songmenghaoranzhiguangling',
      'libai-chunyeluocheng',
      'libai-jiangjinjiu',
      'libai-wanglushanpubu',
      'libai-songwenchushi-huangshan',
      'libai-mengtianlao',
    ],
    notes: [
      '开头一站是三峡。李白的路几乎都顺长江与运河走，出川之后就再没长住过蜀地',
      '嵩山颍阳的《将进酒》在被赐金放还之后：同一个人，前半程写送别，后半程写"与尔同销万古愁"',
      '结尾的天姥山是梦里的，不是到过的——这条线到最后一站便从地图上离开了地图',
    ],
    pace: '按江流顺读一遍，再倒回来看洛阳与嵩山那两站，落差最清楚',
  },
  {
    id: 'dufu',
    name: '杜甫行迹',
    poet: '杜甫',
    theme: '从泰山下的少年意气，到长安陷落、成都借居，终于困在夔州',
    color: PALETTE.qingDeep,
    stops: ['dufu-wangyue', 'dufu-chunwang', 'dufu-maowuweiqiufeng', 'dufu-qiuxing', 'dufu-denggao'],
    notes: [
      '《望岳》是二十几岁写的，"会当凌绝顶"；《登高》是五十几岁写的，"百年多病独登台"，两站相隔三十余年',
      '长安到成都这一段是安史之乱中逃出来的，中间还隔着秦岭，实际走了一年多',
      '最后三站都在夔州一带，地理上几乎不动了，诗却越写越远',
    ],
    pace: '五站顺读，不要跳站——这条线的意思全在前后对比里',
  },
  {
    id: 'sushi',
    name: '苏轼行迹',
    poet: '苏轼',
    theme: '一贬再贬，一路向南：杭州、密州、黄州、庐山、惠州、儋州',
    color: PALETTE.lvDeep,
    stops: [
      'sushi-yinhushang',
      'sushi-shuidiaogetou',
      'sushi-niannujiao-chibi',
      'sushi-tixilinbi',
      'sushi-guangzhoupujiansi',
      'sushi-shilizhi',
      'sushi-yeduhai',
    ],
    notes: [
      '杭州通判、密州知州还算迁转，乌台诗案后到黄州才是贬；此后每一站都比上一站更南',
      '庐山西林寺那站是离开黄州、量移汝州的路上顺道游山，是这条线上少有的一段闲笔',
      '惠州、儋州两站在宋人眼里已是"天涯"，而他在那里写的是荔枝和渡海时的天色',
    ],
    pace: '沿纬度往下读，越到南边越要读慢',
  },
  {
    id: 'baijuyi-jiangzhou',
    name: '白居易与江州',
    poet: '白居易',
    theme: '从长安的讽喻诗，到贬江州司马，再到杭州刺史修堤',
    color: PALETTE.lv,
    stops: ['baijuyi-taixinglu', 'baijuyi-pipaxing', 'baijuyi-qiantanghuchunxing'],
    notes: [
      '第一站《太行路》写在长安任左拾遗前后，属新乐府，是让他后来被贬的那类诗',
      '第二站浔阳江头，"同是天涯沦落人"——江州司马是这条线的转折，也是他诗风转向的地方',
      '第三站杭州，任刺史时筑堤浚湖，西湖白堤的名字从此而来：同一个人，从被贬者写成了做事的人',
    ],
    pace: '三站三种身份，一站一站读身份的变化，比读风景要紧',
  },
  {
    id: 'biansai',
    name: '边塞一线',
    poet: '多人',
    theme: '从阳关外的大漠一路向东：碛中、玉门、凉州、延州、雁门、幽州',
    color: PALETTE.zhePale,
    stops: [
      'wangchangling-congjunxing',
      'censhen-qizhongzuo',
      'wangzhihuan-liangzhouci',
      'censhen-fengrujingshi',
      'fanzhongyan-yujiaao',
      'wangchangling-chusai',
      'gaoshi-yangezhixing',
      'chenziang-dengyouzhoutai',
    ],
    notes: [
      '这条线是唐代西北边防的实际走向：阳关、玉门是出关的两道门，门外是莫贺延碛，往东是河西大镇凉州，再往东到代州雁门、幽州蓟门',
      '中间的延州一站是北宋的，范仲淹守边时写的《渔家傲》；把它放进来，是因为唐宋两朝的边防线在这一段几乎重合',
      '末尾两站都在幽州：一首写"战士军前半死生"，一首写"前不见古人"，边塞诗到这里转成了怀古',
    ],
    pace: '从西往东顺读一遍就是回京的方向；《逢入京使》正好在这条路的中途',
  },
  {
    id: 'jinling',
    name: '金陵怀古',
    poet: '多人',
    theme: '六朝旧都到江北渡口：乌衣巷、秦淮、石头城，过江是瓜洲与扬州',
    color: PALETTE.zhe,
    stops: [
      'liuyuxi-wuyixiang',
      'dumu-boqinhuai',
      'saduci-manjianghong-jinling',
      'dumu-jiangnanchun',
      'xinqiji-yongyule-beiguting',
      'wanganshi-bochuanguazhou',
      'jiangkui-yangzhouman',
    ],
    notes: [
      '前三站在金陵城里，相距都不过几里：唐人写乌衣巷与秦淮，元人写石头城，隔了五百年还在同一片地方叹',
      '第四、五站过到润州、镇江，北固亭上辛弃疾看的是江北；第六站瓜洲渡在对岸，王安石在船上回望钟山',
      '收尾的扬州是姜夔的：金兵过后的空城，"废池乔木，犹厌言兵"，这条线最后一句最冷',
    ],
    pace: '城里三站可以连着走，过江之后每站停一停，读的是同一条江在不同朝代的样子',
  },
  {
    id: 'nandu',
    name: '南渡之路',
    poet: '多人',
    theme: '靖康之后南渡：从济南到乌江、临安、鄂州军中、带湖、山阴',
    color: PALETTE.zhu,
    stops: [
      'liqingzhao-rumengling',
      'liqingzhao-xiarijueju',
      'liqingzhao-shengshengman',
      'yuefei-manjianghong',
      'xinqiji-pozhenzi',
      'xinqiji-qingyuan-an',
      'xinqiji-yongyule-beiguting',
      'luyou-fengyudazuo',
      'luyou-shier',
    ],
    notes: [
      '开头是李清照少年在章丘溪亭划船，第三站已是临安的"寻寻觅觅"：中间隔着国破、南渡与丧夫，地图上是一千多里',
      '中段三站是两个北人的两种结局：岳飞在鄂州军中写《满江红》，辛弃疾在上饶带湖赋闲写"可怜白发生"',
      '最后两站都在山阴，是陆游的病榻：一首梦里"铁马冰河"，一首临终仍嘱"王师北定中原日"',
    ],
    pace: '这条线不必按地理看，按年份顺读——从北到南是一次，从壮到老是第二次',
  },
  {
    id: 'nanbian',
    name: '南贬之路',
    poet: '多人',
    theme: '一道往南的贬谪线：蓝关、永州、郴州、柳州、潮州、惠州，最后是海那边的儋州',
    color: PALETTE.mo,
    stops: [
      'hanyu-zuoqianzhilantian',
      'liuzongyuan-jiangxue',
      'qinguan-quexiaoxian',
      'liuzongyuan-dengliuzhoushanlou',
      'hanyu-tilinlongsi',
      'sushi-shilizhi',
      'sushi-yeduhai',
    ],
    notes: [
      '这条线不按年月排，按纬度往南排：唐宋两朝的贬官走的其实是同一条路，蓝关出去，过湖南、岭南，尽头是海',
      '同一条路上的人反应各不相同：韩愈在蓝关交代后事（"好收吾骨瘴江边"），柳宗元在永州写一个人独钓寒江，苏轼到惠州写荔枝、到儋州写渡海时的天色',
      '秦观那一站是北宋的，处州再贬郴州，七夕词偏偏写"两情若是久长时" —— 贬途上的人未必都在写贬途',
    ],
    pace: '从北往南一站一站读，注意越往南、诗里的"远"越不靠距离撑着，而靠一句"不恨"或"莫笑"顶住',
  },
  {
    id: 'yuanqu',
    name: '元曲行路',
    poet: '多人',
    theme: '元人的南北路：上京草原、大都送别、潼关骊山怀古、沛县还乡，再下金陵与钱塘',
    color: PALETTE.jin,
    stops: [
      'saduci-shangjingjishi',
      'guanhanqing-sikuaiyu-bieqing',
      'wangshifu-shieryueguoyaominge',
      'luzhi-dianqianhuan-xishan',
      'zhangyanghao-shanpoyang-tongguan',
      'zhangyanghao-shanpoyang-lishan',
      'mazhiyuan-tianjingsha-qiusi',
      'suijingchen-gaozuhuanxiang',
      'saduci-manjianghong-jinling',
      'guanhanqing-yizhihua-hangzhoujing',
      'zhengguangzu-changongqu',
    ],
    notes: [
      '起点在上京道上：元帝每年北巡，百官随行，所以元曲里有一片唐人没写过的草原 —— 而且是平视的，写的是乳酪和毡帘，不是征人泪',
      '中段三站是张养浩赴陕西赈灾途中的怀古（潼关看山河、骊山看废宫），往西一折；再往东到沛县，睢景臣让一个乡下人把皇帝的威仪拆了',
      '末尾四站顺运河与长江南下，同一片江山到元人笔下换了口气：关汉卿写杭州"亡宋家旧华夷"，赵孟頫在西湖边上不敢唱岳王墓那支曲',
    ],
    pace: '十一站里大半是"在路上"，适合连着读；到金陵与钱塘之后放慢，那几站是宋亡之后的江南',
  },
];


export const routeById = (id) => ROUTES.find((r) => r.id === id);
