// 机器人大脑。**同一个大脑，一个 skill 参数**：对手用它，测试里也用它接管玩家，
// 所以「这一关过得去吗」和「档位真的是难度吗」这两个问题能靠跑几百局来回答，而不是靠手感。
//
// 档位不是「开得慢」。低档的笨长在三个具体的决策上，每一条都能在数据里看见：
// 1. **忘了漂**——弯到眼前才想起来拉手刹，甚至整个弯都在抓地推头，于是没气也没速度。
// 2. **乱喷**——把大喷按在弯心，一脚踩进草地。
// 3. **抢跑**——读秒还剩一秒就按弹射，罚站 0.9 秒。
// 这三条都是「氮气经济」上的失误，和赛道自己的难度是同一种语言，
// 所以调档位和调弯道密度调的是同一件事，测试才能拿它们互相对照。

import { LAUNCH_WINDOW, TIERS, clamp, wrapAngle } from './rules.js';

/** 确定性噪声。机器人的犹豫必须可复现，否则同一关跑两次结论就不一样。 */
function hash(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const brainOf = (kart) => {
  if (!kart.brain) kart.brain = { launched: false, drifting: false };
  return kart.brain;
};

/**
 * 一帧的操作。只读车与赛道，不写回任何判定字段——
 * 唯一的例外是 kart.brain 这点私有记忆（上一帧在不在漂、弹射按过没有）。
 */
export function botInput(kart, course, { skill = 1, countdown = 0, tick = 0, seed = 0 } = {}) {
  const brain = brainOf(kart);
  // seed 是本关的第几次尝试。掺进每一处噪声里，重开一次对手的失误就换一批位置——
  // 赛道是固定的，所以「这一关的样子」全靠对手的性格抖动来换。
  const who = kart.id + 1 + seed * 7;

  if (countdown > 0) {
    // 弹射起步：满档按在窗口正中，档位越低越提早，早过窗口就是抢跑。
    const press = LAUNCH_WINDOW * 0.5 + (1 - skill) * 0.9 * hash(who, 7);
    const now = countdown <= press && !brain.launched;
    if (now) brain.launched = true;
    return { steer: 0, drift: false, boost: now };
  }

  const jitter = hash(who + 3, Math.floor(tick / 18)) * 2 - 1;
  const look = 8 + kart.speed * (0.3 + 0.2 * skill);
  const curvNear = course.curvatureAhead(kart.s, 10 + kart.speed * 0.4);
  const curvFar = course.curvatureAhead(kart.s + 22, 26);

  const aim = course.pointAt(kart.s + look);
  // 往弯内切一点。切多少跟着曲率走，紧弯切得多——这就是这套大脑全部的「走线」。
  const inside = clamp(curvNear * 45, -1, 1) * course.half * 0.34;
  let tx = aim.x - Math.sin(aim.heading) * inside;
  let ty = aim.y + Math.cos(aim.heading) * inside;
  if (kart.offTrack) {
    // 已经在草里就别想走线了，先回赛道：目标换成近处的中心线。
    const back = course.pointAt(kart.s + 6 + kart.speed * 0.15);
    tx = back.x;
    ty = back.y;
  }

  // 方向：把车头指向前瞻点。误差乘一个跟档位有关的增益，低档反应更钝也更抖。
  //
  // 这里试过纯追踪（pure pursuit，按需要的曲率算方向盘），也试过用速度方向而不是车头算误差。
  // 两种都更「正确」，但在这套没有刹车的物理里都更差：
  // 前者让机器人不敢要够大的角度，后者让漂移里的方向盘和漂移角互相喂，车会蛇形。
  // 最朴素的这一版反而跑得最稳——它也就是玩家在手机上会做的事：看着弯，把方向按住。
  const gain = 1.6 + 1.2 * skill;
  let steer = clamp(wrapAngle(Math.atan2(ty - kart.y, tx - kart.x) - kart.heading) * gain, -1, 1);
  steer = clamp(steer + jitter * (1 - skill) * 0.3, -1, 1);

  const enter = 0.03 - 0.017 * skill;
  const fast = kart.speed > 14;
  let drift = brain.drifting
    ? fast && Math.abs(curvNear) > enter * 0.55
    : fast && Math.abs(curvNear) > enter && Math.abs(steer) > 0.2;
  // 攒到大喷就**立刻松手落袋**，下一帧再拉回来接连喷。
  // 一直横着不松是新手最常见的亏法：气早就顶到 CHARGE_MAX，多漂的那几秒一分钱都没多攒，
  // 而松一下就能把这一档存进三格里、并且开出连喷窗口。低档想不到这一层。
  if (drift && skill >= 0.5 && kart.charge >= TIERS[2]) drift = false;
  // 手里三档全满、气也顶到头，就没必要再横着走了：漂移本身不赚，只有喷出去才赚回来。
  if (kart.tokens.length >= 3 && kart.charge >= 0.9) drift = false;
  if (kart.offTrack) drift = false;
  // 整个弯都忘了漂：低档最主要的失误，也是它最像人的地方。
  const corner = Math.floor(kart.progress / 40);
  if (drift && hash(who * 13 + 1, corner) < (1 - skill) * 0.5) drift = false;
  brain.drifting = drift;
  // 漂起来之后**主动多打一点方向**：把车尾甩得更横，气才攒得快。
  // 但也就多打一点——横过头会把车推到弯外去，那笔账比攒到的气更贵。
  if (drift) steer = clamp(steer * (1 + 0.35 * skill), -1, 1);

  let boost = false;
  if (kart.tokens.length > 0 && kart.boostTime <= 0 && kart.stall <= 0) {
    // 「直道」是相对这条赛道说的：门槛取全场平均曲率。
    // 写成固定值会让弯多的图永远等不到一段够直的路，一整局的气全烂在手里。
    const straight = Math.abs(curvFar) < course.meanCurv && !drift && !kart.offTrack;
    // 满档只喷相对直的那几段，手里攒到两档才破例；低档随手就喷，喷在弯里就飞出去。
    boost = skill >= 0.6 ? straight || kart.tokens.length >= 2 : hash(who + 5, Math.floor(tick / 24)) < 0.3;
  }

  return { steer, drift, boost };
}
