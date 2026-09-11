// 全局物理常量与地面材质表。这一层只放数字和查表函数，不含状态。
export const GRAVITY = 9.81;
// 渲染帧率不稳，但悬挂弹簧很硬：物理固定步长必须比一帧更细，否则弹簧会自激振荡。
export const PHYS_STEP = 1 / 120;
export const MAX_SUBSTEPS = 8;
export const AIR_DENSITY = 1.2;

// 地面材质。grip 是摩擦系数上限，roll 是滚动阻力系数，
// sink 是空载路面本身允许的下陷深度（米），ruts 是这块地被反复碾压后还能再陷多深。
// 硬核感全靠 ruts：第一趟能过的泥塘，第三趟就成了陷车坑。
export const MATERIALS = [
  { id: 'rock', name: '硬岩', grip: 1.05, roll: 0.015, sink: 0, ruts: 0, color: 0x6d6f6a },
  { id: 'gravel', name: '碎石', grip: 0.95, roll: 0.022, sink: 0.02, ruts: 0.03, color: 0x7d7a70 },
  { id: 'dirt', name: '土路', grip: 0.8, roll: 0.035, sink: 0.07, ruts: 0.12, color: 0x6b5638 },
  { id: 'grass', name: '草坡', grip: 0.7, roll: 0.045, sink: 0.09, ruts: 0.18, color: 0x4a5c32 },
  { id: 'mud', name: '泥地', grip: 0.5, roll: 0.055, sink: 0.24, ruts: 0.34, color: 0x4c3a24 },
  { id: 'swamp', name: '深泥沼', grip: 0.34, roll: 0.08, sink: 0.46, ruts: 0.6, color: 0x33291a },
  { id: 'water', name: '涉水', grip: 0.4, roll: 0.07, sink: 0.12, ruts: 0.05, color: 0x2c4a52 },
];

export const MAT_ROCK = 0;
export const MAT_GRAVEL = 1;
export const MAT_DIRT = 2;
export const MAT_GRASS = 3;
export const MAT_MUD = 4;
export const MAT_SWAMP = 5;
export const MAT_WATER = 6;

export const materialOf = (index) => MATERIALS[index] ?? MATERIALS[MAT_DIRT];
export const materialIndexOf = (id) => {
  const found = MATERIALS.findIndex((material) => material.id === id);
  return found < 0 ? MAT_DIRT : found;
};

// 轮胎接地压强换算下陷深度时的地面承载力（经验值，不是真实土力学）。
// 空车在新鲜泥地上还浮着，满载就压到底：这条曲线决定了「装货前先想清楚」。
export const BEARING = 210000;
// 下陷带来的额外阻力：陷得越深推开的泥越多，一次项 + 平方项一起涨。
// 这两个系数必须明显小于材质摩擦系数，否则新鲜沼泽都会变成谁也过不去的墙。
export const SINK_DRAG = 0.12;
export const BULLDOZE_DRAG = 0.15;
// 下陷同时吃掉抓地力：轮子埋在泥里，胎面接触的是泥不是地。
export const SINK_GRIP_LOSS = 0.8;

/** 下陷深度对摩擦系数的折扣。0.3 是兜底，完全埋住也还能靠花纹刨一点。 */
export function gripFromSink(grip, sink, radius) {
  const buried = Math.min(1, sink / Math.max(0.05, radius * 0.9));
  return grip * Math.max(0.3, 1 - SINK_GRIP_LOSS * buried * buried);
}

// 涉水：进水越深越掉功率，超过 drownDepth 就熄火。排气管高度由卡车规格给。
export const WATER_POWER_LOSS = 1.4;

// 车损：撞击超过这个法向冲量才算数，免得正常压过石头也在掉血。
export const IMPACT_THRESHOLD = 6.5;
export const IMPACT_DAMAGE = 0.0022;
// 翻车判定：车顶朝下持续这么久就算翻了，短暂两轮离地不算。
export const ROLLOVER_TILT = 1.35;
export const ROLLOVER_SECONDS = 2.2;

// 绞盘。射程内才能挂钩，收线速度慢是刻意的：脱困本来就该磨人。
export const WINCH_RANGE = 16;
export const WINCH_SPEED = 1.1;
export const WINCH_FORCE = 92000;
export const WINCH_STIFFNESS = 26000;
export const WINCH_DAMPING = 2600;

// 任务：到点判定半径，以及交付时允许的最大车速（得停稳才算卸货）。
export const ARRIVE_RADIUS = 9;
export const ARRIVE_SPEED = 1.6;

// 油耗（升/秒）。刻意比真车费油：一箱油大约十分钟重载，才有省着开的必要。
export const FUEL_IDLE_RATE = 0.06;
export const FUEL_LOAD_RATE = 0.42;
export const FUEL_AWD_PENALTY = 1.18;

/** 三星按耗时给，par 是关卡设计的目标秒数。 */
export function resultStars(seconds, par) {
  if (seconds <= par) return 3;
  if (seconds <= par * 1.45) return 2;
  return 1;
}

export const STATUS_LABELS = {
  ready: '待发车',
  driving: '运输中',
  stuck: '陷车',
  won: '交付完成',
  lost: '任务失败',
};
