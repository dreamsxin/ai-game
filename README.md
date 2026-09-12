# AI 小游戏集合

每款游戏使用独立 workspace。需要对话或推理能力的游戏通过 MCP 工具接入 AI，实时 3D 游戏使用确定性规则保证操作响应。

## 进度总览

17 个游戏。「关卡」一列区分三种结构：**闯关**有关卡表，**无尽/单局**用难度或阶段代替关卡，**生成器**用风格预设代替关卡。
「音效」一列是持续在补的一项：6 个闯关游戏、方块坠塔、方块疾风、小队枪战、疯狂打弹珠、蜘蛛纸牌和魔方爬楼已经接上程序化音效、触觉反馈和奖励反馈，
剩下 5 个无尽／单局／生成器还是静默的。



- `guxing-maoxian` 菇星冒险 — 闯关 3 关：青草丘陵 / 砖窑遗迹 / 星塔之巅 — **有音效 + 触感 + 奖励反馈**（连踩越多音高越高）

- `xiaoxiaole` 甜果消消乐 — 闯关 5 关：果园初摘 / 蜜瓜小径 / 莓果集市 / 橙风长廊 / 甜果之巅 — **有音效 + 触感 + 奖励反馈**（连锁越深音高越高）

- `migong-chuansuo` 迷宫穿越 — 闯关 100 关，10 章递进：初启 / 错位 / 双阙 / 回环 / 叠城 / 深井 / 环廊 / 穹顶 / 虚径 / 归途（每章一套配色，尺寸 3×3 单层 → 7×7 四层） — **有音效 + 触感 + 奖励反馈**
- `lvdong-danzhu` 律动弹珠 — 闯关 6 关：初拍热场 / 霓光副歌 / 碎拍回响 / 双色跃动 / 高速切分 / 终章律动 — **有音效 + 触感 + 奖励反馈**（拍子现在听得见）

- `chengshi-jianzao` 天际营造 — 闯关 6 关：落基镇 / 双溪口 / 工坊区 / 绿荫台 / 临港城 / 天际都 — **有音效 + 触感 + 奖励反馈**（月报按严重程度出声）

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


闯关类合计 123 关（3 + 5 + 100 + 6 + 6 + 3）。其中迷宫穿越的 100 关由 `CHAPTERS` 端点插值生成，
难度曲线单调有测试守着；关卡本身由 seed 现场生成，所以同一关每次都是新图。

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
```

## 打 Android APK

目前只有 `migong-chuansuo` 接了 Capacitor，原生工程在 `migong-chuansuo/android/`（已入版本库）。

```bash
$env:JAVA_HOME = "E:\apk\tools\jdk-21\jdk-21.0.5+11"   # 必须是 JDK 17–21
npm run apk:debug --workspace migong-chuansuo
# 产物：migong-chuansuo/android/app/build/outputs/apk/debug/app-debug.apk
```

两条最容易卡住的：**Android Studio 自带的 `jbr` 是 JDK 25，用不了**（Gradle 8.x 不支持 Java 25，
而 AGP 8.7 又还没跟上 Gradle 9），要另找一个 JDK 17–21；以及 `android/local.properties` 里的
`sdk.dir` 要指向本机 SDK（该文件按惯例不入库）。完整的坑位清单见
[`migong-chuansuo/README.md`](migong-chuansuo/README.md) 的「打 Android APK」一节。

要给别的游戏也打包，照 `migong-chuansuo` 抄三样东西：`vite.config.js` 里的 `base: './'`、
`capacitor.config.json`、以及 package.json 里的 `apk:*` 脚本，然后 `npx cap add android`。


