# 霓界吞噬

AI 编排立体几何世界的即时动作策略吞噬游戏。玩家加载后立即操控发光圆球滚动，以冲刺、引力牵引和相位穿越改变路线，击破核心锚点并完成浑天仪跃迁。

## 本地运行

在仓库根目录执行：

```bash
npm install
npm run dev:nijie-tunshi
```

打开 <http://localhost:4175>。

## 操作

- `WASD` / 方向键：滚动
- `Space`：冲刺并撞碎标有 `DASH` 的晶板
- 按住 `E`：引力牵引（质量 12 解锁）
- `Shift`：相位穿越（质量 32 解锁）
- `P` / `Escape`：暂停

移动端使用左侧摇杆和右侧三枚能力按钮。游戏无需规划界面，加载后立即开始。

## 验证

```bash
npm run test:nijie-tunshi
npm run build:nijie-tunshi
```

当前版本是固定种子核心原型。关卡配方和生成验证接口已在规划中，后续接入 AI 编排服务。
