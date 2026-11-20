// 机身（机体）：**纯外观身份**。这一层不认识 three，也不认识 React。
//
// 设计边界（和机翼那套严格分开）：
// 1. 机翼回答「怎么打穿弱点」，机身回答「我开的是哪一艘」。它不给任何数值加成——
//    速度、受击面积、火力、命数一概不动。这不是偷懒：effectiveDps / bossHp 那条反推链
//    是拿 16 关逐一跑出来的，机型一旦带数值，配平就得整条重算；而「选了重型机就更耐打」
//    在弹幕游戏里也只是把难度旋钮换成皮肤按钮。
// 2. 机身跨关 carry、掉命保留、重试本章保留：它是玩家的审美选择，不该被失败惩罚。
//    重开一局才回到默认的 H1。
// 3. 表现层按 code 现造模型与 2D 图标；同一个 code 在场上与选机面板里必须是同一艘船。

/**
 * 三型机体。tagline 是选机卡片上那一句；brief 是点开之前的身份说明。
 * H2「蚀影」照着 Void Phantoms 的 ECLIPSE WRAITH 级战列舰做：
 * 楔形尖艏、暗紫装甲分层、纵向光带、环形舰桥、尖塔群、外张式引擎。
 */
export const HULLS = {
  H1: {
    code: 'H1',
    name: '玄鸟',
    title: '标准机',
    tagline: '均衡 · 传承型',
    brief: '玄鸟骨架，轻装快反。第一架从这里起飞。',
  },
  H2: {
    code: 'H2',
    name: '蚀影',
    title: '战列机',
    tagline: '重装 · 舰桥环',
    brief: 'ECLIPSE WRAITH 级：环形舰桥压着尖塔群，暗紫装甲一路铺到楔形舰艏。',
  },
  H3: {
    code: 'H3',
    name: '游隼',
    title: '截击机',
    tagline: '轻锋 · 双尾翼',
    brief: '削掉装甲的轻量壳，把骨架和双尾翼露出来。更快的感觉，不换更快的手感。',
  },
};

export const HULL_CODES = Object.keys(HULLS);
export const DEFAULT_HULL = 'H1';

/** 坏数据兜底：认不出来的 code 一律回默认机，不让一条脏存档把开局炸掉。 */
export const isHull = (code) => Object.prototype.hasOwnProperty.call(HULLS, code);
export const hullSpec = (code) => (isHull(code) ? HULLS[code] : HULLS[DEFAULT_HULL]);

/** 状态里存的永远是合法 code；表现层读这个而不是自己再判一次。 */
export const normalizeHull = (code) => hullSpec(code).code;
