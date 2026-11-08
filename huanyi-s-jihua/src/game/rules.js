// 纯常量与计分公式。这一层不认识 canvas，也不认识 React。
//
// 单位是「场地格」而不是像素：场地固定 100×150，渲染层再按屏幕缩放。
// 这样关卡数据和碰撞判定跟屏幕尺寸无关，测试里也能算出确定的坐标。

export const FIELD_W = 100;
export const FIELD_H = 150;

// 玩家船。速度是键盘用的，触屏是「手指到哪船到哪」的位置跟随。
export const PLAYER_SPEED = 74;
export const PLAYER_Y = 124;
export const PLAYER_MIN_Y = 24;
export const PLAYER_MAX_Y = 144;

// 受击面积分两块：主机是个小方块，机翼往两侧伸出去一截。
// 「带着机翼更容易被打中」不是文案，是这两个数的差。
export const HULL_HALF_W = 2.4;
export const HULL_HALF_H = 3.2;
export const WING_HALF_W = 6.4;
export const WING_HALF_H = 1.5;

// 弃翼：机翼脱落的瞬间主机下潜，这段时间打不到你，还快一截。
export const DIVE_TIME = 1.05;
export const DIVE_BOOST = 1.55;
// 脱下来的机翼会往上飘这么久，飘出去就真没了——这是「卖翅膀」的代价窗口。
// 飘得比主机快，所以想接回来必须主动往上追，追的方向正是敌人来的方向。
export const WING_DRIFT = 3.2;
export const WING_DRIFT_VY = -32;
export const CATCH_R = 6.5;
// 刚脱手的那一瞬间接不回来，否则弃翼会退化成一个「白拿无敌」的按钮。
export const CATCH_GRACE = 0.28;
// 刚接上的机翼有一小段不能再卸，否则按连击能无限刷无敌。
export const JETTISON_LOCK = 0.35;

// 没有机翼时只剩主机小炮：能打死杂兵，打不动 Boss，也压不住弹幕。
export const HULL_GUN = { cool: 0.24, dmg: 1, speed: 92 };

export const HURT_INVULN = 1.6;
export const START_LIVES = 3;
export const RESPAWN_DELAY = 1.1;

// ——— 跨章补给 ———
// 打完一章多给一条命，最多攒到 5 条。三章补给刚好把 3 条命的容错垫到 5 条上限。
// 为什么加：16 关一局十几分钟，后期一次失误就掉命，三条命打到底的容错太薄；
// 而「打不过就回到第 1 关」不是难度，是劝退。补给只加容错，不动敌人强度，
// 也就不碰 Boss 血量那条反推链（levels.js 的 bossHp 与 playthrough 的时长断言）。
export const MAX_LIVES = 5;
export const CHAPTER_LIFE_BONUS = 1;

// 敌弹可以被打掉，所以敌弹有血量。1 血意味着任何一发子弹都能消掉它。
export const ENEMY_BULLET_HP = 1;

export const KILL_SCORE = { zako: 80, diver: 120, turret: 150, carrier: 400, ground: 130 };
export const POP_SCORE = 20;
export const BOSS_SCORE = 3000;
export const LIFE_BONUS = 800;
export const SKIP_SCORE = 1200;
// 进化一次给一笔分。攒阶级本来就要冒着「翅膀被打掉」的风险，值得记账。
export const EVOLVE_SCORE = 600;

// ——— 同频共振：捡到同型号机翼那一刻 ———
// 升阶不只是把数字调大：两副同构翼面合榫的瞬间会向外放一圈相位冲击，
// 把半径内的敌弹震碎（照样算连消、照样给分），并给一小段无敌。
// 于是「去接那只翼」是一次有战术收益的动作，而不是顺路捡个道具。
export const SYNC_BURST_R = 26;
export const SYNC_BURST_INVULN = 0.7;
// 满阶之后再捡同型号不再是空捡：换成一段限时过载（火力再翻一截），
// 阶级仍封顶在 Mk.III，过载只是临时的，「投资清零」那条规矩不变。
export const OVERDRIVE_TIME = 5.5;
export const OVERDRIVE_SCORE = 400;

// ——— 装备（僚机）：只增不改，机翼那套常量一个都没动 ———
// 装备道具与机翼道具是两种东西：菱形会翻滚的是机翼，六边形悬浮的是装备。
// 运动参数分开写，改装备手感不会顺手把「弃翼窗口」改坏。
export const GEAR_DROP_LIFE = 9;
export const GEAR_DROP_VY = 13;
export const GEAR_DRIFT = 3.2;
export const GEAR_DRIFT_VY = -32;
export const GEAR_CATCH_SCORE = 120;
export const GEAR_SYNC_SCORE = 240;

// Boss 的死亡演出：血量归零不是当场结算，而是进入 1.3 秒的过载——
// 间隔 BOSS_BLAST_EVERY 秒在壳体上炸一处，期间不再开火、不再撞人，
// 场上它打出的弹幕在死亡瞬间化为火花（弹幕射击的礼节：通关奖励不是清屏刷分）。
export const BOSS_DEATH_TIME = 1.3;
export const BOSS_BLAST_EVERY = 0.18;

// 引力井：把射程内的敌弹往井心拽，拽到 WELL_KILL 以内就湮灭。
// 它是实验机翼那条路的核心——不是把弹幕躲掉，是把弹幕吃掉。
export const WELL_PULL = 62;
export const WELL_KILL = 3.6;

// 连消敌弹：不挨打的情况下连着打掉敌弹，分数和音高一起往上爬。
// 「弹幕可以被打掉」是这游戏的身份，它必须听得见也看得见。
const POP_CHAIN = [1, 1.5, 2, 3, 4, 6];
export const popScore = (chain) => POP_SCORE * POP_CHAIN[Math.min(Math.max(chain, 1), POP_CHAIN.length) - 1];

/** 关卡难度：血量、弹速和出弹频率都跟着关号走，同一份波次数据在后期会更凶。 */
export const tuning = (levelIndex = 0) => ({
  hp: 1 + levelIndex * 0.14,
  fire: 1 + levelIndex * 0.06,
  speed: 1 + levelIndex * 0.035,
});

/** 星级：通关是一星，命没掉光是两星，一条命都没掉才是三星。 */
export const resultStars = (state) => {
  if (state.status !== 'clear' && state.status !== 'won') return 0;
  if (state.lives >= START_LIVES) return 3;
  return state.lives > 1 ? 2 : 1;
};

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
