# 换翼S计划 · 设定总表与接续手册

> **这份文档干什么用**：`README.md` 讲「为什么这样设计」，`docs/equipment-plan.md` 讲「装备这一轮怎么规划与落地」，
> 本表讲**现在到底是什么**——所有设定、数值、状态、契约、文件位置、验证手段，以及下一轮从哪儿接。
> 继续完善之前先读这一份；改完代码回来改这一份。表里的数字全部从代码导出核对（2026-11-08），不是凭印象写的。

---

## 0. 一页速查

| 项 | 值 |
| --- | --- |
| 仓库根 / 项目 | `D:/work/ai-game` / `D:/work/ai-game/huanyi-s-jihua` |
| 技术栈 | React + Vite + three.js（2.5D 斜俯视），纯静态、零外部素材请求，音效由 WebAudio 现场合成 |
| 命令 | `npm run dev`（4205）· `npm test` · `npm run build` · `npm run start`（preview 4205） |
| 本地预览 | `http://127.0.0.1:4205/`（当前服务的是 `dist/`，不是 dev） |
| 线上 | `https://wing-swap-s.app.workbuddy.host/?sharecode=WAR5MAZJ5P` |
| 发布参数 | 从 `huanyi-s-jihua/dist` 发布，`appName=换翼S计划`、`domainPrefix=wing-swap-s`（换目录会换分享链） |
| 本游戏最后提交 | `a5a2170`（装备槽与僚机编队落地）；仓库 HEAD `79adf79` 属 `yushan-ink` 项目，与本游戏无关 |
| 当前构建 | `dist/assets/index-Bm0qqobx.js` / `index-DOB_tRt0.css` |
| 当前测试 | `npm test` 295 条断言（本轮追加 1 条后为 296，见 §9） |

**三条地基，任何时候都不要破：**

1. **分层**：`src/game/` 是判定层（纯数据 + 纯函数，Node 可测，不认识 DOM / three / React）；
   `src/scene/` 是表现层（只读状态，一个字段都不写回）；`src/App.jsx` 负责 React UI 与主循环接线。
   判定层到表现层/音效/震动的唯一出口是 `effects[]`。
2. **Boss 配平链**：`bossHp = effectiveDps(recommendedWing(weak), weak) * ttk * HIT_RATE[weak] * PATTERN_HIT[pattern]`。
   装备火力**不进** `effectiveDps`，僚机弹一律 `chipOnly`。「拿错机翼要磨很久」是整个玩法的地基。
3. **看到的宽度 = 判定宽度**：`WING_HALF_W = 6.4`，全场 12.8 格。任何模型/光晕/Sprite 撑破它都是 bug，
   `Box3` 会把 Sprite 算进去，必须量。

---

## 1. 世界观与命名

| 概念 | 设定 |
| --- | --- |
| 战机 | **玄鸟**：乘波体机身 + 可拆的大后掠翼。带翼时机身明显更宽，多出来的一截就是多出来的受击面积 |
| 机翼 | 不是可插拔的枪，是**带相位编码的翼面**。两副编码一致时，第二副被解构成「能量骨架」回注第一副，翼面随之展开 |
| 同频共振协议 | 只有**同型号**能升阶（世界观自己的物理），不同型号编码不兼容，只能换装、阶级从 Mk.I 重来 |
| 四章地名 | I 要塞外围 / II 机翼追索 / III 生体舰队 / IV 葛布纳斯 |
| 敌方 | 外星舰队：Boss 是中央母舰 + 最多四艘独立护卫子舰；杂兵六种（见 §6） |
| 场景 | 霓虹峡谷，地面栅格 / 栏上刻度 / 两侧岩体三层各跑一个速度，飞机钉在屏幕上、动的是世界 |

**阶级代号与设定名**（`wings.js` 的 `TIERS`，`readout.js` 的 `tierGainLabel()` 从同一份数字现算百分比）：

| 阶级 | 代号 | 设定名 | 场上发生什么 |
| --- | --- | --- | --- |
| Mk.I | `PRIME` | 原型构型 | 单副翼面，按出厂相位输出 |
| Mk.II | `SYNC` | 同频同步 | 第二副解构为相位骨架，能量翼初次展开 |
| Mk.III | `RESONANCE` | 相位共振 | 三重翼场共振，翼面完全展开 |
| 限时 | `OVERDRIVE` | 相位过载 | 满阶后再叠同型号，5.5 秒内全场结构换白青 |

---

## 2. 玩法循环与状态机

**状态**（`simulation.js`）：`ready` → `select` → `playing` ⇄ `paused` →（`dying` 演出）→ `clear` → 下一关 / `won`；
`over` 是命归零。固定步长 `STEP = 1/60`。

**一局流程**：

1. 首屏「出击」（必须有一次用户手势才能解锁 WebAudio，所以不能自动开局）。
2. 每章第一关进入选翼面板：常规 15 型，第 3 章（`LAB_CHAPTER = 2`）起加 5 型实验机翼；
   `SS` 是只能在场上捡到的秘密机翼。同一屏可选一型装备预带（`chooseWing(state, code, gearCode)`）。
3. 关内：火力自动开；按住任意处**相对拖动**走位；轻点**弃翼**（不是点右下角那枚圆钮，它 `pointer-events: none`）。
4. 打掉运载火箭掉道具：菱形翻滚的是**机翼**，六边形悬浮的是**装备**（`drops.kind` 分流，旧 drop 无 kind 兼容为 wing）。
5. 接同型号机翼 → 升阶 + 相位冲击；接同型号装备 → 编队 +1（满 3 换分）。
6. Boss 出场有一拍 WARNING（1.7s）；弱点环照 `weakSpots()` 摆；血量归零进 1.3s 死亡演出才结算。
7. 过关给星级 / 战报；`4n+2` 关有跳关门（跳 4 关，Boss 不削弱）。

**输入**：触屏按住拖动 + 轻点弃翼；键盘方向键 / `WASD`，`Space`/`Z`/`X`/`J` 弃翼，
`Esc`/`P` 暂停，`R` 重开（仅暂停/结算时接手），`M` 静音。提示按 `matchMedia('(pointer: coarse)')` 切换两套。

**容错与存档**（`progress.js`，`PROGRESS_KEY = 'huanyi-s-jihua:progress'`）：

- 只存 `unlocked / stars / clears`，**不存局内状态**（弹幕、命、机翼阶级、装备一概不存）。
- `resumeIndex()` 落在上次过掉的那一关，非章首时自动带该关推荐机翼。
- 失败回本章第一关（`retryChapter(state)`）：命重置 3 条、分数退回本章起点、机翼重挑、**装备整槽作废**。
- 跨章补给 +1 命，上限 5；三星条件是一条命都没掉。
- 存档解析全防御：坏 JSON / 脏星级 / 超界关号 / 隐私模式一律退回「第一次玩」。

---

## 3. 场地与判定常量（`rules.js`）

单位是**场地格**不是像素，场地 `FIELD_W = 100` × `FIELD_H = 150`。

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `PLAYER_Y` / `PLAYER_SPEED` | 124 / 74 | 主机初始 y；键盘速度，触屏是位置跟随 |
| `PLAYER_MIN_Y` / `MAX_Y` | 24 / 144 | 纵向活动范围 |
| `HULL_HALF_W` / `HULL_HALF_H` | 2.4 / 3.2 | 裸机受击盒 |
| `WING_HALF_W` / `WING_HALF_H` | **6.4** / 1.5 | 带翼受击盒；12.8 格是判定也是视觉宽度 |
| `DIVE_TIME` / `DIVE_BOOST` | 1.05 / 1.55 | 弃翼无敌时长与加速倍率 |
| `WING_DRIFT` / `WING_DRIFT_VY` | 3.2 / −32 | 脱手机翼往上飘，追它要往敌人方向走 |
| `CATCH_R` / `CATCH_GRACE` / `JETTISON_LOCK` | 6.5 / 0.28 / 0.35 | 接回半径、刚脱手不可接、刚接上不可弃 |
| `HULL_GUN` | cool 0.24 / dmg 1 / speed 92 | 裸机小炮：打得死杂兵，打不动 Boss |
| `HURT_INVULN` / `START_LIVES` / `RESPAWN_DELAY` | 1.6 / 3 / 1.1 | |
| `MAX_LIVES` / `CHAPTER_LIFE_BONUS` | 5 / 1 | 只加容错，不动敌人强度 |
| `KILL_SCORE` | zako 80 / diver 120 / turret 150 / carrier 400 / ground 130 | |
| `POP_SCORE` / `BOSS_SCORE` / `LIFE_BONUS` / `SKIP_SCORE` / `EVOLVE_SCORE` | 20 / 3000 / 800 / 1200 / 600 | 连消倍率 `[1,1.5,2,3,4,6]` |
| `SYNC_BURST_R` / `SYNC_BURST_INVULN` | 26 / 0.7 | 升阶相位冲击：震碎半径内敌弹，照样算连消给分 |
| `OVERDRIVE_TIME` / `OVERDRIVE_SCORE` | 5.5 / 400 | |
| `GEAR_DROP_*` | life 9 / vy 13 / drift 3.2 / driftVy −32 / catch 120 / sync 240 | 装备道具与机翼道具参数分开，改手感不会改坏弃翼窗口 |
| `BOSS_DEATH_TIME` / `BOSS_BLAST_EVERY` | 1.3 / 0.18 | 死亡过载演出，抖动走 rng 可复现 |
| `WELL_PULL` / `WELL_KILL` | 62 / 3.6 | 引力井把敌弹拽进井心湮灭 |
| `tuning(levelIndex)` | hp `1+0.14i` / fire `1+0.06i` / speed `1+0.035i` | 同一份波次后期更凶 |

---

## 4. 机翼系统（`wings.js`）

### 4.1 21 型机翼（常规 15 + 实验 5 + 秘密 1）

`cool` 越小越密；`volley` 是一轮同时射出的弹模板（`dx/dy` 是出膛位置）；
`orbs` 是绕主机自转的铁球，不吃冷却，靠撞掉敌弹解题；`pierce: 'armor'` 才能穿装甲打内部弱点。

| 代号 | 名称 | 类别 | cool | 弹数 | 环数 | 一句话 |
| --- | --- | --- | --- | --- | --- | --- |
| `C` | 加农炮 | 常规 | 0.085 | 2 | 0 | 两路高速直射，射速最快火力最猛 |
| `W` | 宽幅炮 | 常规 | 0.2 | 5 | 0 | 5 路扇形，横向覆盖最广 |
| `M` | 排炮 | 常规 | 0.15 | 3 | 0 | 3 路平行，中距离对群 |
| `V` | 防卫炮 | 常规 | 0.06 | 3 | 0 | 正面 180° 极短程弹幕 |
| `S` | 三向炮 | 常规 | 0.17 | 3 | 0 | 正前 + 左右，能打侧面弱点 |
| `A` | 前后炮 | 常规 | 0.13 | 2 | 0 | 前后双向 |
| `H` | 铁球炮 | 常规 | 0.17 | 2 | 2 | 前方两路 + 两枚自转铁球 |
| `O` | 护环炮 | 常规 | 0.22 | 1 | 4 | 4 枚贴身快转，蹭掉敌弹 |
| `E` | 远环炮 | 常规 | 0.2 | 2 | 2 | 大环慢转 + 两路平射 |
| `N` | 霰弹炮 | 常规 | 0.3 | 7 | 0 | 7 路超短程散射 |
| `K` | 破地炮 | 常规 | 0.34 | 3 | 0 | 三枚炸弹全砸地面 |
| `T` | 交叉炮 | 常规 | 0.18 | 4 | 0 | 两路正前 + 两路斜后 |
| `J` | 穿甲弹 | 常规 | 0.3 | 1 | 0 | 穿装甲后在内部爆开，射速很慢 |
| `F` | 火焰炮 | 常规 | 0.045 | 1 | 0 | 火焰柱，一发连穿几个目标 |
| `D` | 对地机翼 | 常规 | 0.15 | 3 | 0 | 一路直射 + 两枚落向低空的炸弹 |
| `SS` | SS 机翼 | **秘密** | 0.1 | 4 | 2 | 四向穿甲 + 两枚铁球，场上才捡得到 |
| `G` | 引力井 | 实验 | 0.55 | 1 | 0 | 缓慢引力井把敌弹吸进去湮灭 |
| `Z` | 链弧炮 | 实验 | 0.16 | 1 | 0 | 命中后电弧跳到旁边敌人 |
| `L` | 相位激光 | 实验 | 0.05 | 1 | 0 | 极高射速细束，一发连穿整列 |
| `X` | 反物质弹 | 实验 | 0.5 | 1 | 0 | 慢速重弹，命中或耗尽炸成一圈碎片 |
| `Q` | 量子分身 | 实验 | 0.14 | 2 | 0 | 在场地另一侧投镜像分身同步开火 |

`WING_CODES` 15 / `LAB_CODES` 5 / `SECRET_CODES` 1 / `ALL_CODES` 21 / `PICKABLE_CODES` 20。

### 4.2 阶级与过载

| 阶级 | dmg | cool | range | area | mark |
| --- | --- | --- | --- | --- | --- |
| Mk.I | 1 | 1 | 1 | 1 | I |
| Mk.II | 1.5 | 0.82 | 1.4 | 1.4 | II |
| Mk.III | 2.25 | 0.70 | 1.9 | 1.9 | III |
| `SURGE`（过载） | ×1.35 | ×0.8 | ×1.15 | ×1.15 | 5.5s |

**不变量**：阶级只乘伤害 / 冷却 / 射程（弹丸寿命）/ 特殊弹作用范围，**绝不碰** `pierce / ground / vx`；
`effectiveDps` 只算「打在同一个 Boss 身上」的机翼火力，**不含过载、不含分身镜像、不含装备**。
升阶瞬间放半径 26 的相位冲击 + 0.7s 无敌；弃翼 / 换翼 / 掉命 / 跨章按既有规则清零过载或阶级。

### 4.3 弱点（`WEAKNESS`）——「武器即钥匙」

| 弱点 | 说明 | chip | 能打进去的机翼 | 推荐 |
| --- | --- | --- | --- | --- |
| `core` | 壳内正中，外层装甲挡住一切 | 0.16 | `J`, `SS` | `J` |
| `side` | 两侧炮座，要从侧向送进去（`|vx| > 40`） | 0.20 | `S`, `W`, `SS` | `S` |
| `low` | 贴在地面，平射会从头上飞过去 | 0.16 | `D`, `K` | `D` |
| `swarm` | 生物体没有装甲，哪儿都能打穿 | 1 | 全部 21 型 | `C` |

`damageMultiplier(kind, bullet)` = 打进弱点 1，否则 `chip`。`bossShotMultiplier(weak, shot)` 对 `chipOnly`
（装备弹）直接短路到 `chip`，**导弹转向后横速变大也不会碰巧打进 side 弱点**。

---

## 5. 装备槽与僚机（`gear.js`）

### 5.1 三型装备（一型一形一色一阵型）

| | E1 雁翎 | E2 梭卫 | E3 环哨 |
| --- | --- | --- | --- |
| title / shape / hue | 索敌僚机 / `swept` / 190（青） | 游猎僚机 / `needle` / 300（粉紫） | 哨戒僚机 / `ring` / 50（金） |
| `formation` | `flank` 左右侧翼 | `sortie` 前方游猎 | `orbit` 绕主机环绕 |
| 停机位 1 / 2 / 3 架 | `[-3.0,14.5]` / `[-4.6,15.2],[4.6,15.2]` / `[-5.0,15.8],[5.0,15.8],[0,19.0]` | `[-2.8,13.6]` / `[-4.9,14.6],[4.9,14.6]` / 再加 `[0,19.4]` | `[-2.6,12.6]` / `[-4.0,13.6],[4.0,13.6]` / `[-4.4,14.0],[4.4,14.0],[0,17.0]` |
| `fire` | dmg 0.55 / cool 0.46 / vy −96 / spread 0 / life 1.15 | dmg 0.42 / cool 0.38 / vy −92 / spread 18 / life 1.5 / **homing** | dmg 0.32 / cool 0.55 / vy −84 / spread 9 / life 1.25 |
| `aura`（消弹圈） | 3.0 | 2.3 | **4.2**（最大） |
| 一句话 | 火力最稳 | 射得最勤、唯一带巡航导弹 | 火力最弱、消弹圈最大 |

**停机位一律在主机后侧**（y 更大 = 更靠近屏幕下方），单架也偏左错位（dx −3.0 / −2.8 / −2.6），
否则僚机弹与加农炮弹列完全重合、加色叠成一列白光，玩家会以为「僚机没有子弹」。
`escortWithinSpan()` 守 `|dx| + ESCORT_HALF_W(1.3) <= WING_HALF_W(6.4)`。

### 5.2 自主索敌与巡航导弹

- `escortWorld(state)`：Boss 优先（排除 `entering`/`dying`），其余取主机**上方**存活敌人按离玩家最近排；
  没有目标返回空 targets → 三型一起回后方停机位。纯函数，判定层与表现层共用同一份。
- `escortsOf(ship, world = null)`：不传 world 时逐字段等同旧版（选翼面板 / HUD / 旧测试都不受影响）；
  传 world 时按 `formation` 展开。位置是**时间的纯函数**，不存「僚机在哪」，跨关 carry / 复活 / 重试不用多搬状态。
- `escortPost()`：`flank` 交替分列两侧 + 轻微前后摆动；`sortie` 周期性前出咬住目标再回防；
  `orbit` 等分相位绕圈。三型都带一点朝目标的倾斜。
- 常量：`ESCORT_SORTIE_PERIOD 4.4` / `ESCORT_SORTIE_REACH 30` / `ESCORT_SORTIE_SPAN 34` /
  `ESCORT_FLANK_SPAN 18` / `ESCORT_ORBIT_R 15` / `ESCORT_ORBIT_SPEED 1.35 rad/s` / `HOMING_TURN 3.2 rad/s`。
  11 格那一版侧翼压在机翼尖端，实拍后拉到 18 / 15 才真的分列。
- `steerHoming(shot, point, dt)`：每帧朝目标转一点点、速度大小不变，纯函数可单测。
  `gearVolley()` 出膛 `vx` 先按目标方位修正 ±26、叠加 spread 后 clamp 到 **±36**（side 弱点要 > 40）。
- **没有连线**：旧版 `linkMesh` 已整块删除（含 dispose），编队关系改由形状 / 识别色 / 入列光弧 /
  按距离提亮的识别光晕承担；`wiring.test.js` 读源码守着不许加回来。

### 5.3 规则边界

| 规则 | 做法 |
| --- | --- |
| 成长轴 | 同型号 → 编队 1→2→3；换型号重置为 1；满编再捡换 **180 分**。不叫阶级、不放相位冲击 |
| Boss 火力 | 每发 `chipOnly: true`、`source: 'gear'`，`bossShotMultiplier` 短路到 chip |
| 弹数 | 恒等于编队数，`fire.spread` 只是交替偏射，不是每架两发 |
| 受击 | 僚机**不进** `hitBoxes`，不吃伤害 |
| 消弹 | 近身消弹圈照铁球范式走 `pop()`，照样计入连消 |
| 替挡 | 每次捡到/合流补一次 `gearGuard`；裸机挨致命一击时消耗 1 架 + `GEAR_BLOCK_INVULN = 1.15s`；挡到最后一架装备清空 |
| 掉命 | `gearAfterLoss()` **掉一级不清零**，掉到 0 才清空；复活保留降级后的编队 |
| 重试本章 | `retryChapter()` 不带 gear，**整槽作废**（比掉命更重的一档） |
| 存档 | 装备不进 localStorage，只在本局内跨关 `carry`；`gear.test.js` 断言存档 JSON 不含 `gear` |

`briefing().gearCodes` 由 `CHAPTER_GEAR = ['E1','E2','E3','E3']` 按章注入；`briefing().pick` 永远只推机翼。

---

## 6. 关卡与 Boss（`levels.js` / `boss.js` / `enemies.js`）

四章各 4 关，共 16 关；每关 4 波（第 3、4 章 5 波）。`4n+2` 关（第 2/6/10/14 关）有跳关门，
`skipTarget(index)` 跳 4 关，Boss 不削弱。

**配平公式**（`levels.js`，一行都不能顺手改）：

```js
bossHp = effectiveDps(recommendedWing(weak), weak) * ttk * HIT_RATE[weak] * PATTERN_HIT[pattern]
HIT_RATE    = { core: 0.45, side: 0.21, low: 0.45, swarm: 0.45 }
PATTERN_HIT = { sweep: 1, twin: 1, ring: 1, fortress: 1, centipede: 0.5, fortressCore: 0.8 }
```

`playthrough.test.js` 守 16 关可通、TTK 落在目标区间、拿错机翼时间 > 拿对机翼的 1.7 倍。

| # | 关名 | Boss | 弱点 | 走位 | HP | TTK | 机翼掉落 | 装备 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 试作返航 | 掠夺者前哨 | swarm | sweep | 254 | 12 | C | E1 |
| 2 | 弃翼训练 | 双联炮座 | side | twin | 58 | 13 | S | E1 |
| 3 | 装甲回廊 | 铠核 | core | ring | 88 | 14 | J | E1 |
| 4 | 低空防线 | 地表堡垒 | low | fortress | 175 | 14 | D | E1 |
| 5 | 夺回第一枚机翼 | 壳甲运输舰 | core | ring | 95 | 15 | J, C | E2 |
| 6 | 运载火箭群 | 母体虫群 | swarm | sweep | 318 | 15 | W, M | E2 |
| 7 | 侧舷炮阵 | 侧舷要塞 | side | twin | 71 | 16 | S, W | E2 |
| 8 | 沙海地垒 | 沙下巨炮 | low | fortress | 200 | 16 | D, F | E2 |
| 9 | 机器蜈蚣 | 机器蜈蚣 | swarm | centipede | 180 | 17 | C, G, V | E3 |
| 10 | 壳中之核 | 双层壳核 | core | ring | 107 | 17 | J, X, H | E3 |
| 11 | 三面夹击 | 三向母舰 | side | twin | 80 | 18 | S, Q, A | E3 |
| 12 | 贴地推进 | 履带巨兽 | low | fortress | 225 | 18 | D, Z, C | E3 |
| 13 | 葛布纳斯外壁 | 外壁守核 | core | ring | 120 | 19 | J, L, C | E3 |
| 14 | 机翼库 | 库房主脑 | swarm | sweep | 402 | 19 | H, G, F, SS | E3 |
| 15 | 双子炮座 | 双子炮座 | side | twin | 89 | 20 | S, Q, W | E3 |
| 16 | 移动堡垒 | 葛布纳斯移动堡垒 | core | fortressCore | 111 | 22 | J, X, SS | E3 |

**杂兵六型**：`zako / diver / turret / ground / carrier / wall`。`carrier` 是运载火箭，打掉才掉道具；
`spawnWave()` 只给该波第一架 carrier 挂 `item.gear`。

**Boss 六套走位**：`sweep / twin / ring / fortress / centipede / fortressCore`。
`weakSpots(boss)` 按弱点给 1～2 个环（`side` 两个、`core` r=4.2、`low` r=3.8），表现层照这份摆，
`depthTest = false` 永远压在舰体上面。死亡演出：血量归零 → 1.3s 过载，场上它打出的弹幕化为火花（不给分）、
壳体按 0.18s 节奏炸开、外壳烧白发抖下沉、弱点环收掉，之后才给 `BOSS_SCORE` 与过关和弦。

---

## 7. 表现层设定（`src/scene/`）

### 7.1 取景与高度（`view.js`，纯函数、不 import three）

`TILT = 58°` / `FOV = 58°`，远近尺寸比约 0.7（测试夹在 0.5—0.85）。
`ALT = { ground: 1.4, low: 3.2, ship: 6, enemy: 6.6, boss: 8.4, shot: 6, ceiling: 17 }`。
僚机实体抬到 `ALT.ship + 1.35`，脱离三层发动机羽流；僚机弹画在僚机同层。
`pixelScale(aspect, width, height, shipY)` 按船**当前深度**算横竖两个比例，注入 `createInput` 的 `scale`；
用平均比例换算会让竖向拖动慢四成、船越往上越粘。

### 7.2 配色（`palette.js`）

| 组 | 值 |
| --- | --- |
| 主题 | `--ink #f6f4ee` / `--accent #ffd447` / `--cool #7fe3ff` / `--warm #ff5470` / `--good #8affd0` / `--panel rgba(8,14,32,.86)` |
| `HAZARD` | foe `#ff2f5e`（敌弹，全场唯一「碰到就掉翼」的红）、shell `#ff8a3c`、shot `#fff6c8`、pierce `#6effc4`、ground `#ffb02e`、lab `#c9a6ff`、gold `#ffd447`、cool `#7fe3ff`、warm `#ff5470` |
| `FLEET` | hull `#39406f`、hullLit `#7b78d8`、plate `#4b5396`、bridge `#9a94ec`、energy `#6affe0`、engine `#d2fff6`、rage `#8e2044`、rageEnergy `#ff7a94` |
| `TIER_COLOR` | `#9fc2ff` / `#6effc4` / `#ffd447`；`OVERDRIVE_COLOR #e6ffff`；`PHASE_COLOR #b9f2ff` |
| 四章 accent | `#00e5ff` 石青蓝 → `#ff5ce1` 紫红 → `#9dff3c` 青绿 → `#ffd23c` 琥珀橙 |
| `WING_HUES` | F18 K32 D46 SS62 J82 O100 V118 N138 E158 W176 S192 C206 H220 M234 A246 T260 L272 G284 Z296 X308 Q320（一型一色，两两 ≥11°，避开敌弹红 >18°） |
| `GEAR_HUES` | E1 190 / E2 300 / E3 50 → `GEAR_SKINS` 亮银偏冷机身 + 高饱和识别件 |

四章亮色饱和度 ≥0.55、色相互差 ≥40°、地形色避开敌弹红 30° 以上，由 `palette.test.js` 守。

### 7.3 模型与视觉契约（`models.js` / `render.js`）

- **对象池** `createPool(parent, factory)`：每帧 `begin/take/end`，所有 `visible / scale / opacity` 用**绝对值覆盖**，
  避免复用累积。
- **21 型机翼**：`wingIcon.js` 的 `WING_OUTLINES` 一型一条轮廓、`WING_TRIM` 一型一件翼尖装置；
  `wingProfile()` / `wingSkin()` 让三维机翼与选翼小图共用同一份数据。翼尖一律钉在 `x = 6.4`。
- **相位翼场** `makePhaseFrame()` 单独挂在机体上、**不进 `makeWing`**；Mk.II 只展开内半段能量翼，
  Mk.III 全开 + 六根翼肋 + 两道陀螺环 + 八颗能量节点。加色层 alpha 有意压住（棱晶 0.5 / 翼肋 0.2 /
  导线 0.26~0.34 / 能量翼面 0.05~0.07），叠过 1 会烧成纯白。
- **Boss 舰队**：中央母舰（V 字楔形舰艏、外倾侧翼、分层舰桥、三枚尾部引擎、五枚能量脊、平躺护盾环）
  + 最多四艘独立巡航子舰；`FLEET_FORMATIONS` 六套阵型，子舰各自有 `EdgesGeometry` 发光轮廓。
  体量契约 `|rx| + 子舰半宽 ≤ 0.456w`、`|rz| + 子舰半长 ≤ 0.45h`，母舰只占中间一段给编队留真空。
  半血整队变红，死亡过载向外散开。
- **弹道**：我方弹是白芯 / 色壳 / 外晕 / 头部闪光四层，按自身速度方向转身；激光 `L` 长 30 格，
  靠 0.05s 间隔首尾相接成光柱。**僚机弹是双股离子矢**（两根识别色光条 + 白芯 + 菱形弹尖 + 亮头光团），
  **巡航导弹是细长箭体 + 分叉尾翼 + 双股尾焰**，按 `vx/vy` 定向、单独分池 `cruise:E2`。
- **世界不放字**：斜俯视下道具约 20px，贴图文字必糊；型号 / 阶级 / 跳关门说明全由 2D 叠层
  （`render.js` 的 `marks`）按投影位置画原生分辨率的字。中文集中在 `readout.js`，`App.jsx` 不硬编码。
- **音效** `audio.js`：`SOUNDS` / `soundsFor()` / `vibrationFor()` 是纯数据纯函数，只有 `createAudio()`
  才碰 `AudioContext`。装备事件 `gearCatch / gearSync / gearBlock / gearLost` 各有音色与震动。

### 7.4 反复踩过的视觉坑（改之前先看）

1. `Box3` 会把 Sprite / 光晕算进翼展 → 航灯与灯条必须收在 6.6 格内。
2. 不透明实体材质 `emissiveIntensity 3.5` 在屏幕上烧成两团白斑 → 靠「细而亮」不是「亮成一片」。
3. 无敌闪烁会把每帧自驱动材质拉到 1（越挨打越亮）→ 给材质打 `userData.driven`，`fade()` 跳过。
4. 舰体压成近黑 `#171d3a` 在深蓝网格上整支舰队消失 → 提亮 + 全部加发光轮廓线。
5. 两道宽 `0.86w` 的亮边横贯全场，把四艘子舰粘成一块 → 母舰收窄、亮边只勾 `0.36w`。
6. 单架僚机站主机正后方，弹道与直射弹重合 → 停机位 dx 偏左；后来三型阵型各自展开。
7. `dev` 模式 HMR 重载时序不稳，CDP 点击会打在旧页面 → 验证一律用 `dist/` 静态站。

---

## 8. UI 与响应式契约（`App.jsx` / `styles.css`）

- `.app` 铺满窗口、`touch-action: none`；`.frame` 一列到底，HUD / 舞台 / 浮键共用同一列。
  HUD 浮在舞台上、限宽 720 居中、`pointer-events: none`。
- `.overlay` 有 `padding: 16px` 与 `overflow: auto`；`.panel { width: min(380px, 100%); padding: 20px }`，
  选翼面板用 `.panel-wide { width: min(520px, 100%) }`。全局 `box-sizing: border-box`。
- 首屏只留三句操作，其余收进「更多设定与操作」折叠区；暂停面板给快捷键与阶级进度。
- HUD 两条成长轴：共鸣条**圆点**（Mk.I→III）、装备条**方点**（编队 1→3）；
  面板打开时两条 meter 都隐藏，免得透出遮罩糊字。矮屏（高 ≤ 560）隐藏副标题类文字。
- 装备卡与选翼卡同一屏（`.gear-grid` 用 `repeat(auto-fit, minmax(64px, 1fr))`），
  位置在黄色「带推荐翼出击」按钮正下方，不另开弹窗。

### 8.1 本轮修复：暂停面板底部按钮栏宽度不自适应

**症状**：暂停后底部「继续 / 重开本章」这一栏向右溢出面板 66px，320 / 390 / 1280 三种宽度都一样；
「继续」被压成 77px，「重开本章」吃满整行。

**根因**：`.panel-action { width: 100% }` 同时成了 `.panel-action-ghost { flex: 0 0 auto }` 的 flex-basis，
次键既拿到整行宽又不允许收缩，主按钮只能缩到 min-content，整行撑破 380px 面板。

**修法**（`styles.css`）：`.panel-actions` 改 `flex-wrap: wrap`；栏内按钮 `width: auto` + `min-width: 0`，
主键 `flex: 2 1 140px`、次键 `flex: 1 1 110px`；删掉 ghost 基础规则里的 `flex: 0 0 auto`。
结算面板里那枚**独立**的「继续推进」仍吃 `.panel-action` 的 `width: 100%`，不受影响。

**实测**（CDP 量 `scrollWidth` 与按钮 rect）：

| 视口 | 修前 | 修后 |
| --- | --- | --- |
| 320×568 | 溢出 66px，`.panel scrollWidth 353 > clientWidth 286` | 两行各 246px，`scrollWidth == clientWidth`，无溢出 |
| 390×844 | 溢出 66px | 一行，主键 177.3 / 次键 128.7，无溢出 |
| 1280×800 | 溢出 66px | 一行，主键 192 / 次键 136，无溢出 |

`wiring.test.js` 追加静态断言守 `flex-wrap: wrap` / `width: auto` / 两个可伸缩 flex 基准 / 不许再出现
`flex: 0 0 auto`，防止以后被改回去。

---

## 9. 验证与发布

**每次改完至少跑这四步：**

```bash
npm test                 # node --test test/*.test.js，当前 295 → 本轮 +1 = 296
npm run build            # 只看 three.js 的 >500 kB chunk 老警告，不阻塞
# 无头 Chrome + CDP 实拍（--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader）
# 对比 dist/index.html 与线上首页哈希 / 资源文件名
```

`test/` 分层：`game/*` 守判定层；`gear.test.js` 18 条守装备槽；`models/visuals/palette/wingIcon/view/loop/
progress/wiring` 守表现层与接线；`playthrough.test.js` 用机器人跑完 16 关守配平。
`bot.js` 的 `worthTaking()` 对 `drop.kind === 'gear'` 返回 0，保证量到的仍只是机翼效率。

**headless 验证的三个坑**：

1. 无头 Chromium 原生 `requestAnimationFrame` 实测 0 帧 → `loop.js` 在 rAF 缺席 250ms 后自动落回
   `setTimeout(16)`，游戏自己会跑起来；不要再手动注入假 rAF。
2. swiftshader 软件渲染下**游戏内时间约为真实时间的 1/3**，等 2.1s 第一波敌人还没出场，
   僚机停在停机位看起来像「没走位」；实拍要等够 6.5s。CDP 脚本用轮询等 UI 到位，别写死 sleep。
3. 每轮换 query + `localStorage.clear()` + reload，否则上一局的进度会把首屏「出击」换成「继续游戏」。

**发布约定**：`vite.config.js` 用 `base: './'`、`host: '0.0.0.0'`、`allowedHosts: true`；
`index.html` 的 manifest href 与 `manifest.webmanifest` 的 `start_url` / icon 全走相对路径（修过子路径白屏）。
分享域对不带 cookie 的 `manifest.webmanifest` 请求返回 403 是授权层正常行为，只影响 Android「加到主屏」，
JS/CSS 同源正常加载。发布目录固定 `huanyi-s-jihua/dist`，换目录会换分享链。

---

## 10. 接续清单（下次从哪儿改）

**当前状态（2026-11-08）**：Boss 舰队重做、僚机三型阵型 + 巡航导弹、按钮栏自适应这几轮
**都只在本地，未提交、未发布**。本游戏最后一次提交是 `a5a2170`，线上仍是那一版，
不含装备之后的任何改动。仓库里 `yushan-ink/project.godot` 的改动属另一个项目，提交时按
`huanyi-s-jihua/` 路径逐个 add，不要 `git add -A`。

| 优先级 | 待办 | 说明 |
| --- | --- | --- |
| 立刻 | 审 diff → 提交 → 推 `origin/main` → 从 `dist/` 重新发布 | 用户试玩确认后再做，分享链保持不变 |
| P3 | **第二件非僚机装备**（护盾 / 雷达） | 规划稿主动留的后续项。框架口子已备好：`GEAR[code].kind`、`drops.kind`、按 kind 分池、`gearFields()`。当前三型都是 `kind: 'escort'` |
| 可选 | 调阵型幅度 / 导弹转向速率 / 子舰数量 / 离子矢粗细 | 都是单常量，`gear.js` 与 `FLEET_FORMATIONS` 里改，改完补断言 |
| 可选 | 更多 Boss 走位、更多装备成长轴、章节专属僚机 | `CHAPTER_GEAR` 目前第 3、4 章都是 E3 |
| 可选 | 首屏说明与战报文案再打磨 | 全部中文在 `readout.js` 与 `App.jsx` 折叠区 |

**改动检查清单**（改完照着过一遍）：

1. 判定层数值变了 → 同步 `README.md`、本表、`docs/equipment-plan.md` 的实现记录与测试数。
2. 碰了 Boss / 机翼 / 装备火力 → 一定跑 `playthrough.test.js`，确认 TTK 与错翼惩罚没被稀释。
3. 碰了模型 → 量 `Box3`，确认 12.8 格翼展与 `ESCORT_HALF_W` 没破。
4. 碰了弹的种类 → `shotKey()` 分池、`makeShot(kind)` 分支、音效登记都要跟上。
5. 碰了 UI → 至少在 320 / 390 / 1280 三种宽度量一次 `scrollWidth`，别只看一张截图。
6. 发布前 → 线上首页哈希与本地 `dist/index.html` 对得上，开局流程走一遍。

---

## 11. 文件地图

```
huanyi-s-jihua/
├─ README.md                    设计说明、玩家向规则、验证记录（讲「为什么」）
├─ docs/
│  ├─ game-design.md            本表：设定总表与接续手册（讲「现在是什么」）
│  └─ equipment-plan.md        装备系统规划稿 + 第 8/9 节实现记录
├─ index.html / manifest.webmanifest / icon.svg / vite.config.js
├─ src/game/                  判定层（纯函数，Node 可测）
│  ├─ rules.js                全局常量、计分公式、tuning
│  ├─ wings.js                21 型机翼、TIERS、SURGE、WEAKNESS、effectiveDps
│  ├─ gear.js                 三型装备、escortWorld / escortsOf / steerHoming / 替挡降级
│  ├─ levels.js               16 关波次、bossHp 反推、CHAPTER_GEAR、briefing
│  ├─ enemies.js / boss.js    六种杂兵、六套 Boss 走位、weakSpots
│  ├─ simulation.js           固定步长状态机、effects[]、carry / retry / 替挡
│  ├─ input.js / random.js / progress.js / bot.js(在 test/)
├─ src/scene/                 表现层（只读状态）
│  ├─ view.js                 取景数学、ALT、pixelScale（纯函数）
│  ├─ palette.js              四章配色、HAZARD/FLEET、21 机翼皮、3 装备皮
│  ├─ wingIcon.js             21 条轮廓 / 翼尖装置 / 炮口布局（纯数据）
│  ├─ models.js               程序化模型工厂 + 对象池（不含任何文字）
│  ├─ stage.js                相机、天幕、地面、泛光、震屏
│  ├─ render.js               状态→舞台总线、2D 叠层、syncEscorts / syncBoss
│  ├─ audio.js / readout.js   WebAudio 合成 / 全部中文文案
│  └─ loop.js                 rAF 缺席时落回 setTimeout 的主循环
├─ src/App.jsx                React UI、状态推进、主循环接线
├─ src/styles.css             HUD / 面板 / 装备卡 / 响应式
└─ test/                      node --test，见 §9
```
