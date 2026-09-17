// 车辆与赛道的判定常量。逻辑层全部用「米 / 秒 / 弧度」，像素只活在渲染层。
//
// 这游戏的判定有一条贯穿全局的规矩：**氮气是唯一的硬通货，而它只能从弯里攒出来**。
//
// 一条完整的收益链是：拉手刹横着过弯（付一点速度）→ 攒到一档气 → 在直道上喷掉（拿回一大段）。
// 链子走完才赚，走一半反而亏——「漂了不喷」是这游戏里最慢的开法，比一路抓地还慢。
// 三个数字管着这条链：DRIFT_SCRUB 是过路费，CHARGE_RATE 是产出速度，BOOST_SPEED 是回报。
//
// 于是氮气成了一种**赛道资源**：弯多的图给得多，直道长的图给得少。
// 关卡表调的是弯道密度而不是对手血量，难度就落在这条经济关系上。

export const STEP = 1 / 60;

/** 抓地上限。数值是 m/s，界面上乘 3.6 显示成 km/h。 */
export const MAX_SPEED = 34;
/** 草地上限。掉到这个数意味着一个弯要还两秒，比撞墙更贵。 */
export const GRASS_SPEED = 13;
/**
 * 喷射上限，比抓地上限高出近五成。
 * 这个数（连同 BOOST_TIME）是整条收益链的**回报端**，不是手感参数而是玩法参数：
 * 实测把它调回 46 附近，弯多的那几关就会翻盘成「一路抓地不漂反而更快」，攒气随之失去意义。
 */
export const BOOST_SPEED = 50;

export const ACCEL = 11;
export const BOOST_ACCEL = 26;
/** 超过上限时的回落。草地和撞墙都靠它把速度拽下来。 */
export const OVER_DRAG = 22;

export const GRIP_TURN = 1.5;
export const DRIFT_TURN = 2.85;
/** 速度越高转向越钝：全速时只剩七成。这条让「进弯前松一点」有意义。 */
export const TURN_FADE = 0.55;

/**
 * 速度方向追目标方向的角速度。
 * 抓地时目标就是车头，14 rad/s 几乎瞬间对齐——车头指哪走哪。
 * 漂移时目标是「车头往回让出一个漂移角」的方向，3 rad/s 意味着车尾甩出去要 0.2 秒。
 *
 * 这里刻意**不用**「转向超过抓地极限才打滑」那套物理：拉手刹就该立刻横过来。
 * 卡丁车的漂移是一个主动动作，不是失控的后果——缓弯里也该能拉出角度攒气，
 * 不然「弯道是氮气的产地」这条经济关系在前几关根本不成立。
 */
export const COURSE_GRIP = 14;
export const COURSE_DRIFT = 3;

export const DRIFT_MAX = 0.62;
/**
 * 小于这个夹角只是压弯，不算漂移，不给气——不然直道上左右搓也能攒气。
 * 门槛压在 0.12：缓弯里只要肯多打一点方向、把车尾主动甩出来，气就攒得到，
 * 代价是走线更宽。这一条把「缓弯要不要漂」变成一道真的选择题。
 */
export const DRIFT_MIN = 0.12;
/**
 * 漂移的代价：夹角拉满时上限掉这么多。
 * 这一刀刻意开得浅（8%）——它不是「漂移很慢」的意思，而是「横着走要付一点过路费」。
 *
 * 这里试过更硬的写法：给轮胎设横向加速度上限，让全速冲进紧弯必然推头掉速。
 * 那套物理更真，但和「没有刹车」这条移动端操作前提打架：
 * 唯一的减速手段变成了推头，于是过弯快慢几乎只取决于方向盘抖不抖，
 * 机器人（和玩家）稍有不稳就整段掉速，弯道反而**惩罚了敢冲的人**。
 * 所以这里回到简单的写法：漂移只收一点过路费，真正的账记在氮气上——
 * 漂移换气、气换速度，赚不赚全看有没有把气喷出去。
 */
export const DRIFT_SCRUB = 0.08;

export const CHARGE_RATE = 0.9;
export const CHARGE_MAX = 1.25;
/** 三档喷的门槛。攒到哪一档只看松手那一刻的气量。 */
export const TIERS = [0.34, 0.66, 1];
export const BOOST_TIME = [0.7, 1.2, 1.8];
export const TOKEN_MAX = 3;

/** 连喷窗口：松手后这么久内重新入漂，新的一段带着底气开始。 */
export const COMBO_WINDOW = 0.5;
export const CARRY = 0.3;

/** 赛道外还有一段缓冲带，超出去才算撞墙。 */
export const SHOULDER = 4;
export const WALL_KEEP = 0.5;
/**
 * 撞墙之后的保底速度与冷却。
 * 少了这两个，会出现一种最难受的死法：车贴在弯外的墙上，车头和墙平行，
 * 但赛道在弯，于是每一帧都在重新撞一次——速度被反复砍半，钉在原地几十秒，
 * 而这游戏**没有倒车**，玩家一点办法都没有。
 * 所以撞墙的规则是「撞一下很疼，但一定还能开走」：速度不低于 7 m/s，
 * 并且车头被往赛道里掰 0.3 弧度，一秒内能自己回到路面上。
 */
export const WALL_MIN = 7;
export const WALL_COOL = 0.3;
export const WALL_TURN_IN = 0.3;

/** 车身半径。两车中心近于两倍就算撞上。 */
export const BODY = 1.3;
export const BUMP_KEEP = 0.94;
/**
 * 撞车只在**真的撞上去**的那一下扣速度：法向相对速度超过这个数才算一次撞击，
 * 并且同一辆车 BUMP_COOL 秒内不重复扣。
 * 少了这两道闸，两车贴在一起时会每帧各扣 6%，几秒内一起停在赛道上——
 * 并排缠斗本来是这游戏最好看的部分，不该被判成两个人一起罚站。
 */
export const BUMP_CLOSING = 1;
export const BUMP_COOL = 0.3;

/**
 * 尾流。贴在别人车尾 14 米内能白拿 8% 上限——
 * 这是发车在最后一排的人唯一的免费资源，也是「跟车 → 出弯超掉」这条节奏的来源。
 * 有了它，名次门槛才不至于沦为「谁的发车位好」。
 */
export const DRAFT_RANGE = 14;
export const DRAFT_GAIN = 1.08;

export const COUNTDOWN = 3.2;
/** 弹射起步的窗口：读秒最后这段按喷才算，早按一帧都是抢跑。 */
export const LAUNCH_WINDOW = 0.55;
export const STALL_TIME = 0.9;
export const STALL_SPEED = 0.35;

export const TAU = Math.PI * 2;

export const clamp = (v, low, high) => (v < low ? low : v > high ? high : v);

/** 角度差折到 [-π, π]。车头、速度方向、目标方向三者相减都要过这一手。 */
export function wrapAngle(a) {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  if (v < -Math.PI) v += TAU;
  return v;
}

/** 当前气量对应哪一档喷。0 表示不够一档，松手就白攒。 */
export function tierOf(charge) {
  if (charge >= TIERS[2]) return 3;
  if (charge >= TIERS[1]) return 2;
  if (charge >= TIERS[0]) return 1;
  return 0;
}

/** 速度越快方向越钝。抓地和漂移共用这条衰减，所以两者的差距在全速段最明显。 */
export const turnScale = (speed) => 1 - TURN_FADE * clamp(speed / MAX_SPEED, 0, 1);
