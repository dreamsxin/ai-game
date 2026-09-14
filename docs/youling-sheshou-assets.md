# 幽灵射手素材盘点：做 ARPG 能用什么，缺什么

外部工程，不在本仓库里：`E:\Game\cocos\幽灵射手`（Cocos Creator，自带 git 仓库）。
`assets/` 240.6MB、17 个包。这份清单是为「拿它做 ARPG」盘的，结论先写在最前面。

## 结论：它不是一堆素材，它已经是一个能跑的动作游戏

`assets/script/` 有 66 个 TypeScript 文件、约 11000 行，是一套完整的俯视角动作游戏：

- `fight/player.ts`（839 行）、`fight/monster.ts`（812 行）、`fight/gameManager.ts`（624 行）
- `fight/boss.ts`、`fight/reward.ts`、`fight/arrow.ts`、`fight/characterRigid.ts`、
  `fight/colliderItem.ts`、`fight/monsterSkillCollider.ts`、`fight/mapManager.ts`
- 七种怪物技能各一个脚本：`fireBall`／`fireBallBig`／`energyBall`／`laser`／`tornado`／
  `jetFires`／`dispersion`／`dispersionSurround`，配三种预警图形（直线／条带／圆）
- `framework/`：`audioManager.ts`（489）、`effectManager.ts`（386）、`csvManager.ts`（513）、
  `uiManager.ts`、`poolManager.ts`、`playerData.ts`、`storageManager.ts`、`clientEvent.ts`
- `utils/joystick.ts`（265）、`utils/camera.ts`
- UI 一整套：主页、战斗 HUD、玩家/怪物/Boss 血条、技能面板、暂停、商店、结算、复活、设置、debug

所以「开发 ARPG」在这里不是从零起，而是**在一个已有的关卡制刷怪游戏上加 ARPG 的层**
（装备、属性成长、任务、地图探索之类）。

## 20 张 CSV 配置表已经把内容层抽出来了

- `base.csv`（14 条）—— 角色/怪物/物件的基础属性：生命、攻击、防御、攻速、移速、
  移动频率、闪避率、暴击。**ARPG 的数值层已经有位置放了。**
- `checkpoint.csv`（72 层）—— 层级 + 随机关卡地图 + 攻击/防御/生命/移速/攻速五项加成。
  这是现成的无尽层级曲线。
- `map001`~`map011`、`map101`~`map105`（16 张）—— 每层放哪些敌人/障碍、位置角度缩放、
  该层这个敌人用哪几个技能、移动模式。
- `monsterSkill.csv`（10 条）—— 技能类型分七种（单发/抛投/范围覆盖/散射/S 型/坠落/六角形）、
  资源名、起点、是否穿透、飞行速度、预警图形。
- `playerSkill.csv`（23 条）+ 英文版 —— 技能 ID 自带编码规则
  （第 1 位用途：1 形态 2 数值 3 buff 4 触发；第 2-3 位分类；第 4-5 位等级），
  带价格、数值提升、icon。**这套 ID 编码就是天赋树的骨架。**

## 能用的美术：8 个带骨骼动画的角色

这是全部素材里最值钱的东西，都在 `assets/res/model/`，一共 25.2MB。
动画是从单条 `Take 001` 里切出来的片段（Cocos 的 `animationImportSettings.splits`）：

- `role/role01` —— idle 1.3s / attack 1.3s / die 1.5s / **revive 1.4s** / run 0.7s
- `monster/aulaNew` —— idle / attack / hit / run / die(3.3s)
- `monster/boomDragonNew` —— idle / attack / hit / die / run
- `monster/dragon` —— idle / attack(3.0s) / die / run（**没有 hit**）
- `monster/hellFireNew` —— idle / **attack1 + attack2** / hit / die / run
- `monster/magicianNew` —— idle / attack / hit / die / run
- `npc/businessMan`、`npc/wiseMan` —— **只有 idle**

24 套特效（`res/effect/`）：fireBall、energyBall、laser、lightningChain、tornado、
jetFires、hit、levelUp、recovery、revival、heartEff、hellFireEff、coinTrail、runSmoke、
groundLight、warning、warpGate、arrow、cloud、gameStart、loadingCloud。

29 个音效已经按事件命名，跟我在这个仓库里一贯的事件驱动音频接法正好对得上：
`hitMonster`／`hitPlayer`／`aulaDie`／`dragonDie`／`hellFireDie`／`magicianDie`／
`boomDragonDie`／`player01Die`／`footStep1-2`／`getSkill`／`goldCollect`／`goldDrop`／
`revive`／`recovery`／`levelUp` 相关／各技能音。

## 用不上的：1000 个静态道具，一个骨骼都没有

剩下 15 个包共 984 个 `.fbx`，全是低模静态道具（Kenney 风格的成套件），
逐个扫过二进制确认**没有 Deformer／AnimCurveNode**，即没有蒙皮也没有动画曲线：

`3D奇幻小镇`(167)、`Kenny空间站场景`(153)、`塔防游戏资源`(145)、`3D家具和建筑`(140)、
`3d赛道赛车素材`(112)、`3D平台游戏套件`(104)、`低模3D河流与建筑模型`(63)、`3D假日主题`(60)、
`低模汽车资源`(28)、`3D作战太空船`(10)、`Suburb Assets`(1)、`LandscapeAssets`(1)。

**能当场景和装饰，不能当角色。** 塔防包里的 `enemy_ufo*` 也只是静态 UFO 网格。

`Ghost Shooter - UI Resources` 单独占 154.7MB（240MB 里的六成四），是 UI 图，没有模型。

## 拿它做 ARPG，真正缺的东西

按缺口大小排：

1. **只有一个可玩角色**，而且 `role01` **没有 hit 受击动作** —— ARPG 里被打没有反馈会很假。
   要么补动画，要么用受击闪白/顿帧代替。
2. **没有走路，只有 run**（0.7s 循环）。探索型 ARPG 通常要走/跑两档。
3. **没有任何装备模型**，也没有换装挂点。装备只能做成纯数值 + 图标。
4. **NPC 只会站着**（只有 idle），做不了对话手势、指路、交易动作。
5. **怪物只有 5 种**，其中 `dragon` 缺 hit。Boss 就是 dragon，没有第二个 Boss。
6. 地图是 CSV 摆点的固定小场景（每张 4~22 行摆放），**没有连续大地图**，也没有寻路网格 ——
   `mapManager.ts` 只有 179 行，做不了 ARPG 的地图探索。

## 授权：必须先查清再谈发布

素材来源是混的，风险不一样：

- Kenney 风格的那几个包（空间站、平台套件、塔防、赛车）大概率是 **CC0**，最宽松。
- **`res/` 里的角色、怪物、特效、UI，加上 66 个脚本和 20 张 CSV，看起来是一整套成品模板**
  （工程名叫「幽灵射手」，UI 包名叫 `Ghost Shooter`）。这类模板通常禁止二次分发源码/素材，
  自己改着发游戏往往可以、直接开源不行。
- 未在仓库里找到任何 LICENSE／协议文件。**动手之前先确认这套模板的来源和授权条款。**

## 建议的路线（还没定，等确认）

倾向于 **在这个 Cocos 工程里直接做**，理由是工程性的而不是偏好：

- 24 套特效是 Cocos 的粒子/动画资源，`effectManager.ts` 已经把它们和技能表接起来了。
  换引擎等于这一层全部重做。
- 8 个角色的动画切片信息存在 `.FBX.meta` 里，是 Cocos 的导入配置。搬到 three.js 要先
  转 glTF 并重新切片，骨骼、材质、动画事件都得重接。
- 数值、关卡、技能三张表已经把内容层和代码分开了，加 ARPG 内容主要是**填表**，不是写引擎。

搬到本仓库（three.js + React + Vite）的唯一好处是能沿用这里的纯逻辑 + node 测试那套做法。
如果要搬，值得搬的只有 `res/`（25MB）里那 8 个角色，其余 215MB 都不必动。

## 这份清单是怎么盘出来的

全部靠扫文件，没开 Cocos 编辑器：

- 按扩展名统计、按包统计体积与 fbx 数
- 逐个 `.fbx` 读二进制找 `Deformer`／`AnimCurveNode`，把 1008 个里的 14 个带骨骼的挑出来
- 从 `*.FBX.meta` 的 `userData.animationImportSettings.splits` 读动画片段名与时长
- 读每张 CSV 的表头拿字段含义
- 数每个 `.ts` 的行数排出系统规模
