# AI 小游戏集合

每款游戏使用独立 workspace。需要对话或推理能力的游戏通过 MCP 工具接入 AI，实时 3D 游戏使用确定性规则保证操作响应。

## 进度总览

15 个游戏。「关卡」一列区分三种结构：**闯关**有关卡表，**无尽/单局**用难度或阶段代替关卡，**生成器**用风格预设代替关卡。
「音效」一列是持续在补的一项：6 个闯关游戏已经全部接上程序化音效、触觉反馈和奖励反馈，
剩下 9 个无尽／单局／生成器还是静默的。


- `guxing-maoxian` 菇星冒险 — 闯关 3 关：青草丘陵 / 砖窑遗迹 / 星塔之巅 — **有音效 + 触感 + 奖励反馈**（连踩越多音高越高）

- `xiaoxiaole` 甜果消消乐 — 闯关 5 关：果园初摘 / 蜜瓜小径 / 莓果集市 / 橙风长廊 / 甜果之巅 — **有音效 + 触感 + 奖励反馈**（连锁越深音高越高）

- `migong-chuansuo` 迷宫穿越 — 闯关 6 关：初启 / 错位 / 双阙 / 回环 / 叠城 / 终穿 — **有音效 + 触感 + 奖励反馈**
- `lvdong-danzhu` 律动弹珠 — 闯关 6 关：初拍热场 / 霓光副歌 / 碎拍回响 / 双色跃动 / 高速切分 / 终章律动 — **有音效 + 触感 + 奖励反馈**（拍子现在听得见）

- `chengshi-jianzao` 天际营造 — 闯关 6 关：落基镇 / 双溪口 / 工坊区 / 绿荫台 / 临港城 / 天际都 — **有音效 + 触感 + 奖励反馈**（月报按严重程度出声）

- `nizhe-yuanzheng` 泥辙远征 — 闯关 3 趟：木料上山 / 沼泽钢管 / 变压器过河 — **有音效 + 触感 + 奖励反馈**（转速驱动的常驻引擎音）

- `nijie-tunshi` 霓界吞噬 — 单张固定地图，6 段形态成长 + 7 段剧情推进 — 无音效
- `fangkuai-jifeng` 方块疾风 — 无尽跑酷，4 个视觉分区：翠原 / 流沙 / 霓虹 / 虚空 — 无音效
- `eluosi-fangkuai` 方块坠塔 — 无尽，15 级速度等级（每 10 行升一级） — 无音效
- `fengkuang-danzhu` 疯狂打弹珠 — 无尽，每 10 回合升一个阶段 — 无音效
- `wuqizi` 五子棋 — 单局对战，4 档 AI：入门 / 进阶 / 高手 / 大师（`src/game.js` 里的 `LEVELS` 是搜索深度档位，不是关卡） — 无音效
- `xiaodui-qiangzhan` 小队枪战 — 单局 3v3，单张竞技场，15 分或 180 秒结束 — 无音效
- `xiaoyuanmian` 校园谜案 — 单案件《回声画廊》，4 个场景 4 名嫌疑人 — 无音效
- `sanwei-chengshi` 三维城市 — 生成器，3 档规模：小城 / 新城 / 都会 — 无音效
- `zhongguo-chengshi` 中国城市生成器 — 生成器，5 种风格：重庆 8D 魔幻 / 上海陆家嘴 / 古都西安 / 赛博深圳 / 杭州江南水乡 — 无音效

闯关类合计 29 关（3 + 5 + 6 + 6 + 6 + 3）。

## 游戏


- `wuqizi`：五子棋，支持分级 AI、积分、自动升阶和对局交流。
- `xiaoyuanmian`：校园谜案《回声画廊：消失的原作》，支持现场调查、角色询问、证据对质和最终指控。
- `nijie-tunshi`：3D 滚动吞噬游戏《霓界吞噬》，在荧光几何世界中成长并开启共鸣出口。
- `fangkuai-jifeng`：3D 体素风无尽跑酷《方块疾风》，三线变道、跳跃与滑铲，越跑越快。
- `eluosi-fangkuai`：手机触屏俄罗斯方块《方块坠塔》，SRS 旋转踢墙、7-bag 出块、暂存与 T-spin 计分。
- `guxing-maoxian`：手机触屏横版跳跃《菇星冒险》，跑跳踩敌、顶砖块出道具、蘑菇变大与星星无敌，三关连打。
- `xiaoxiaole`：手机触屏三消《甜果消消乐》，8x8 交换匹配、连锁下落、直线爆果与彩虹果，五关递进。
- `migong-chuansuo`：3D 体素风推移解谜《迷宫穿越》，整行整列推动带门的方砖对齐路线，跨层靠跃迁垫，六关递进，带程序化音效与奖励反馈。

- `lvdong-danzhu`：手机触屏打砖块消除《律动弹珠》，同色三连整组消并穿墙连消，踩着拍子接球攒律动倍率，六关递进。
- `fengkuang-danzhu`：手机触屏回合制弹珠流《疯狂打弹珠》，拖动瞄准射出一串弹珠打带血量的砖块，吃加珠越打越多，无尽下压冲高分。
- `sanwei-chengshi`：程序化 3D 仿真城市地图生成器《三维城市》，一个 seed 生成河道、路网分级、用地分区与天际线楼宇，可点选查询楼宇档案。
- `xiaodui-qiangzhan`：手机触屏俯视角团队射击《小队枪战》，3v3 死斗、双摇杆自由移动与瞄准、软锁牵引与散布压枪。
- `chengshi-jianzao`：3D 城市建造师《天际营造》，从城门铺路，配平住宅、岗位、电力与环境分把人口做到目标，六关递进。
- `nizhe-yuanzheng`：3D 硬核越野卡车模拟《泥辙远征》，分动箱与差速锁、会越压越深的车辙、绞盘脱困与多趟运货，三趟任务递进。
- `zhongguo-chengshi`：程序化 3D 城市生成器《中国城市生成器》，重庆 8D 魔幻／上海陆家嘴／古都西安／赛博深圳／杭州江南水乡五种风格，布局、天际线、地形与特色构筑物全部可实时调参。


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
```

