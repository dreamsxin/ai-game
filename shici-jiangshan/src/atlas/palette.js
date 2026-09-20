// 矿物色带。这两条 ramp 加一个水色就是这张图的"画风"本身，
// 所以放在判定层里 —— 配色被改坏时应该由 node --test 叫出来，
// 而不是等人开一次页面用眼睛看。
//
// 全国尺度上有一条省域图遇不到的铁律：**陆地的高处不能画成深蓝**。
// 横断山、青藏东缘、陇右一大片都在三千米以上，第一版把石青一路加深到 0x2a4a7a
// （亮度 71，比这张图的海底色还暗），结果全卷西半边成了一块比海更像海的蓝，
// 而真正的东海罩着淡绢绿的水面反倒是亮的 —— 陆与海读反了。
//
// 画里本来也不靠加深来表示高：青绿山水是"高则明、远则淡"，峰顶罩青之后要提白。
// 所以两千四以上改成越高越淡、四千以上收到雪色，西边才立成高原而不是海湾。

/** 陆地高程色带（米 → 色）。谷底绢黄 → 丘陵石绿 → 高山石青 → 峰顶雪色 */
export const LAND_RAMP = [
  [0, 0xe3d6ac],     // 绢黄：三角洲、河谷
  [60, 0xd8cd96],
  [200, 0xc3c67d],
  [450, 0xa4bb70],   // 石绿起步：中原、江南都在两百米以下，所以石绿要压到这里才起
  [800, 0x7fae6b],
  [1200, 0x5b9a6e],
  [1700, 0x4f9483],
  [2400, 0x4687ad],  // 石青：色带里最暗的一档，也只到这里为止
  [3200, 0x6fa6c8],  // 往上是提白，不是加深
  [4200, 0x9fb8c0],  // 越高越淡也越灰 —— 纯白会把青藏读成一片冰湖
  [5200, 0xcbd2c4],  // 收进绢底，就是画里的留白
];


/** 海底色带（负米 → 色）。近岸淡石绿、离岸转墨绿。画里的水从不画成深蓝 */
export const SEA_RAMP = [
  [-2, 0xbcd6ca],
  [-40, 0x9ec2b6],
  [-120, 0x537f7e],
  [-380, 0x33585c],
];

/** 水面本身的绢绿色。海、湖、江共用一张材质，所以只有一个值 */
export const WATER_SILK = 0xe4efe6;

/** 湖底河床往水色上靠的那一档，退水处也还看得出曾是水 */
export const WET_BED = 0xcfe0d4;

const mixHex = (a, b, t) => {
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift) => {
    const va = (a >> shift) & 0xff;
    const vb = (b >> shift) & 0xff;
    return Math.round(va + (vb - va) * k) & 0xff;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** 在色带上取色。区间外取最近的端点色 */
export function rampHex(ramp, value) {
  for (let i = 0; i < ramp.length - 1; i++) {
    const [a, ca] = ramp[i];
    const [b, cb] = ramp[i + 1];
    if (value >= Math.min(a, b) && value <= Math.max(a, b)) {
      return mixHex(ca, cb, (value - a) / (b - a));
    }
  }
  const first = ramp[0];
  const last = ramp[ramp.length - 1];
  const rising = ramp[1][0] > ramp[0][0];
  if (rising) return value < first[0] ? first[1] : last[1];
  return value > first[0] ? first[1] : last[1];
}

/** 感知亮度，0..255。测试与配色讨论都用这一个定义 */
export const lumOf = (hex) =>
  0.2126 * ((hex >> 16) & 0xff) + 0.7152 * ((hex >> 8) & 0xff) + 0.0722 * (hex & 0xff);

/**
 * 陆地色的亮度下限：比水面暗过这条线，那块地就开始读成水。
 * 0.45 是照着事故现场定的 —— 出事的 0x2a4a7a 亮度 71，
 * 而水面绢绿亮度 236，比值 0.30；现在色带最暗的一档（石青 2400 米）是 0.53。
 */
export const LAND_LUM_FLOOR = lumOf(WATER_SILK) * 0.45;
