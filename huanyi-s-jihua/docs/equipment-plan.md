# 装备系统规划：以「僚机」为首发

> **状态：已实现（P0–P2），规划稿保留作设计依据。**
> 三个决策点按推荐落地；第 8 节记录实现记录、两个待定项的最终决定，以及与本稿的偏差。
>
> 目标：在机翼之外开**第二个装备槽**，用「僚机」作第一型装备，同时提升可玩性与观赏性，
> 且不破坏这一版已经稳住的配平链与「看到的宽度 = 判定宽度」这条视觉契约。

---

## 1. 现状核准（读码结论，不是凭印象）

### 1.1 分层

| 层 | 目录 | 性质 |
| --- | --- | --- |
| 判定层 | `src/game/` | 纯函数 / 纯数据，Node 里可跑测试，不认识 three 与 React |
| 表现层 | `src/scene/`、`src/App.jsx` | three.js 模型与渲染、HUD、音效、输入 |
| 存档 | `src/game/progress.js` | localStorage，只记「打到第几关 / 每关几星 / 通关次数」 |
| 测试 | `test/` | 255 条断言，`node --test test/*.test.js` |

### 1.2 五条必须守住的不变量

| # | 不变量 | 出处 | 为什么不能被装备打破 |
| --- | --- | --- | --- |
| 1 | Boss 血量 = `effectiveDps(推荐机翼, 弱点) × ttk × HIT_RATE × PATTERN_HIT` | `levels.js:22-28` | 全 16 关难度由这一条反推，手调数字会失准 |
| 2 | `effectiveDps` 只算「打在同一个 Boss 身上」的机翼火力，不含过载、不含镜像 | `wings.js:435-443` | 装备火力若混进来，「选错机翼 = 漫长的消耗」这条地基会塌 |
| 3 | 拿错机翼的 Boss 战时长 > 拿对的 1.7 倍；带对的时长落在 `4s ~ ttk×1.6` | `playthrough.test.js:58-89` | 装备的固定伤害会**稀释这个比值**，让弱点机制失效 |
| 4 | 翼展 12.8 格既是判定宽度，也是看到的宽度 | `rules.js:19`、`models.test.js:51`、`visuals.test.js:74` | 上一轮刚为「Sprite / 灯晕越界」修过一轮，僚机平铺在两侧会前功尽弃 |
| 5 | 存档不记局内状态 | `progress.js:1-9` | 记装备就等于把「一命到底」的紧张感存下来 |

### 1.3 现有管线（装备要接进来的地方）

| 管线 | 位置 | 现状 |
| --- | --- | --- |
| 状态 | `simulation.js:69-82` `makeShip`、`85-131` `loadLevel` | `ship` 带 `wing / tier / cool / invuln / dive / lock / orbAngle / overdrive`；`loadLevel` 带 `entryWing` 供复活还原 |
| 跨关 | `simulation.js:167-192` `advance`、`:200+` `retryChapter` | `carry` 只带 `wing / tier / lives / score / baseScore / …` |
| 开火 | `simulation.js:280-329` `fireShip` | 按 `wingAtTier` 一轮 `volley` 生成 `shots`，每发带 `tier / surge` 供表现层放大 |
| 掉落 | `simulation.js:699-707`（运载火箭）、`:369-394`（弃翼）、`:794-799`（挨打掉翼） | `state.drops` **全是机翼**：`{ id, code, tier, x, y, vy, life, grace, mine }` |
| 拾取 | `simulation.js:725-775` | 单循环，全部按机翼处理；`CATCH_R = 6.5`，内含同频共振 / 换装 / 过载三条分支 |
| 受击 | `simulation.js:228-232` `hitBoxes` | 只有「机身小方块 + 机翼横条」两盒 |
| 挡弹 | `simulation.js:242-254` `orbsOf`、`:256` `circleHit` | 铁球绕机转，蹭掉敌弹并计入连消——**这是装备可以照抄的现成范式** |
| 事件出口 | `simulation.js` `effects[]` → `render.js:387+` `notify` → `audio.js` `soundsFor` | 表现层与音效只认 `effect.type`，新增事件要在两处都登记 |
| 渲染挂点 | `render.js:107` `ship` group、`:487` `syncShip`、`:840` `syncDrops`、`:920+` `syncShots` | 对象池复用，`visible/scale/opacity` 一律**绝对值覆盖** |
| 模型工厂 | `models.js:42` `createPool`、`:236` `makeShip({ghost})`、`:910` `makeDrop`、`:998` `makeShot(kind)` | `makeDrop` 画的是菱形机翼道具，装备道具必须另给一个形状 |
| 界面 | `App.jsx:603+` 选翼面板（`selecting`）、`readout.js:35-` 机翼文案 | 手机上多一步弹窗就是一次流失 |

---

## 2. 三套方案对比

| 维度 | A 硬编码一个僚机 | **B 装备槽框架 + 僚机首发（推荐）** | C 纯观赏编队 |
| --- | --- | --- | --- |
| 判定层改动 | 中（改 `drops` / `carry` / `fireShip`） | 中大（多一个 `gear.js` 与通用管线） | 极小（只在表现层画跟随小机） |
| 可玩性增量 | 一次性，加第二件要重改 | 表驱动，后续加护盾 / 雷达只加数据 | 几乎为零 |
| 观赏性 | 中 | 高（一型一形一色、编队插值、入列演出） | 高，但没有玩法支撑，看两局就腻 |
| Boss 配平风险 | 中 | **可控**：框架里就把「装备不进 `effectiveDps`」写成约定 | 无 |
| 视觉宽度风险 | 中 | **可控**：编队纵向排布，不越出 12.8 | 中（同样会越界） |
| 测试成本 | 低 | 中（新增 `gear.test.js` + 4 处回归） | 低 |
| 后续扩展 | 差 | 好 | 不适用 |

**选 B**。理由：用户说的是「引入新的装备，比如僚机」——「比如」意味着要的是一条能继续加装备的路，
而不是一次性特化；而且 B 能把配平约束在框架层一次性定死，比 A 后面每件装备单独打补丁安全。

---

## 3. 推荐方案详细设计

### 3.1 三条设计原则

1. **装备是第二槽，不取代机翼。** 机翼回答「怎么打穿 Boss 弱点」，装备回答「怎么活下来、怎么看得爽」。
   两条轴正交，`levels.js` 的 `briefing().pick` 永远只推机翼。
2. **装备火力不进 Boss 配平。** 见 3.5，这是整套方案能否落地的关键。
3. **装备不进存档。** 和机翼一样只在本局内跨关 `carry`；`progress.js` 一行不改。

### 3.2 数据模型：新增 `src/game/gear.js`（纯数据 + 纯函数）

```js
export const GEAR = {
  // 首发三型僚机，一型一形一色（沿用上一轮 WING_OUTLINES / WING_SKINS 的做法）
  E1: { code, name, kind: 'escort', family: 'escort', formation: [...], fire: {...}, aura: {...} },
  // kind 预留：'escort' | 'shield' | 'sensor'，框架只认 kind 不认具体型号
};
export const gearAtLevel = (code, level) => ...;   // 编队数 / 数值随等级
export const escortsOf = (ship) => ...;            // 编队坐标，纯函数、可测
```

字段建议：`formation`（相对主机的 dx/dy，纵向雁形）、`fire`（僚机自己的低伤 volley）、
`aura`（近身消弹半径）、`hue`（识别色，避开敌弹红区与 21 型机翼色相）。

### 3.3 判定层改动清单

| 文件 | 改动 | 风险 |
| --- | --- | --- |
| `src/game/gear.js` **新增** | `GEAR` 表、`gearAtLevel`、`escortsOf`、`GEAR_CODES` | 无，纯函数 |
| `src/game/rules.js` | 增 `GEAR_*` 常量：编队跟随系数、僚机弹速/伤害上限、消弹半径、拾取优先级 | 只增不改 |
| `src/game/simulation.js` | `makeShip` / `loadLevel` 加 `gear / gearLevel / entryGear`；`advance` / `retryChapter` 的 `carry`；`drops` 加 `kind: 'wing' | 'gear'`（旧 drop 默认 `'wing'` 兼容）；拾取循环按 kind 分支；`fireShip` 追加僚机弹（带 `source: 'gear'`）；新增 `gearCatch / gearSync / gearLost` effects | **最高**：拾取循环现有四条分支，改动要逐条补测试 |
| `src/game/levels.js` | 关卡数据加 `gearDrops`；`carrier` 波次可带 `gear`；`briefing` 加 `gearCodes` | `bossHp` / `HIT_RATE` / `PATTERN_HIT` **一行不动** |
| `src/game/wings.js` | **不改** | `effectiveDps` 保持不含装备 |
| `src/game/progress.js` | **不改** | 存档边界不变 |
| `src/game/boss.js` | 命中段按 `shot.source === 'gear'` 走 `chip`（见 3.5） | 需回归 `playthrough.test.js` |

### 3.4 表现层改动清单

| 文件 | 改动 |
| --- | --- |
| `src/scene/models.js` | `makeEscort(code)`：缩小版乘波体 + 一型一件识别件；`makeGearDrop()`：**六边形/环形**道具，和菱形机翼一眼分开；`createPool` 池化，`visible/scale/opacity` 绝对值覆盖 |
| `src/scene/render.js` | 新增 `syncEscorts(state, dt)`：编队插值跟随、入列光弧、拖尾残影、独立炮口闪光；`syncDrops` 按 `kind` 分流；`syncShots` 按 `source` 给僚机弹细一档的色与芯；`notify` 登记三种新事件 |
| `src/scene/palette.js` | `GEAR_COLORS`：避开敌弹红区（≈344°）与机翼 21 个色相，用明度/饱和度与机翼区分 |
| `src/scene/readout.js` | `gearLabel(ship)`、`gearSyncLabel(ship)`，HUD 第二行短标签 |
| `src/App.jsx` | 选翼面板**同一步**加一行装备卡（不新增弹窗）；首屏折叠区补一句设定；HUD 加装备徽标 |
| `src/scene/audio.js` | `soundsFor` 给 `gearCatch / gearSync / gearLost` 配合成音（复用现有振荡器） |
| `src/styles.css` | 装备卡、HUD 徽标、道具区分样式 |

### 3.5 平衡设计：僚机火力为什么只能算 chip

`playthrough.test.js:75-89` 断言「拿错机翼打 Boss 要比拿对慢 1.7 倍以上」，靠的是
`WEAKNESS[kind].chip`（core/side/low 只有 0.16~0.2）。如果僚机给一条**无条件生效**的固定伤害，
拿错机翼时这条固定伤害占比就变大，倍率会被稀释到 1.7 以下，测试红、地基也真的塌了。

处理办法（**推荐第 1 条**）：

| 做法 | 效果 | 代价 |
| --- | --- | --- |
| **僚机弹对 Boss 一律按 chip 结算** | `effectiveDps` 与 `bossHp` 都不用改；玩家看得到僚机在打、在消弹，但 Boss 战答案仍是「选对机翼」 | 需在 `boss.js` 命中段加一个 `source` 判断 |
| 僚机弹不判定 Boss 命中 | 更干净，但玩家会看到子弹穿过 Boss，观感差 | 需解释设定 |
| 重算 `bossHp`、放宽 TTK 断言 | 僚机正式进配平 | 改动最大，且玩家可能没带装备 → 难度随装备有无漂移，**不推荐** |

僚机的**主要价值放在生存与连消**：给一圈比铁球小的近身消弹 `aura`（照抄
`orbsOf` / `circleHit` 的范式），蹭掉的敌弹照样计入连消与分数。这样它提升容错与观赏，
却不碰火力配平。

**受击面积**：僚机**不进 `hitBoxes`**（不吃伤害），否则「带翼更容易被打中」这条教学被稀释。
可选增强：编队数 ≥ 2 时，僚机替主机挡一发并消耗一架——这是很有嚼头的取舍，但属于 P3。

### 3.6 装备成长轴（刻意不与机翼共用）

机翼的「同频共振 / Mk.I→III / 相位冲击 / 过载」是这游戏的身份，装备再抄一遍会稀释它。
建议装备走另一条轴：

- 捡到**同型号**装备 → **编队数 1 → 2 → 3**（上限 3），**不叫阶级、不放相位冲击**；
- 换型号 → 编队重置为 1（相位编码不兼容的同一套说法，成本为零）；
- 掉命 / 重试本章 → 装备清空（与机翼一致，「投资跟着装备走」）；
- 演出用「编队合流」：新僚机从屏幕外俯冲入列、拉一道连线光弧，和升阶的能量翼展开明显不同。

### 3.7 观赏性清单（也是这一轮的主要诉求）

1. **纵向雁形编队**：僚机挂主机**后侧**（建议 `dx ≈ ±5.5`、`dy ≈ +7~11`），不是左右平铺。
   理由见 1.2 第 4 条——左右平铺会让「看到的宽度」超过 12.8 格判定宽度，
   上一轮刚修掉的坑会原样回来。需在 `visuals.test.js` 加一条「僚机整体 |x| ≤ 6.4（含光晕）」。
2. **延迟跟随**：`lerp` 插值 + 急转弯时拉开、回位时收拢，编队像有惯性而不是贴贴图。
3. **一型一形一色**：三型僚机沿用上一轮 `WING_OUTLINES` / `WING_SKINS` 的做法，各一条轮廓、一个色相。
4. **入列 / 合流 / 分裂**：捡到时俯冲 + 光弧；编队数变化时收拢与散开。
5. **弹道辨识**：僚机弹细一档、独立色、独立炮口闪光；`syncShots` 仍按 velocity 定向。
6. **拖尾**：低不透明度残影（复用 `makeGhostHull` 思路），加色混合别叠过 1（上一轮白斑的教训）。

### 3.8 明确不改的东西

`levels.js` 的 `bossHp` / `HIT_RATE` / `PATTERN_HIT`、`wings.js` 的 `effectiveDps` 与 21 型机翼表、
`progress.js` 的存档结构、`rules.js` 的 `WING_HALF_W = 6.4` 与 `hitBoxes`、
`playthrough.test.js` 的断言阈值、`vite.config.js` 的相对 base 与发布目录。

---

## 4. 分阶段落地

| 期 | 内容 | 验收 |
| --- | --- | --- |
| **P0** | `gear.js` + 判定层状态 / `carry` / `drops` kind 分流 / 拾取分支；**表现层先不动** | 新增 `gear.test.js` 全绿，原有 255 条断言一条不红 |
| **P1** | 一型僚机可玩：掉落 → 拾取 → 编队数升阶 → HUD 读数；先用占位模型 | `wiring.test.js` 走通；无头浏览器实拍「捡到 → 入列 → 开火」 |
| **P2** | 观赏性：三型一型一形一色、编队插值、入列光弧、拖尾、音效、道具外形区分 | 21 格装备图鉴截图 + 游戏内实拍，检查无过曝白斑 / 越界 |
| **P3** | 加第二件非僚机装备（护盾或雷达）验证框架可扩展；更新 README；提交并重新发布 | `npm test` 全绿、`build` 通过、从同一 `dist/` 发布保持分享链接 |

发布纪律沿用现约定：必须从 `huanyi-s-jihua/dist` 目录发布，链接才保持不变。

---

## 5. 测试计划

| 文件 | 新增断言 |
| --- | --- |
| `test/gear.test.js`（新增） | 编队坐标为纯函数且纵向不越界；升阶上限 3；对 Boss 走 chip；僚机不进 `hitBoxes`；跨关 `carry` 继承 / 重试清零；拾取时机翼优先；换型号重置 |
| `test/playthrough.test.js` | **不改断言**，作为回归跑：TTK 区间、对错机翼 1.7 倍、16 关可通 |
| `test/levels.test.js` | `briefing().gearCodes` 与关卡数据一致；`bossHp` 数值逐关不变（快照式断言） |
| `test/wiring.test.js` | `MODULES` 加 `gear.js`；「出击 → 选翼 → 世界动了」补一条带装备的路径 |
| `test/models.test.js` | 僚机尺寸小于主机；三型轮廓 / 颜色两两不同；僚机模型不撑大 `ship` 的 `Box3` |
| `test/visuals.test.js` | 僚机整体 |x| ≤ 6.4（含光晕）；僚机弹与主机弹可辨；对象池绝对值覆盖 |

---

## 6. 风险与回退

| 风险 | 触发点 | 预案 |
| --- | --- | --- |
| 拾取循环改坏，同频共振失效 | `simulation.js:725-775` 四条分支 | P0 先只加 `kind` 字段并让旧路径原样跑通，再开分支；`resonance.test.js` 14 条守着 |
| 同一帧翼与装备都在 `CATCH_R` 内 | 拾取 | 明确「机翼优先、近者次之」，写进 `gear.test.js` |
| `nextId` 在多个分支复用导致 id 撞车 | 掉落生成 | 新增掉落统一走一个 `spawnDrop()` 辅助函数 |
| 僚机把视觉宽度撑过 12.8 | 编队坐标 | 纵向雁形 + `visuals.test.js` 越界断言 |
| 加色混叠烧成白斑 | 拖尾 / 光弧 | 沿用上一轮：分层压 alpha、`driven` 标记跳过闪烁、实机截图复核 |
| 装备固定伤害稀释弱点惩罚 | Boss 命中 | 3.5 的 chip 结算 + `playthrough.test.js` 回归 |

回退成本：P0/P1 都保持「装备槽可为空」，`gear` 为 `null` 时所有新分支短路，
相当于旧版；任何一期出问题直接不挂装备即可回退，不必回滚机翼系统。

---

## 7. 待确认的三个决策点

1. **装备要不要「同型号升阶」？**
   推荐：要，但改成「编队数 1→3」，不叫阶级、不放相位冲击（3.6）。
   备选：完全不成长、只换型号 —— 更简单，但少一条留存线。
2. **僚机火力对 Boss 怎么处理？**
   推荐：只按 `chip` 结算，`effectiveDps` / `bossHp` 一行不动（3.5）。
   备选（不推荐）：重算 `bossHp` 并放宽 TTK 断言，让装备正式进配平 —— 会让难度随「有没有捡到装备」漂移。
3. **装备选择放哪一步？**
   推荐：和选翼**同一个面板**加一行卡片，不新增弹窗（手机上多一步就是流失）。
   备选：独立「第 3 步」—— 仪式感更强，但多一次点击。

另外两个可以在实现时再定的小项：僚机是否替主机挡一发（消耗编队数）、掉命时装备清零还是掉一级。

---

## 8. 实现记录（2026-11-08）

### 8.1 三个决策点：全部按推荐

1. 装备走**编队数 1→3**，不叫阶级、不放相位冲击。
2. 僚机弹对 Boss **只按 chip**；`effectiveDps`、`bossHp`、`HIT_RATE`、`PATTERN_HIT`、
   `playthrough.test.js` 的阈值一行没改。为了能直接指着断言，把这条倍率抽成
   `simulation.js` 导出的 `bossShotMultiplier(weak, shot)`。
3. 装备卡摆在**选翼面板同一屏**，且从「机翼列表之后」上移到「出击键正下方」——
   实拍发现放列表后面要滚一屏才看得到，等于把「还能带僚机」藏了起来。

### 8.2 两个待定项的最终决定

| 项 | 决定 | 理由 |
| --- | --- | --- |
| 替主机挡一发 | **要**。每次捡到装备（含合流）补一次 `gearGuard`；裸机挨致命一击时消耗一架僚机挡下，给 1.15 秒无敌 | 带翼被击中仍只掉翼——僚机是最后一道防线，不是常驻免费护盾。机会用完就必须真挨打，否则「掉命掉一级」永远不会发生，两条规则会互斥 |
| 掉命时装备 | **掉一级，不清零**；掉到 0 才清空；**重试本章**整槽作废 | 这一版刚补了跨章补给与本章重试，「掉一次命失去全部投资」会把人推进死亡螺旋；掉一级仍是实打实的代价，重试则是更重的一档 |

### 8.3 与本稿的偏差（都是实现时查出来的）

- **不做 `entryGear`**。复活若还原成进关时的满编队，「掉一级」会被偷偷补回来，惩罚就成了假的。
  复活只还原机翼（`entryWing` Mk.I），装备保留降级后的状态。
- **装备主题按章注入**，没有逐关改 16 份 wave 数据：
  `levels.js` 的 `CHAPTER_GEAR = ['E1','E2','E3','E3']` 给每关写 `gearDrops`，
  `simulation.js` 只把装备挂在本关第一波运载火箭的头一架身上，一关一件。
- **`test/bot.js` 要认得 `kind`**：否则机器人把 E1 当成「打不进弱点的机翼」而绕着走，
  playthrough 量的就不是机翼效率了。`refuseDrops` 仍清空全部 drops，回归照旧。
- **僚机高度纯表现层抬高 1.35 格、编队纵向拉到 12.6～19 格**：实拍发现单架编队贴在
  主机尾焰里，看上去只是尾焰末端一团青光。判定坐标同步拉远（不靠表现层偷偷挪），
  并 `clamp` 在 `FIELD_H - 5`，贴底飞行时编队收拢。
- **选翼面板打开时隐藏两条 HUD meter**：它们透出半透明遮罩，和「选择机翼」的标题挤成糊字。

### 8.4 验证

`npm test` **280/280**（新增 `gear.test.js` 18 条，`models/visuals/palette/wiring` 共 7 条回归）；
`npm run build` 通过；无头 Chrome + CDP 实拍「出击 → 选 E1 → 带 W 机翼开局」无页面报错，
HUD 显示 `E1 雁翎 ×1 · 可替挡`，僚机与主机的连线光弧可见；另做一屏装备图鉴确认
三型僚机一型一形一色、六边形收纳舱与菱形机翼道具一眼可分、没有过曝白斑或越界。
（后续第 9 轮把连线删了、阵型改了，这一节保留作当时的验收记录。）

### 8.5 P3 未做的一件

原计划加第二件**非僚机**装备（护盾／雷达）验证框架可扩展，这一轮没做。
框架已把口子留好：`GEAR[code].kind`、表驱动的 `gearSpec()`、`drops.kind` 分流、
按 `kind` 分池的渲染；但「非僚机」装备的判定分支与外形仍需单独设计，
不宜在这一轮顺手塞一个半成品。当前三型都是 `kind: 'escort'`。

## 9. 后续迭代：自主索敌、三型阵型与巡航导弹（2026-11-08）

用户先反馈「僚机一直跟在正后方是不是不太对，应该可以自动走位射击敌舰」，
随后追加「按僚机种类区分左右 / 前方 / 后方 / 环绕，不用加一根线绑着，
可以加入一些僚机的子弹有类似跟踪的能力，巡航导弹」。

### 9.1 判定层

- `escortWorld(state)`：Boss 优先、其余按离玩家最近排，只认主机上方且存活的目标。纯函数。
- `escortsOf(ship, world)`：**不传 world 时行为与旧版逐字段一致**（停机位，旧调用方不受影响）；
  传 world 时按 `GEAR[code].formation` 展开：`flank` 左右侧翼（18 格）、
  `sortie` 周期性前出（最多 30 格）再回防、`orbit` 绕主机环绕（半径 15 格）。
  没目标时三型一起回后方停机位——四种站位齐了。走位是时间的纯函数，不存状态。
- `escortWithinSpan` 继续守护卫位的 12.8 格；新增 `escortWithinField` 守伴飞位
  不出场地与活动半径（34 格）。
- `steerHoming(shot, point, dt)`：转向速率 `HOMING_TURN = 3.2 rad/s` 封顶、速度大小不变，
  只有 E2 的弹带 `homing`。`simulation.js` 在 shots 推进里逐帧调用，目标表与僚机索敌
  共用同一份 `escortView`，开火与消弹圈因此始终在同一位置。

### 9.2 表现层

- 删掉主机到僚机的 `linkMesh` 指挥线：三型散开后它会把编队重新「绑」成挂件，
  环绕那一路尤其会被切成一团。`wiring.test.js` 直接读源码守这条。
- `shotKey` 新增 `cruise:E2` 分池；`makeShot('cruise')` 是细长箭体 + 分叉尾翼 + 双股尾焰，
  整枚按 `vx/vy` 定向、尾焰错相喷，拐弯读得出来。
- 僚机按与主机的距离等比放大一点、提亮识别光晕、多给一两粒拖尾星火，
  解决前出 / 环绕时只剩几个像素的问题。判定坐标不变，僚机不进 `hitBoxes`。

### 9.3 配平不变

`chipOnly` 恒在，`bossShotMultiplier` 对装备弹短路到 chip；弹数恒等于编队数；
`effectiveDps` / `bossHp` / `playthrough` 的 TTK 断言一行未改。
巡航导弹转向后横速可能变大，但因为短路，不会「碰巧侧着飞」就打进侧面弱点。

### 9.4 验证

`npm test` **295/295**、`npm run build` 通过；无头 Chrome 实拍三型阵型：
E1 分列主机左侧并打出独立弹轨、E2 粉紫导弹明显弯曲着追向上方敌舰、
E3 金色环哨绕出弧形拖尾，均无连线、无页面报错（只有 headless 对
`navigator.vibrate` 的用户手势限制警告，与游戏无关）。

实拍踩过的坑：swiftshader 软件渲染下游戏内 `elapsed` 只走到真实时间约三分之一，
等不够 6.5 秒第一波敌人还没出场，僚机看起来「没走位」，其实停在停机位。
用临时调试钩子读出渲染器实际拿到的 `enemies / targets / pos` 定位后删掉；
另外手动 `localStorage.clear()` 会被 React 主循环写回，改成在文档加载前注入清理脚本。

## 10. 同型掉落的升级信标（2026-11-08）

「这枚道具值不值得绕过去捡」不该等捡起来才知道——`game/drops.js` 的
`dropUpgrade(drop, ship)` 在场上逐帧回答这件事：

- 同型号机翼：没满阶 → `tier`（升一阶）；满阶 → `overdrive`（转相位过载）。
- 同型号僚机：编队未满 → `merge`（编队 +1）；满编 → `full`（折算加分）。
- 异型号 / 没装 / 道具失效 → `null`，什么都不亮。

表现层按结果点亮 `models.js` 的 `makeUpgradeBeacon()`（纵向灯柱 + 内芯 +
贴地脉冲环，配色 `palette.js` 的 `UPGRADE`），`render.js` 的
`syncUpgradeBeacon()` 呼吸驱动；2D 叠层的副行换成 `readout.js` 的
`upgradeMark()` 短文案。信标不判断弱点兼容（拿错机翼同型号仍升级，那是真实收益），
也不碰任何配平数字。测试 302/302，无头 Chrome 实拍同型亮、异型不亮。
