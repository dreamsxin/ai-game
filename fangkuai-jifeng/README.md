# 方块疾风 · Voxel Dash

3D 体素风无尽跑酷。三条车道、四种障碍、越跑越快，操作为手机触屏优先。

## 玩法

- 左右滑动变道，上滑或轻点跳跃，下滑滑铲；空中下滑会立刻砸向地面并接上滑铲。
- 木箱要跳过，横杆要滑铲，整面墙只能变道，地面缺口靠跳跃跨过。
- 连续吃金币叠加连击倍率（最高 4 倍），磁吸吸附邻道金币，护盾抵挡一次撞击。
- 距离越远速度越快，并依次穿过翠原、流沙、霓虹、虚空四个区域。

## 本地运行

```bash
npm run dev:fangkuai-jifeng   # http://127.0.0.1:4176
npm run test:fangkuai-jifeng
npm run build:fangkuai-jifeng
```

## 结构

`src/game/` 是纯逻辑层，不引用 Three.js：`rules.js` 定义体积与判定，`track.js` 由 seed
生成跑道分段，`validator.js` 逐排推进可达车道集合确认没有死局，`simulation.js` 是固定
步长主循环，`input.js` 把键盘和触摸归一成一次性输入。

`src/scene/` 是渲染层，不写回模拟状态：`voxel.js` 烘体素网格并剔除隐藏面，
`createScene.js` 负责相机、实例化障碍与金币，`readout.js` 派生 HUD 文案。

这条边界是确定性回放和单元测试的前提：同一个 seed 加同一串输入，模拟结果逐字段一致。
