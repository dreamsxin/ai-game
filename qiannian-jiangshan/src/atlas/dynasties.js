// 千年江山图——朝代脊骨。纯数据 + 纯函数，没有 DOM，测试直接吃这张表。
//
// 这张长卷的横轴是时间，所以朝代表同时承担两件事：
//   1. 画面上的分段（每段一座山峦，段与段首尾相接，不留缝也不重叠）
//   2. 条目（事件/人物/书籍）的落点坐标系
//
// 历史上的王朝是会重叠的（西晋 266 年建国而三国到 280 年才收尾，北宋 960 年
// 开国而北汉到 979 年才亡，清 1636 年改国号而明到 1644 年才亡）。长卷画不了重叠，
// 所以每段记的是**轴上的区间** axisStart/axisEnd：它按「谁在这段时间里是主角」
// 切分，首尾严格相接。真实起讫年写在 span 文字里，不参与算坐标。
//
// 一段也不等于一个王朝：**国力断崖处要切开**，否则一座山会把两种处境画成同一个高度。
// 唐在安史之乱（755）处切成唐前期／唐后期，清在鸦片战争（1840）处切成清前期／晚清，
// 王莽的新朝从西汉里单列出来——于是「盛极」与「续命」在卷上是两座高度差很大的山。
//
// 字段约定：
//   id         唯一标识（拼音）
//   name       段名，题签上竖排的那几个字
//   span       真实起讫的文字表述，面板里显示
//   axisStart  轴上区间起点（负数为公元前）
//   axisEnd    轴上区间终点，等于下一段的 axisStart
//   kind       'legend' 传说期 | 'unified' 大一统 | 'divided' 分裂割据
//   power      0..1，这一段画成多高的山。大一统盛世是石青高峰，
//              乱世压低成江面与云雾——所以「山高」是一个可测的数
//   weight     轴上宽度的手调系数，用来给条目密的朝代多留卷面
//   capital    都城
//   tint       这一段的点缀色（题签印章、选中高亮），矿物色系
//   summary    一句话概括这一段
//   detail     2-3 句展开

export const DYNASTIES = [
  {
    id: 'xinshiqi', name: '新石器', span: '约前 3500—前 2600 年',
    axisStart: -3500, axisEnd: -2600, kind: 'legend', power: 0.16, weight: 0.7,
    capital: '无城无国', tint: '#9a8f63',
    summary: '仰韶、良渚、龙山——做文明的材料都齐了，国家还没出现。',
    detail: '彩陶、玉琮、稻作水田与良渚的水坝都出自这一段，几千人规模的工程说明社会已经能被组织起来。但这些文化各自独立、互不统属，谁也没能把「天下」收成一个，所以卷首只有一片几乎看不出轮廓的远山。',
  },
  {
    id: 'legend', name: '五帝', span: '约前 2600—前 2070 年',
    axisStart: -2600, axisEnd: -2070, kind: 'legend', power: 0.3, weight: 0.85,
    capital: '无定居', tint: '#8a8158',
    summary: '传说与考古交界处的部落联盟时代，禅让是这一段的底色。',
    detail: '黄帝、颛顼、帝尧、帝舜的事迹由《史记·五帝本纪》追记，考古上对应龙山文化晚期的城址与玉器。这一段没有可靠纪年，所以卷首画成一片淡入绢底的远山。',
  },
  {
    id: 'xia', name: '夏', span: '约前 2070—前 1600 年',
    axisStart: -2070, axisEnd: -1600, kind: 'unified', power: 0.38, weight: 0.8,
    capital: '阳城、斟鄩（今偃师二里头一带）', tint: '#8d7a4a',
    summary: '第一个把王位从禅让改成父子相传的王朝。',
    detail: '禹治水而得天下，启继位开「家天下」之局。二里头遗址的宫城与青铜爵被多数学者对应到夏代晚期，但夏本身尚无自证文字。',
  },
  {
    id: 'shang', name: '商', span: '约前 1600—前 1046 年',
    axisStart: -1600, axisEnd: -1046, kind: 'unified', power: 0.52, weight: 0.85,
    capital: '亳、殷（今安阳）', tint: '#7d6b4f',
    summary: '中国第一个有自证文字的王朝——甲骨文让历史从传说变成记录。',
    detail: '盘庚迁殷后二百七十余年不再徙都，青铜礼器与占卜体系高度成熟。武丁一朝疆域与国力达到顶点，末王帝辛（纣）亡于牧野。',
  },
  {
    id: 'xizhou', name: '西周', span: '前 1046—前 771 年',
    axisStart: -1046, axisEnd: -771, kind: 'unified', power: 0.6, weight: 0.85,
    capital: '镐京（今西安）', tint: '#6b8a52',
    summary: '用封建、宗法与礼乐三件事把天下捆成一个秩序。',
    detail: '武王克商后分封诸侯，周公制礼作乐，「天命」取代「帝」成为统治的合法性来源。共和行政与国人暴动已见裂痕，幽王死于犬戎之乱，平王东迁。',
  },
  {
    id: 'chunqiu', name: '春秋', span: '前 770—前 476 年',
    axisStart: -771, axisEnd: -476, kind: 'divided', power: 0.34, weight: 1.1,
    capital: '洛邑（今洛阳），王室仅存名分', tint: '#7d8f57',
    summary: '周天子还在，号令已经不出王城——霸主政治接管了天下。',
    detail: '齐桓、晋文、楚庄相继称霸，「尊王攘夷」是他们共同的说法。旧的礼乐秩序一边崩坏一边被追认，也正因如此，孔子、老子这一代人开始追问秩序本身从何而来。',
  },
  {
    id: 'zhanguo', name: '战国', span: '前 475—前 221 年',
    axisStart: -476, axisEnd: -221, kind: 'divided', power: 0.42, weight: 1.35,
    capital: '七雄各都其国', tint: '#6f9160',
    summary: '七国互相吞并，也互相逼着彼此变法——中国第一次制度竞赛。',
    detail: '铁器与牛耕推平了井田，郡县、军功爵、成文法在竞争中被反复试验。百家争鸣是这场竞赛的思想面，商鞅变法则是最彻底的一次落地。',
  },
  {
    id: 'qin', name: '秦', span: '前 221—前 207 年',
    axisStart: -221, axisEnd: -206, kind: 'unified', power: 0.72, weight: 0.65,
    capital: '咸阳', tint: '#4f7c7e',
    summary: '十五年里立下了之后两千年都在用的那套框架。',
    detail: '郡县制、统一文字度量衡、驰道与长城，把「天下」第一次变成一个可以行政的整体。但严刑、重役与二世的失控，让它成为最短命的大一统王朝。',
  },
  {
    id: 'xihan', name: '西汉', span: '前 202—公元 8 年',
    axisStart: -206, axisEnd: 8, kind: 'unified', power: 0.86, weight: 1.6,
    capital: '长安（今西安）', tint: '#3f7f92',
    summary: '把秦的框架填上了儒家的内容，「汉」从此成了族名。',
    detail: '文景之治养足国力，武帝北击匈奴、西通西域、独尊儒术，把版图与意识形态一并定型。昭宣之后外戚坐大，王氏三代把持中枢，最终由王莽以「摄皇帝」之名代汉。',
  },
  {
    id: 'xinmang', name: '新莽', span: '公元 9—23 年',
    axisStart: 8, axisEnd: 25, kind: 'unified', power: 0.34, weight: 0.5,
    capital: '常安（今西安）', tint: '#6f7a58',
    summary: '中国唯一一次靠「复古」建立的王朝，十五年就被自己的改制推翻。',
    detail: '王莽照《周礼》改官制、改地名、行王田、五次改币，想用三代之法解决土地兼并。政令朝令夕改而吏治跟不上，加上黄河改道后的大饥，绿林与赤眉同时起事，新朝亡于昆阳与长安城内。这一段在卷上是两座高峰之间一道很窄的塌陷。',
  },
  {
    id: 'donghan', name: '东汉', span: '公元 25—220 年',
    axisStart: 25, axisEnd: 220, kind: 'unified', power: 0.66, weight: 0.9,
    capital: '洛阳', tint: '#4f8a7c',
    summary: '光武中兴后偏向内敛，技术却在这一朝突飞猛进。',
    detail: '造纸、地动仪、水排与《伤寒杂病论》都出自此时。中后期外戚与宦官轮流把持朝政，党锢之祸断了士人的路，黄巾一起，天下就再也收不回来了。',
  },
  {
    id: 'sanguo', name: '三国', span: '公元 220—280 年',
    axisStart: 220, axisEnd: 280, kind: 'divided', power: 0.36, weight: 0.8,
    capital: '洛阳 · 成都 · 建业', tint: '#7b9873',
    summary: '六十年三分，把「以弱抗强」写成了中国人最熟的一段故事。',
    detail: '赤壁定下三分之势，魏据中原而国力最厚，蜀凭山险与人谋，吴恃长江与水军。屯田、九品官人法这些制度创新影响远超这六十年本身。',
  },
  {
    id: 'xijin', name: '西晋', span: '公元 266—316 年',
    axisStart: 280, axisEnd: 317, kind: 'unified', power: 0.46, weight: 0.6,
    capital: '洛阳', tint: '#5d8c84',
    summary: '统一只维持了三十几年，随即被自家宗室的内战掀翻。',
    detail: '灭吴后本有太康之治的短暂安稳，但分封宗室加上惠帝失政，酿成八王之乱。国力耗尽之际，内迁诸族起兵，永嘉之乱后中原易手。',
  },
  {
    id: 'dongjin', name: '东晋十六国', span: '公元 317—420 年',
    axisStart: 317, axisEnd: 420, kind: 'divided', power: 0.3, weight: 0.85,
    capital: '建康（今南京）', tint: '#84a082',
    summary: '衣冠南渡，江南第一次成为中国文化的主场。',
    detail: '门阀与皇权共治，王与马共天下。淝水一战守住了半壁，北方则是十六国轮替的百年战场。也正是在这一百年里，佛教扎根、山水诗与行书成型。',
  },
  {
    id: 'nanbeichao', name: '南北朝', span: '公元 420—589 年',
    axisStart: 420, axisEnd: 581, kind: 'divided', power: 0.32, weight: 0.9,
    capital: '建康 · 平城／洛阳 · 邺', tint: '#789a8a',
    summary: '南北对峙一百七十年，却把胡与汉搅成了新的中国。',
    detail: '北魏孝文帝迁洛、改姓、易服，是自上而下最彻底的一次融合；南朝则在佛寺、玄谈与骈文里把士族文化推到极致。云冈、龙门的石窟是这一段留在石头上的部分。',
  },
  {
    id: 'sui', name: '隋', span: '公元 581—618 年',
    axisStart: 581, axisEnd: 618, kind: 'unified', power: 0.64, weight: 0.6,
    capital: '大兴（今西安）、东都洛阳', tint: '#4c8590',
    summary: '三十七年做完了两件够用一千年的事：运河与科举。',
    detail: '文帝开皇之治重建了均田、租庸与三省六部；炀帝开凿大运河、三征高句丽，工程与国力一起被推到极限。隋亡得像秦，留下的东西也像秦。',
  },
  {
    id: 'tang', name: '唐前期', span: '公元 618—755 年',
    axisStart: 618, axisEnd: 755, kind: 'unified', power: 0.95, weight: 1,
    capital: '长安（今西安）', tint: '#2f6f9e',
    summary: '长安是当时世界最大的城，而唐人敢把外来的东西都认成自己的。',
    detail: '贞观、开元把制度与气度同时做到顶点：科举取士、羁縻府州、三教并行，让这个帝国既硬也松。天宝年间户口与疆域都到了极处，边镇节度使手里的兵也到了极处——盛极的那一刻，隐患已经写在编制表上。',
  },
  {
    id: 'tanghou', name: '唐后期', span: '公元 755—907 年',
    axisStart: 755, axisEnd: 907, kind: 'unified', power: 0.5, weight: 0.9,
    capital: '长安，一度失守', tint: '#5b8aa2',
    summary: '安史之乱是全卷最陡的那道断崖，之后的一百五十年都在续命。',
    detail: '乱后中央再也收不回河北，藩镇、宦官与朝官三方角力成为常态。两税法把财政从人头改到土地与资产，硬是又撑起一段中兴；但甘露之变、牛李党争与黄巢入长安一层层削下去，最后由藩镇自己终结了它。',
  },
  {
    id: 'wudai', name: '五代十国', span: '公元 907—979 年',
    axisStart: 907, axisEnd: 960, kind: 'divided', power: 0.26, weight: 0.6,
    capital: '汴梁等五都轮替', tint: '#8ba18e',
    summary: '五十三年五个朝廷，武人立国，武人亡国。',
    detail: '中原政权走马换将，割据的十国反而在南方存住了经济与文化。石敬瑭割让燕云十六州，把此后四百年的北方边防问题一次性挖成了坑。',
  },
  {
    id: 'beisong', name: '北宋', span: '公元 960—1127 年',
    axisStart: 960, axisEnd: 1127, kind: 'unified', power: 0.78, weight: 0.95,
    capital: '开封（东京）', tint: '#3c7f96',
    summary: '文官治国、市井繁荣、技术领先，唯独没能把燕云拿回来。',
    detail: '杯酒释兵权换来百年无内乱，代价是「守内虚外」。交子、活字、罗盘、《梦溪笔谈》都出在这一朝，《千里江山图》也是。靖康二年金军破城，把这一切按了暂停。',
  },
  {
    id: 'nansong', name: '南宋', span: '公元 1127—1279 年',
    axisStart: 1127, axisEnd: 1279, kind: 'unified', power: 0.5, weight: 0.85,
    capital: '临安（今杭州）', tint: '#588f95',
    summary: '半壁江山，却做出了当时世界上最富的经济体。',
    detail: '海上贸易、纸币与市镇让财政撑住了长期战争，理学在此完成体系化。岳飞之死与崖山之亡是这一段的两个结点——文天祥留下的那两句，是它最后的自述。',
  },
  {
    id: 'yuan', name: '元', span: '公元 1271—1368 年',
    axisStart: 1279, axisEnd: 1368, kind: 'unified', power: 0.7, weight: 0.7,
    capital: '大都（今北京）', tint: '#43738f',
    summary: '中国第一次被纳入一个横跨欧亚的体系，行省制从此不变。',
    detail: '忽必烈建元、立行省、开通惠河，草原与农耕两套治理逻辑始终在互相别扭。四等人制与滥发纸币埋下祸根，元曲与《授时历》则是这九十年最亮的两笔。',
  },
  {
    id: 'ming', name: '明', span: '公元 1368—1644 年',
    axisStart: 1368, axisEnd: 1644, kind: 'unified', power: 0.82, weight: 1.05,
    capital: '南京，1421 年后北京', tint: '#34708e',
    summary: '布衣开国，七下西洋，又亲手把海关上了锁。',
    detail: '废丞相、设内阁、锦衣卫与厂卫交织，皇权集中到极处。郑和的船队走到东非，随后海禁与「重农抑商」把这条路掐断。晚明白银内流、心学兴起、《天工开物》成书，与流寇和辽东兵事同时发生。',
  },
  {
    id: 'qing', name: '清前期', span: '公元 1636／1644—1840 年',
    axisStart: 1644, axisEnd: 1840, kind: 'unified', power: 0.8, weight: 1,
    capital: '北京', tint: '#4a7a8c',
    summary: '版图最大的一朝，人口从一亿涨到四亿，也把门关得最紧。',
    detail: '康雍乾三代平三藩、定台湾、收准噶尔、设驻藏大臣，把边疆治理做成了一整套制度；摊丁入亩与永不加赋让人口翻了几倍。代价是文字狱、一口通商与「天朝无所不有」的自我确认——对外部世界的变化，这一段几乎没有留下接口。',
  },
  {
    id: 'wanqing', name: '晚清', span: '公元 1840—1912 年',
    axisStart: 1840, axisEnd: 1912, kind: 'unified', power: 0.4, weight: 0.85,
    capital: '北京', tint: '#5f7180',
    summary: '被外力逼着走完的七十年：每输一次，就往前改一步。',
    detail: '两次鸦片战争、太平天国与甲午之败，把条约、赔款与租界一层层压上来。洋务办出了江南制造局与北洋水师，戊戌变法与清末新政动到了科举和官制，但改革总比危机慢半拍。1912 年清帝退位，两千年的帝制在卷末收成一片暮色里的江面。',
  },
];

/** 轴上的总跨度（年），供时间轴换算与测试使用。 */
export const AXIS_START = DYNASTIES[0].axisStart;
export const AXIS_END = DYNASTIES[DYNASTIES.length - 1].axisEnd;

const BY_ID = new Map(DYNASTIES.map((d) => [d.id, d]));

/** 按 id 取朝代，取不到返回 undefined（调用方自己决定怎么办）。 */
export function dynastyById(id) {
  return BY_ID.get(id);
}

/** 某个公元年落在哪一段里。区间左闭右开，末段右闭，超出范围则夹到两端。 */
export function dynastyAtYear(year) {
  if (year <= AXIS_START) return DYNASTIES[0];
  if (year >= AXIS_END) return DYNASTIES[DYNASTIES.length - 1];
  return DYNASTIES.find((d) => year >= d.axisStart && year < d.axisEnd) ?? DYNASTIES[0];
}

/** 年份转成中文表述：负数是公元前。地图上的刻度和面板都用它。 */
export function yearLabel(year) {
  return year < 0 ? `前 ${-year} 年` : `${year} 年`;
}

