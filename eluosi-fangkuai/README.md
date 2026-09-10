# 方块坠塔 · 俄罗斯方块

手机触屏优先的俄罗斯方块。标准 SRS 旋转与踢墙、7-bag 出块、幽灵落点、暂存与 T-spin 计分。

## 玩法

- 棋盘上轻点旋转，左右拖动逐格移动，向下拖住持续软降，快速下甩硬降，向上滑动存入暂存区。
- 键盘：方向键移动与软降，`↑`/`X` 顺时针、`Z`/`Ctrl` 逆时针，`Space` 硬降，`Shift`/`C` 暂存，`Esc`/`P` 暂停。
- 每消 10 行升一级，共 15 级，下落间隔从 0.8s 收紧到 0.05s。
- 一次消四行是 TETRIS，T-spin 另算，连续触发困难消行有 1.5 倍 back-to-back 加成，连消还有连击分。
- 贴地后有 0.5s 锁定延时，期间移动或旋转可以重置，最多重置 15 次。

## 本地运行

```bash
npm run dev:eluosi-fangkuai   # http://127.0.0.1:4177
npm run test:eluosi-fangkuai
npm run build:eluosi-fangkuai
```

## 结构

`src/game/` 是纯逻辑层，不碰 DOM：`pieces.js` 存七种方块的四个朝向与 SRS 踢墙表，
`board.js` 管碰撞、锁定与消行，`bag.js` 是 7-bag 出块器，`rules.js` 定义速度曲线与计分，
`simulation.js` 是固定步长主循环，`input.js` 把键盘和手势归一成同一份输入。

`src/scene/` 是表现层，不写回模拟状态：`render.js` 用 Canvas 2D 画棋盘、幽灵落点和消行闪光，
`readout.js` 派生 HUD 文案与预览格子。

这条边界让确定性回放成立：同一个 seed 加同一串输入，模拟结果逐字段一致，测试因此不需要浏览器。
