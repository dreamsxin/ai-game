# AI 小游戏集合

每款游戏使用独立 workspace。需要对话或推理能力的游戏通过 MCP 工具接入 AI，实时 3D 游戏使用确定性规则保证操作响应。

## 进度总览

20 个游戏。「关卡」一列区分三种结构：**闯关**有关卡表，**无尽/单局**用难度或阶段代替关卡，**生成器**用风格预设代替关卡。
「音效」一列是持续在补的一项：9 个闯关游戏、方块坠塔、方块疾风、小队枪战、疯狂打弹珠、蜘蛛纸牌和魔方爬楼已经接上程序化音效、触觉反馈和奖励反馈，
剩下 5 个无尽／单局／生成器还是静默的。



- `guxing-maoxian` 菇星冒险 — 闯关 3 关：青草丘陵 / 砖窑遗迹 / 星塔之巅 — **有音效 + 触感 + 奖励反馈**（连踩越多音高越高）

- `xiaoxiaole` 甜果消消乐 — 闯关 5 关：果园初摘 / 蜜瓜小径 / 莓果集市 / 橙风长廊 / 甜果之巅 — **有音效 + 触感 + 奖励反馈**（连锁越深音高越高）

- `migong-chuansuo` 迷宫穿越 — 闯关 100 关，10 章递进：初启 / 错位 / 双阙 / 回环 / 叠城 / 深井 / 环廊 / 穹顶 / 虚径 / 归途（每章一套配色，尺寸 3×3 单层 → 7×7 四层） — **有音效 + 触感 + 奖励反馈**
- `lvdong-danzhu` 律动弹珠 — 闯关 6 关：初拍热场 / 霓光副歌 / 碎拍回响 / 双色跃动 / 高速切分 / 终章律动 — **有音效 + 触感 + 奖励反馈**（拍子现在听得见）

- `chengshi-jianzao` 天际营造 — 闯关 6 关：落基镇 / 双溪口 / 工坊区 / 绿荫台 / 临港城 / 天际都 — **有音效 + 触感 + 奖励反馈**（月报按严重程度出声）

- `huanyi-jihua` 换翼计划 — 闯关 16 关，4 章递进：要塞外围 / 机翼追索 / 生体舰队 / 葛布纳斯（每章第一关可换机翼，第 4n+2 关有跳关门，第 9 关起解锁实验机翼） — **有音效 + 触感 + 奖励反馈**（打进弱点和被装甲挡住是两种声音；消弹音高跟着连消数爬；进化压过接翼那一声）

- `shuidan-tang` 水弹堂 — 闯关 8 关：初堂 / 木箱巷 / 双环 / 迷格 / 四方 / 长廊 / 蜂巢 / 终堂（柱阵四种排法，对手 1→3 个，档位 0.35→1） — **有音效 + 触感 + 奖励反馈**（「我被困住了」和「我困住了人」是一上一下两种相反的声音；爆开的音高跟着连锁数爬）

- `xuanfeng-kading` 旋风卡丁 — 闯关 8 关：环湖热身 / 双子弯 / 港区夜巡 / 山道回环 / 峡谷连喷 / 霓虹八字 / 齿轮工厂 / 旋风终盘（最紧的弯 66 米→16 米，对手 3→5 车、档位 0.3→0.78，门槛前 3→前 2→冠军） — **有音效 + 触感 + 奖励反馈**（常驻引擎声跟着车速；「超掉别人」和「被别人超掉」是一上一下两种相反的声音；喷射音高跟着档位和连喷数爬）


- `nizhe-yuanzheng` 泥辙远征 — 闯关 3 趟：木料上山 / 沼泽钢管 / 变压器过河 — **有音效 + 触感 + 奖励反馈**（转速驱动的常驻引擎音）

- `nijie-tunshi` 霓界吞噬 — 单张固定地图，6 段形态成长 + 7 段剧情推进 — **有音效 + 触感 + 奖励反馈**（吞小糖和吞大糖两种音色，连击音高走五声音阶；形态进阶和剧情推进撞在同一帧只响一声）

- `fangkuai-jifeng` 方块疾风 — 无尽跑酷，4 个视觉分区：翠原 / 流沙 / 霓虹 / 虚空 — **有音效 + 触感 + 奖励反馈**（金币越串越高，护盾挡下和撞毁一听就分得开）
- `eluosi-fangkuai` 方块坠塔 — 无尽，15 级速度等级（每 10 行升一级） — **有音效 + 触感 + 奖励反馈**（消行音高跟着行数走）

- `fengkuang-danzhu` 疯狂打弹珠 — 无尽，每 10 回合升一个阶段 — **有音效 + 触感 + 奖励反馈**（一颗颗出膛的节奏、连爆越大音越高）
- `wuqizi` 五子棋 — 单局对战，4 档 AI：入门 / 进阶 / 高手 / 大师（`src/game.js` 里的 `LEVELS` 是搜索深度档位，不是关卡） — **有音效 + 触感 + 奖励反馈**（音效带的是**战术含义**：我成四和 AI 成四是相反的两声，胜点被抢也有专门的一声）

- `zhizhu-zhipai` 蜘蛛纸牌 — 单局，3 档难度：1 花色 / 2 花色 / 4 花色（同一副牌，花色数是难度对 id 的一层透镜） — **有音效 + 触感 + 奖励反馈**（落牌、翻牌、收门一听就分得开）；**支持断点续玩**，搬牌是滑行动画，发新局会筛掉开局就没得走的牌，提示只报**真有进展**的一步（场上只剩废棋时改口劝你发牌，而不是报一个走了也白走的坐标）
- `xiaodui-qiangzhan` 小队枪战 — 单局 3v3，单张竞技场，15 分或 180 秒结束 — **有音效 + 触感 + 奖励反馈**（自己的枪、别人的枪、打中人、被打中，四种声音各不相同）
- `xiaoyuanmian` 校园谜案 — 单案件《回声画廊》，4 个场景 4 名嫌疑人 — **有音效 + 触感 + 奖励反馈**（服务端本来就把「推进了案子」和「白跑一趟」分成两类事件，音效把这个区别说出来；证据音高随收集进度爬）

- `sanwei-chengshi` 三维城市 — 生成器，3 档规模：小城 / 新城 / 都会 — **不打算加音效**
- `zhongguo-chengshi` 中国城市生成器 — 生成器，5 种风格：重庆 8D 魔幻 / 上海陆家嘴 / 古都西安 / 赛博深圳 / 杭州江南水乡 — **不打算加音效**

两个生成器只有「重算一次」这一个事件，加一记点击声是装饰而不是反馈，所以它们不在音效名单上 ——
这是决定，不是欠账。等它们变成有目标的玩法再说。

- `mofang-palou` 魔方爬楼 — **无尽爬楼**，一座塔 = 一个 N 阶魔方（N×N×N），阶数三阶爬到六阶，六阶后靠打乱步数继续加压 — **有音效 + 触感 + 奖励反馈**（推柱和推行列一听就分得开）；砖面**画的是路线不是墙**（亮线在交界处接上才通，竖向连接是绿的），前两座是热身塔


闯关类合计 155 关（3 + 5 + 100 + 6 + 6 + 3 + 16 + 8 + 8）。其中迷宫穿越的 100 关由 `CHAPTERS` 端点插值生成，
难度曲线单调有测试守着；关卡本身由 seed 现场生成，所以同一关每次都是新图。
换翼计划的 16 关是手写波次表，但 Boss 血量由算式反推（推荐机翼的有效 DPS × 目标时长），
机器人通关测试守着「带对机翼过得去、带错机翼要付代价」这两条。
水弹堂的 8 关只有四个旋钮（柱阵排法、箱子密度、对手数量、对手档位），
关卡表本身有测试守着「对手数量和档位一路不降」，同一个大脑（skill=1）接管玩家跑完八关守着「每关都过得去」。
旋风卡丁的 8 关也是四个旋钮（弯道密度、路面宽度、圈数、对手档位），赛道中心线由极坐标谐波和生成，
所以「弯道密度」是一个可测的数：测试守着平均曲率一路走高、最紧的弯一路更紧。
它还多守一条别的游戏没有的东西——**玩法经济**：把玩家的手刹或氮气单独掐掉跑对照组，
八关都必须满足「漂移+喷 < 一路抓地 < 漂了不喷」，否则这游戏的核心循环就是假的。

## 游戏


- `wuqizi`：五子棋，支持分级 AI、积分、自动升阶和对局交流。
- `xiaoyuanmian`：校园谜案《回声画廊：消失的原作》，支持现场调查、角色询问、证据对质和最终指控。
- `nijie-tunshi`：3D 滚动吞噬游戏《霓界吞噬》，在荧光几何世界中成长并开启共鸣出口。
- `fangkuai-jifeng`：3D 体素风无尽跑酷《方块疾风》，三线变道、跳跃与滑铲，越跑越快。
- `eluosi-fangkuai`：手机触屏俄罗斯方块《方块坠塔》，SRS 旋转踢墙、7-bag 出块、暂存与 T-spin 计分。
- `guxing-maoxian`：手机触屏横版跳跃《菇星冒险》，跑跳踩敌、顶砖块出道具、蘑菇变大与星星无敌，三关连打。
- `xiaoxiaole`：手机触屏三消《甜果消消乐》，8x8 交换匹配、连锁下落、直线爆果与彩虹果，五关递进。
- `migong-chuansuo`：3D 体素风推移解谜《迷宫穿越》，整行整列推动带门的方砖对齐路线，**出口门拱长在砖上会跟着推移一起走**，跨层靠跃迁垫，100 关十章递进，带程序化音效与奖励反馈。

- `lvdong-danzhu`：手机触屏打砖块消除《律动弹珠》，同色三连整组消并穿墙连消，踩着拍子接球攒律动倍率，六关递进。
- `fengkuang-danzhu`：手机触屏回合制弹珠流《疯狂打弹珠》，拖动瞄准射出一串弹珠打带血量的砖块，吃加珠越打越多，无尽下压冲高分。
- `sanwei-chengshi`：程序化 3D 仿真城市地图生成器《三维城市》，一个 seed 生成河道、路网分级、用地分区与天际线楼宇，可点选查询楼宇档案。
- `xiaodui-qiangzhan`：手机触屏俯视角团队射击《小队枪战》，3v3 死斗、双摇杆自由移动与瞄准、软锁牵引与散布压枪。
- `chengshi-jianzao`：3D 城市建造师《天际营造》，从城门铺路，配平住宅、岗位、电力与环境分把人口做到目标，六关递进。
- `nizhe-yuanzheng`：3D 硬核越野卡车模拟《泥辙远征》，分动箱与差速锁、会越压越深的车辙、绞盘脱困与多趟运货，三趟任务递进。
- `zhongguo-chengshi`：程序化 3D 城市生成器《中国城市生成器》，重庆 8D 魔幻／上海陆家嘴／古都西安／赛博深圳／杭州江南水乡五种风格，布局、天际线、地形与特色构筑物全部可实时调参。
- `zhizhu-zhipai`：手机触屏蜘蛛纸牌《蜘蛛纸牌》，两副牌十摞牌桌，整段同花搬运、自动收门、提示与撤销，三档花色难度，关掉页面能接着打。提示分得清「有得走」和「值得走」。
- `mofang-palou`：3D 无尽爬楼解谜《魔方爬楼》，一座塔就是一个 N 阶魔方，推行、推列、**推柱**三条线族对齐路线，视角即轴选择器（俯视／侧视／转台），阶数三阶爬到六阶。
- `huanyi-jihua`：手机触屏纵版飞行射击《换翼计划》，机翼是可拆卸的战术模块——轻点弃翼换 1 秒无敌，代价是火力清零；带着翼被打中只掉翼，裸机被打中才掉命。敌弹能被打掉，所以火力密度同时是防御力。Boss 弱点决定哪种机翼打得进去，选错就从一场仗变成一场消耗。**捡到同型号机翼升阶（Mk.I→III），阶级跟着机翼走，弃翼扔掉的是一整套投资**；第 9 关起解锁引力井／链弧炮／相位激光／反物质弹／量子分身五种实验机翼。
- `shuidan-tang`：手机触屏格子对战《水弹堂》，QQ堂式的水弹十字爆流，**炸中不等于打死**——对手先被裹成水泡，水泡会自己挣脱，得在它挣脱前再补一发才算清掉。水泡是实体，堵在巷口就是一面临时的墙，也可能堵住你自己的退路；箱子既是掩体也是装备来源（加弹／加压／加速／踢弹）；限时内清场才算过关，时间到算输。八关递进，对手是会算退路的机器人，低档会把自己裹成水泡。
- `xuanfeng-kading`：手机触屏漂移竞速《旋风卡丁》，QQ 卡丁车式的手刹过弯与氮气喷射，**氮气是唯一的硬通货，而它只能从弯里攒出来**——拉手刹横着过弯付一点速度，攒到一档气，再在直道上喷回来；链子走完才赚，「漂了不喷」是全场最慢的开法。松手后半秒内再入漂算连喷，读秒最后一下按氮气是弹射起步、早按就罚站；油门全开、**没有刹车**，减速只有漂移和草地两种方式。玩家永远发在最后一排，尾流是唯一的免费资源。八关递进的是弯道密度而不是数值。



## 本地运行

安装依赖：

```bash
npm install
```

五子棋默认运行在 `http://localhost:4173`：

```bash
npm run dev
# 或 npm run dev:wuqizi
```

校园谜案默认运行在 `http://localhost:4174`：

```bash
npm run dev:xiaoyuanmian
```

霓界吞噬默认运行在 `http://localhost:4175`：

```bash
npm run dev:nijie-tunshi
```

方块疾风默认运行在 `http://127.0.0.1:4176`：

```bash
npm run dev:fangkuai-jifeng
```

方块坠塔默认运行在 `http://127.0.0.1:4177`：

```bash
npm run dev:eluosi-fangkuai
```

菇星冒险默认运行在 `http://127.0.0.1:4178`：

```bash
npm run dev:guxing-maoxian
```

甜果消消乐默认运行在 `http://127.0.0.1:4179`：

```bash
npm run dev:xiaoxiaole
```

迷宫穿越默认运行在 `http://127.0.0.1:4180`：

```bash
npm run dev:migong-chuansuo
```

律动弹珠默认运行在 `http://127.0.0.1:4181`：

```bash
npm run dev:lvdong-danzhu
```

疯狂打弹珠默认运行在 `http://127.0.0.1:4182`：

```bash
npm run dev:fengkuang-danzhu
```

三维城市默认运行在 `http://127.0.0.1:4183`：

```bash
npm run dev:sanwei-chengshi
```

小队枪战默认运行在 `http://127.0.0.1:4185`：

```bash
npm run dev:xiaodui-qiangzhan
```

天际营造默认运行在 `http://127.0.0.1:4190`：

```bash
npm run dev:chengshi-jianzao
```

泥辙远征默认运行在 `http://127.0.0.1:4186`：

```bash
npm run dev:nizhe-yuanzheng
```

中国城市生成器默认运行在 `http://127.0.0.1:4184`：

```bash
npm run dev:zhongguo-chengshi
```

换翼计划默认运行在 `http://127.0.0.1:4193`：

```bash
npm run dev:huanyi-jihua
```

水弹堂默认运行在 `http://127.0.0.1:4194`：

```bash
npm run dev:shuidan-tang
```

旋风卡丁默认运行在 `http://127.0.0.1:4195`：

```bash
npm run dev:xuanfeng-kading
```





五子棋和校园谜案的 MCP Streamable HTTP 端点都是各自服务下的 `/mcp`。霓界吞噬当前为无需服务端的固定种子核心原型，完整规划见 `nijie-tunshi/docs/game-design.md`。

## DeepSeek 配置

将对应 workspace 的 `.env.example` 复制为 `.env.local`，配置
`DEEPSEEK_API_KEY`。`DEEPSEEK_TIMEOUT_MS` 控制上游响应时间，默认 5000
毫秒。

五子棋在远程服务不可用时使用本地棋力引擎。校园谜案的案件真相、证据解锁和指控判定始终由固定服务端剧本控制；DeepSeek 只从当前角色允许公开的回答中选择，失败时使用本地预设对白，因此无 API key 也可以完整通关。

校园谜案的本地图片来源和许可证记录在
`xiaoyuanmian/public/images/credits.json`。

## 验证

```bash
npm test
npm run build
```

也可以只验证单个游戏：

```bash
npm run test:xiaoyuanmian
npm run build:xiaoyuanmian
npm run test:nijie-tunshi
npm run build:nijie-tunshi
npm run test:fangkuai-jifeng
npm run build:fangkuai-jifeng
npm run test:eluosi-fangkuai
npm run build:eluosi-fangkuai
npm run test:guxing-maoxian
npm run build:guxing-maoxian
npm run test:xiaoxiaole
npm run build:xiaoxiaole
npm run test:migong-chuansuo
npm run build:migong-chuansuo
npm run test:lvdong-danzhu
npm run build:lvdong-danzhu
npm run test:fengkuang-danzhu
npm run build:fengkuang-danzhu
npm run test:sanwei-chengshi
npm run build:sanwei-chengshi
npm run test:xiaodui-qiangzhan
npm run build:xiaodui-qiangzhan
npm run test:chengshi-jianzao
npm run build:chengshi-jianzao
npm run test:nizhe-yuanzheng
npm run build:nizhe-yuanzheng
npm run test:zhongguo-chengshi
npm run build:zhongguo-chengshi
npm run test:zhizhu-zhipai
npm run build:zhizhu-zhipai
npm run test:mofang-palou
npm run build:mofang-palou
npm run test:huanyi-jihua
npm run build:huanyi-jihua
npm run test:shuidan-tang
npm run build:shuidan-tang
npm run test:xuanfeng-kading
npm run build:xuanfeng-kading
```

## 打 Android APK

`migong-chuansuo` 和 `zhizhu-zhipai` 接了 Capacitor，原生工程分别在各自的 `android/`（已入版本库）。

```bash
$env:JAVA_HOME = "E:\apk\tools\jdk-21\jdk-21.0.5+11"   # 必须是 JDK 17–21
npm run apk:debug --workspace migong-chuansuo
npm run apk:debug --workspace zhizhu-zhipai
# 产物：<游戏>/android/app/build/outputs/apk/debug/app-debug.apk
```

两条最容易卡住的：**Android Studio 自带的 `jbr` 是 JDK 25，用不了**（Gradle 8.x 不支持 Java 25，
而 AGP 8.7 又还没跟上 Gradle 9），要另找一个 JDK 17–21；以及 `android/local.properties` 里的
`sdk.dir` 要指向本机 SDK（该文件按惯例不入库）。完整的坑位清单见
[`migong-chuansuo/README.md`](migong-chuansuo/README.md) 的「打 Android APK」一节。

实测体积：迷宫穿越 4.1 MB（带 Three.js），蜘蛛纸牌 3.90 MB（牌面是 DOM 真文字，前端零图片资源，
几乎就是 Capacitor 壳本身的体积）。两边的图标不一样：蜘蛛纸牌的启动图标是自己画的
vector（牌桌绿底 + 黑桃 + 背后一张蛛网），没有沿用 Android Studio 模板那套青绿方格底，
不然两个游戏装在同一台手机上，桌面会出现两个一模一样的图标。

要给别的游戏也打包，照 `migong-chuansuo` 抄三样东西：`vite.config.js` 里的 `base: './'`、
`capacitor.config.json`、以及 package.json 里的 `apk:*` 脚本，然后 `npx cap add android`。


