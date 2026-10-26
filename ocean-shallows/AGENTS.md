# AGENTS.md — Ocean Shallows / 浅海

本文件是本项目的**唯一设定与约束来源**。任何人（包括 AI 代理）在改动 `index.html` 之前必须先读完本文，
改动之后必须回来同步更新受影响的小节。

---

## 1. 项目定位

- **是什么**：一个可以直接双击打开的 WebGL 小场景。俯视视角看一片热带浅海，左上角有一小片弧形沙滩，
  海底有沙纹、海草、珊瑚与碎石；底部磨砂玻璃卡片可以把 14 种海洋生物（3 种鳐、2 种水母、
  3 种鱼、1 种海龟、5 种鲸豚）抛进 / 放进海里。
- **不是什么**：不是游戏，没有分数、关卡、存档；不引入构建工具、不做模块拆分、不接后端。
- **现在的目标**：作为**桌面互动背景**常驻。没人碰它时界面自动淡出，只剩海面与生物；
  鼠标掠过留下细环，点击 / 拖动才有反应；可全屏、可锁帧、标签页隐藏时完全停下。
- **交付物**：`ocean-shallows/index.html`（唯一运行文件，约 174 KB）与本文 `AGENTS.md`。

## 2. 硬约束（不可协商）

| 约束 | 值 | 原因 |
| --- | --- | --- |
| 文件形态 | 单文件，HTML + CSS + JS 全内联 | 双击即开，可直接丢给静态站 |
| 三维库 | `three.js` **r128**，cdnjs CDN | 全文使用 r128 API（`outputEncoding`、`Geometry` 免迁移写法等） |
| 构建 | 无。不许出现 `npm`、`import`、打包器、外链脚本（three 除外） | 同上 |
| 外部资源 | 仅 Google Fonts（Fraunces + Nunito Sans）与 three CDN | 断网时标题降级为系统字体，场景仍须可用 |
| 语言 | 界面文案**全部中文**，代码注释可英文 | 用户要求 |
| 生物上限 | `CREATURE_CAP = 48` | 实例池 `cap = 16`/物种，共 14 物种 = 224 上限，逻辑层提前拦截 48 并 toast |
| 增量原则 | 改一个点就验证一个点；不要在未截图验证的情况下批量改色 | 见 §11 踩坑，色彩/曝光很容易连锁崩 |

> 之所以锁 r128：全文依赖 `THREE.sRGBEncoding`、`renderer.outputEncoding`、`RGBFormat` 时代的
> `WebGLRenderTarget` 行为、`Geometry.setAttribute` 与旧版 `InstancedMesh` 语义。升级 three 会连带
> 破坏水面合成与实例属性，属于**不允许的重构**。

## 3. 文件结构地图

`index.html` 内的分区（按自上而下顺序，注释里有 `// ----` 分隔线，可直接跳转）：

| 区块 | 内容 |
| --- | --- |
| `<style>` | 全部 UI 样式。命名空间：`.hud .brand .tools .tool .dock .pick .pickMenu .deck .card .thumb .hint .toast`，`body.hideui` |
| `<body>` | `#c` 画布、`.vignette`、`.grain`、HUD、7 个工具按钮、dock（`pickWrap` + `deck`）、提示、toast、`.fatal` 兜底层 |
| boot guards | `fatal()` 兜底、three 加载检查、`REDUCED`（prefers-reduced-motion）、`QS` 启动参数 |
| 世界常量 | `BEACH` `WORLD` `shoreDist()` `bedH()` |
| `renderer` / `scene` / `camera` | 渲染器设置、相机初始机位、`SUN_DIR`、`PALM_POS` |
| `U` | 全局共享 uniform（time / swell / rain / swirl / clarity / foam / sun / camPos） |
| lights | `sun` `hemi` `fill` 与阴影参数 |
| `GLSL_COMMON` | 所有 shader 共用的常量与噪声（`BC` `BR` `bedH` `swashFront` …） |
| `makeSceneRT` | 离屏场景目标（带 `DepthTexture`） |
| 高度场模拟 | `SIM = 256`、`simRT[]`、`simScene`、`simCam`、`simMat` |
| 水面 | `waterMat`（顶点位移 + 法线、焦散、泡沫、反射、闪光） |
| 背景 quad | `quadScene` / `quadMat`，把 `rtScene` 铺满全屏 |
| 沙地 / 海床 | `sandMat.onBeforeCompile` 注入沙纹法线、湿度、焦散、swash |
| 海草 / 珊瑚 / 乱石 / 碎石 / 海星 / 贝壳 / 海胆 | 全部 `InstancedMesh` |
| 棕榈 | `TubeGeometry` 树干 + 程序化 frond 三角带，`fronds[]` 摆动 |
| 生物几何 | `buildRay(cfg)` / `buildJelly(cfg)` / `buildFish(cfg)` / `buildTurtle(cfg)` / `buildWhale(cfg)`，`SPECIES` 参数表 |
| 生物着色器 | `RAY_VS` `MANTA_FS` `EAGLE_FS` `STING_FS` `JELLY_VS` `JELLY_FS` `FISH_VS` `TURTLE_VS` `SHARK_FS` `CLOWN_FS` `PUFFER_FS` `TURTLE_FS` `WHALE_FS`（五种鲸豚共用，靠 `W_*` define 分叉）、共享的 `CREATURE_LIGHT`（`shade()` / `throughWater()` / `hash21()`） |
| `makeRayRig` / `makeJellyRig` / `makeSwimmerRig` | 每个物种一对 `InstancedMesh`（`under` / `air`）+ `items[]`；`makeSwimmerRig` 同时服务鱼、海龟与鲸豚 |
| 生物状态机 | `spawnCreature` `updateCreature` `beginCreatureFrame` `endCreatureFrame` |
| 生物阴影 / 环境群 | `cShadow` 实例化贴地阴影、初始 12 只种群 |
| 粒子 / 涟漪 / 音频 | `pAir` `pUnder` `ringMesh` `addRing` `initAudio` `playSplash` `playPlink` |
| 卡片 / 工具 / 交互 | `GROUPS` `buildCard` `buildCards` `buildGroupMenu` `selectGroup` `openMenu` `closeMenu` `throwArc` `dropCreature` `toggle` 键盘 |
| ambient / 壁纸 | `sleepUI` `wakeUI` `setUIOffscreen` `togglePause` `toggleFullscreen` `applyDayCycle` |
| 主循环 | `resize()`、`warmUp()`、`startLoop` / `stopLoop`、`renderFrame()`、自适应画质 |

## 4. 世界坐标与几何不变量

```js
BEACH = { cx: -84, cz: -84, r: 70 }   // 海岸圆心与半径（GLSL 里是 BC / BR，必须同步）
WORLD = { min: -110, size: 220 }      // 海床平面覆盖范围
PALM_POS = (-41, bedH(...), -37)      // 棕榈根部，落在沙滩上
SUN_DIR  = normalize(-0.6, 0.53, -0.6)
```

`shoreDist(x,z) = |p - center| - r`，负值为陆地、正值为海。

`bedH(x,z)` 是**唯一权威的水深函数**，JS 与 GLSL 各有一份实现，两边必须逐项对齐：

```
bar  = 0.8 * exp(-((sd - 22) / 9)^2)                     // 近岸沙洲
sea  = -0.02 - 1.0*S(0,9,sd) - 3.4*S(0,45,sd)
              - 16.0*S(40,150,sd) + bar                   // S = smoothstep
land = -0.02 + 3.4*S(0,24,-sd)
```

> ⚠️ GLSL 版把第二项写成 `3.2`（历史遗留），JS 是 `3.4`。差异 < 8 cm，视觉不可见，
> 但**改动任一侧都必须双侧同步**，否则水面厚度与海床会错位。水深只用于着色，不存在穿模风险。

`swashFront(p, t)` 是浪花爬滩的解析式（双周期、沿 `(0.7071,-0.7071)` 方向传播，周期 7.4 s / 5.25 s），
沙地与水面泡沫都用它，必须保持**同一个函数**，否则泡沫会从湿沙上"脱落"。

## 5. 渲染架构（改动前必读）

采用**两遍渲染 + 图层分离**，`renderer.autoClear = false`：

```
pass 1  camera.layers = 0  →  rtScene（水下世界：海床、海草、珊瑚、碎石、棕榈、生物接触阴影）
pass 2  camera.layers = 1  →  屏幕：quadScene（把 rtScene 当背景铺满）→ scene 里的水面、生物、水花
```

**关键不变量：**

1. **水下物体放 layer 0**，水面 / 浮空生物 / 涟漪 / 粒子放 layer 1。
   用 `obj.layers.set(n)`（不是 `enable`），`camera.layers.enableAll()` 后每帧 `set(0)` / `set(1)`。
2. **水面材质 `depthWrite: false`**。它只负责上色，不遮挡后画的生物。
   一旦打开 `depthWrite`，生物会被整个水面挡掉。
3. **生物必须画在 layer 1（水面之后）并自己做水体吸收** ——
   `throughWater(color, worldY)` 按世界高度做指数衰减。
   **不要**回头去水面 shader 里采样 `uScene` 合成生物：实测该路径会把生物吃掉（见 §11.2）。
4. `palm.traverse(o => o.renderOrder = 2)`：棕榈在水面之后绘制，否则被水面颜色盖住。
5. `rtScene.texture.encoding = sRGBEncoding` → 自定义 shader 采样后**必须** `pow(tex, 2.2)` 解码，
   输出端又会自动编码，漏掉解码就会整体发灰。
6. 生物的双面薄片依赖深度测试区分背腹：`under` 材质 `depthTest = true`（水面不写深度，所以安全）。
   关掉 `depthTest` 会让白腹盖住黑背，整只鱼变成"灰白幽灵"。

## 6. 水体着色管线

水面顶点位移取高度场 + 解析涌浪，片元按以下顺序合成：

1. `N`：高度场坡度 + 噪声细纹波（`vnoise` 梯度，**不要**改回多方向正弦，会出现规则格纹）
2. `thick = depthW / max(dot(Nswell, V), 0.52)`；`depthW = max(0, -bed + hC * 1.55)`
   —— 用**解析水深**，不用深度纹理（深度纹理重建失败过，见 §11.3）
3. `absorb = exp(-vec3(0.255, 0.052, -0.008) * thick * uClarity)`
4. `waterCol = mix(uShallow, uDeep, pow(tint, 0.85))`，`tint = smoothstep(1.8, 12.5, thick)`
   `scatT = (1 - exp(-thick*0.048)) * 0.80 + 0.12 * uClarity`
   —— 那个 `+0.12` 是**浅滩保持青绿的关键**，去掉后 <1 m 的水会直接露出沙色发灰
5. `caus = caustic(p,t) * exp(-thick*0.12) * smoothstep(13, 1, thick)`
6. 泡沫：`shoreBand`（按厚度收窄）+ `breakMask`（碎浪）+ `laceC`（蕾丝纹）
7. `glit = pow(ndhS, 260.) * 0.95 + pow(ndh, 1400.) * 0.30` —— 高光必须用**平滑的 `Nswell`**，
   用带噪声的法线会产生全屏白噪点

**颜色条（改动请成组调，单改一项必失衡）：**

| 项 | 值 |
| --- | --- |
| `uShallow` | `#49d6c8` |
| `uDeep` | `#073a72` |
| 沙地干色 | `vec3(0.607, 0.545, 0.418)` |
| 沙地湿色 | `vec3(0.268, 0.236, 0.178)` |
| 沙地粗斑 | `* (0.90 + 0.20 * fbm(p*0.085+3))` |
| 光照 | `sun 1.95` / `hemi 0.85` / `fill 0.32`，`uSunCol` ×1.45 |

> three r128 的非物理光照在这套材质下**严重欠曝**：太阳 1.1 时沙地实测 sRGB 只有 0.41。
> 现取值是"看起来对"的经验值，不是物理值，不要按 PBR 常识"修正"回去。

**焦散尺度**：`caustic()` 与 `sdCaustic()` 是同一套公式的两份拷贝，参数为
`q = p * 2.55 + warp * 1.95`、`pow(1 - |a·b·c|, 7.0)`，再乘
`0.45 + 0.55 * smoothstep(0.30, 0.72, fbm(p*0.085))` 做空间疏密。
- 周期约 2.4 m。**不要调回 `p * 0.5`**：那是 12 m 的格子，会像泳池瓷砖。
- 两份拷贝必须同步修改，否则水下地面与其折射影像会对不上。
- 强度：水面 `bedCol * (1 + caus * 0.55)`，沙地 `* (1 + caus * 0.30)`。

## 7. GPU 高度场

- 256×256 `HalfFloatType` RenderTarget 乒乓；`simMat` 用 `(h, hPrev)` 浅水波方程：
  `v = (h - hp) * 0.9986; hn = h + v + 0.100 * lap`
- 长涌浪作为**源项**注入环形带（`smoothstep(44,66,al)*(1-smoothstep(92,112,al))`），
  相位与波数匹配：`ph = al * 0.46 - uTime * 7.50`
- 源振幅 `0.0009`、软限幅 `over = smoothstep(0.28, 0.80, |hn|)` → `hn = h + (hn-h)*(1-0.10*over)`
- 屏幕边缘吸收 `smoothstep(0, 17, edge)`
- **预热 420 步**（`warmUp()`）再进 RAF。少于此值会看到"尚未成形的棋盘格"。
- `uSwell` 由"平静"按钮插值到 0.10，`uFoam` 到 0.30。

## 8. 生物系统

### 8.1 物种参数（`SPECIES`）

`kind` 决定行为分支（`ray` / `jelly` / `fish` / `turtle` / `whale`），`rad` 只用于阴影与尾波半径。

| key | 中文 | kind | 尺寸 | 拍翅/脉动 | 速度 | 深度 `dep` | 半径 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `manta` | 蝠鲼 | ray | span 2.15 / chord 1.92 | 2.5 | 2.1 | [-4.6, -1.3] | 2.0 |
| `eagle` | 鹰鳐 | ray | span 1.58 / chord 1.62 | 2.9 | 2.3 | [-4.2, -1.1] | 1.6 |
| `sting` | 蓝斑魟 | ray | span 0.82 / chord 1.12 | 3.4 | 1.05 | [-0.85, -0.5] | 0.95 |
| `moon` | 海月水母 | jelly | R 0.64 / H 0.36 | 1.35 | 1.0 | [-5.5, -1.6] | 0.72 |
| `nettle` | 海荨麻 | jelly | R 0.50 / H 0.64 | 1.05 | 1.15 | [-6.5, -2.0] | 0.60 |
| `shark` | 乌翅真鲨 | fish | L 2.05 / W 0.235 | 1.45 | 2.45 | [-3.6, -1.1] | 1.45 |
| `clown` | 小丑鱼 | fish | L 0.78 / W 0.175 | 6.2 | 1.35 | [-1.5, -0.66] | 0.34 |
| `puffer` | 刺鲀 | fish | L 0.78 / W 0.355 | 4.6 | 0.82 | [-1.9, -0.80] | 0.40 |
| `turtle` | 绿海龟 | turtle | L 1.12 / W 0.44 | 1.05 | 0.80 | [-3.2, -1.05] | 0.95 |
| `humpback` | 座头鲸 | whale | L 4.40 / W 0.60 / H 0.64 | 0.70 | 1.05 | [-6.2, -2.6] | 2.30 |
| `orca` | 虎鲸 | whale | L 3.40 / W 0.55 / H 0.57 | 0.95 | 1.55 | [-5.6, -2.2] | 1.85 |
| `sperm` | 抹香鲸 | whale | L 3.60 / W 0.55 / H 0.53 | 0.66 | 0.95 | [-6.6, -2.8] | 2.05 |
| `dolphin` | 宽吻海豚 | whale | L 1.70 / W 0.205 / H 0.225 | 1.55 | 2.75 | [-3.4, -1.10] | 0.98 |
| `spinner` | 飞旋海豚 | whale | L 1.38 / W 0.152 / H 0.168 | 1.90 | 3.05 | [-3.0, -1.05] | 0.80 |

鱼的 `L` 是吻端到尾柄长度（不含尾鳍），`W/H` 是半宽 / 半高；海龟的 `L/W` 是背甲长 / 半宽；
鲸豚的 `L` 是吻端到尾柄（同样不含尾鳍），`W/H` 是中段**半宽 / 半高**。

鲸豚专属字段：`wave`（沿体半波数，鱼 4.6）、`blunt`（头部收窄量）、`dome`（吻端圆化量）、
`beak`（有喙海豚的吻突）、`boxHead`（抹香鲸方形头）、`fluke:[span,len]`、`dorsal:[h,len,z]`、
`pect:[len,width,sweep]`、`tubercles`（座头鲸结节排数）、`blow`（喷气强度，0 为不喷）、
`surfCd`（上浮周期基准，秒）、`breachOk`（允许跃水）、`school`（结群半径）。

花纹与结构（改动须保持"能从俯视认出来"）：

- **Manta**：黑背 + 肩部白斑、头鳍（cephalic fins）、白腹黑点
- **Eagle**：深背白斑 + 白环、长鞭尾
- **Sting**：黄褐底 + 电蓝斑、喷水孔、条纹尾
- **Moon**：四枚粉色马蹄形生殖腺、辐管、缘触手
- **Nettle**：琥珀钟体 + 锈色条纹、长拖尾触手、奶白褶皱口腕
- **Shark**：灰背白腹的反荫蔽、横张的胸鳍、**所有鳍尖为黑**（"乌翅"的全部含义）、叉形尾
- **Clown**：橙底 + 三道包身白环（各带黑边）、黑鳍缘、大黑眼
- **Puffer**：浑圆桶身 + 62 根短刺、背部深色雀斑、两只大眼、小喙
- **Turtle**：橄榄色鳞甲（砖砌网格 + 生长纹 + 缘盾齿）、奶黄腹甲、四支桨状鳍、钝头
- **Humpback**：炭灰背 + 白下颌、喉腹褶（ventral pleats）、**白色长胸鳍**（体长 1/4）、
  吻端 16 颗结节（tubercles）、低矮背鳍、深缺口尾鳍
- **Orca**：纯黑背 + 纯白腹、**眼后白斑**、灰色鞍斑（saddle patch）、所有鳍纯黑、
  雄性高背鳍（`dorsal[2] = 0.82` 是全场最高的鳍）
- **Sperm**：灰褐色、**方形巨头**（`boxHead` 把截面方化）、尾柄褶皱、下颌只有一条唇线（仅腹面）
- **Dolphin**：灰蓝三色带（深背 / 中灰 / 浅腹）、深色吻端、镰刀背鳍、宽吻突（`beak: 0.30`）
- **Spinner**：深色披风 + 浅赭侧带 + 白腹、极细长吻突（`beak: 0.38`）、三角小背鳍

> 鱼的尾鳍被刻意做**近水平**（两个叶片只微微上翘）。真实鱼尾是竖直的，但在俯视机位下
> 只剩一条线；压平之后叉尾才看得出来。这是场景的取舍，别"修正"回解剖正确。
> 鲸豚的尾鳍（fluke）本来就是水平的，俯视下反而是全场最好认的特征。

### 8.2 几何与实例

- `buildRay(cfg)`：上/下两片 sheet + tail + cephalic fins，属性 `aUV / aPart / aSheet`
- `buildJelly(cfg)`：钟体两片 + 触手 + 口腕，属性 `aUV / aPart / aInfo(vec4) / aSide`
- `buildFish(cfg)`：**一根封闭管**（`NU=24` 环 × `NV=18`）+ 鼻/尾端盖 + 胸鳍 + 背鳍 + 叉尾 +
  可选刺，属性只有 `aUV / aPart`。
  `aUV.u = sin(环角)`（-1 左 .. 1 右，连续无接缝），`aUV.v = 0 尾柄 .. 1 吻端`；
  `aPart`：0 身体 / 1 胸鳍 / 2 背鳍与尾鳍 / 3 刺。`cfg.round` 切成球形剖面（刺鲀）。
  剖面函数 `prof(v)`：吻端 `smooth(0.74,1.0)` 收到 18 %，尾柄 26 %，中段最粗。
- `buildTurtle(cfg)`：背甲 / 腹甲两片 sheet + 4 支桨状鳍 + 钝头，属性 `aUV / aPart / aSheet`
  （`aPart`：0 甲 / 1 前鳍 / 2 后鳍 / 3 头；`aUV.u` 对鳍是 0 根 → 1 尖）
- `buildWhale(cfg)`：**更粗的封闭管**（`NU=26` 环 × `NV=20` 边）+ 鼻/尾端盖 + 胸鳍 + 背鳍 + 尾鳍 +
  可选结节，属性同 `buildFish`（`aUV / aPart`）。
  - 剖面 `prof(v)` 是五个因子的乘积，比鱼多一层 `dome`：
    `tail(0.19→1) × barrel(1 + 0.09·sin) × head(1 - blunt·s) × snout(有喙才收) × dome(1 - d·s)`
  - `cfg.boxHead` 用 `Math.pow(|sin(角)|, 1 - sq)` 把截面方化（抹香鲸）
  - 胸鳍是三片渐窄叶片（`wR / wM / wT` = `L·0.080 / 0.050 / 0.012`），带 `sweep` 后掠
  - 背鳍是**薄四面体**（`b0 / b1(±h·0.52) / t`），不是平面片——见 §11.18
  - 尾鳍是**曲线采样扇形**：`N=6` 段，leading edge `z0 - len·0.62·t^1.6`、
    trailing edge `z0 - len·(0.48 + 0.14·t^0.7)`，两条曲线在 `t=1` 汇于尖端，
    `t→0` 的间隙自然形成中央缺口（notch）——见 §11.19
  - `cfg.tubercles` 在吻端 4×4 排布：`v = 0.765 + 0.195·(row+.5)/rows`、`ang = ((col+.5)/cols·2 - 1)·0.86`
- 实例属性：`aPhase / aAmp / aHold / aVel`
- ⚠️ **单几何体的 attribute 数量上限是 8 个 float**。水母曾因 `aHold` 超限编译失败，
  才把 `t/width/ang/len` 合并进 `aInfo`。新增属性前先数一遍。
- `define`：鳐 → `FLAP`（蝠鲼/鹰鳐拍翅）；魟 → `UNDULATE`（圆盘起伏）；水母用 `vPulse` 快收慢张；
  鲸豚 → `W_<KEY>`（`W_HUMPBACK` `W_ORCA` `W_SPERM` `W_DOLPHIN` `W_SPINNER`），
  五个物种**共用同一份 `WHALE_FS` 源码**，靠 `#ifdef` 编译期分叉，改一处花纹不会连锁影响别人。
- 鱼、海龟、鲸豚不靠 define 走顶点路径，各有自己的顶点着色器，全部由 uniform 驱动（每个物种一套材质）：
  - `FISH_VS`（鱼与鲸豚共用）：侧向波 `sin(ph - v * uWave)` 从头向尾增强（`uSway` 由 `cfg.sway` 给），
    胸鳍高频抖动，`aHold` 时被"捏住"的鱼挣扎更凶
  - `uWave` 是**沿体半波数**：鱼 4.6，鲸 3.0–3.2（长而慢的起伏），海豚 4.0–4.2。
    这个值原本硬编码在 `FISH_VS` 里，加鲸鱼时必须抽成 uniform，否则 4.4 m 的座头鲸会像条抽搐的鳗鱼
  - `TURTLE_VS`：两只前鳍同步划水（`pow(aUV.x,1.35)` 让尖端摆幅最大）、后鳍只做微调、头会左右看
- `uLen`（= `cfg.L`）是所有位移的尺寸基准，**换了物种尺寸必须跟着换**，否则鳍的摆幅不成比例
- 触手是 **camera-facing billboard 飘带**：随速度流向身后，静止时垂下，被悬空时滴水

### 8.3 状态机

`swim → held → arc / fall → swim`，另有 `breach`（**鳐类全部 + `cfg.breachOk` 的海豚**：偶尔跃出
水面翻转）与 `surf`（**海龟 + 所有鲸豚**：上浮换气）。

- `held`：跟随指针，`p.y` 平滑到 `holdY`，每 0.3–0.7 s 滴一滴水，并周期性在海面留湿环
- `arc`：`p.lerpVectors(from, to, k)` + `sin(kπ) * arcH` 抛物线，落地 `splash()`
- `swim`：洋流 `currentAt()` 叠加、朝 `target` 转向、`roll = clamp(-turn*9, ±0.55)` 侧倾、
  浅滩回避、漩涡吸引、被点击时 `flee`
- `surf`（`cfg.surf || cfg.blow`，海龟与全部鲸豚）：每 `surfCd·(0.65–1.45)` 秒上浮一次。
  0–0.85 s 抬升（pitch +0.27）、0.85–1.9 s 贴水面换气、之后下沉；越过 `y = -0.14` 时留一圈环，
  且 `c.gasped` 保证只触发一次。`t > 2.4` 且回到 `depthPref` 才退出，**否则会卡在水面**。
  - 鲸豚的抬升 / 下沉更慢（`riseRate 1.15`、`sinkRate 1.05 + 0.20·L`），大个体要给它足够时间
  - **喷气**（`cfg.blow`）：从**鼻端** `c.p + (sin yaw, cos yaw)·L·0.32` 而不是体心发出，
    否则水雾会从背中间冒出来。粒子数 `round(34·blow)`、初速 `4.2–5.8·blow`、
    寿命 1.10–1.80 s、尺寸 0.15–0.30。海龟走同一分支，只是滴 4 颗小水珠
- `flee`：`puffer` 会鼓到 1.5 倍（`c.puff` 平滑插值，进 `_sc` 的缩放），松开后自己缩回去
- `cfg.school`：对同类做一次轻量聚合——目标方向 55 % 原方向 + 45 % 同伴质心，
  这样一缸小丑鱼（3.4 m）或一群飞旋海豚（5.2 m）会自然聚群，而不会被硬拉成一个点
- `cfg.deep`：鲨鱼与三种大鲸只挑 `bedH < -2.2` 的开阔水域，不会蹭到沙滩
- 深度下限会算进体高：`wantY = max(wantY, bed + max(0.55, L·0.34))`，否则大鲸的腹部会插进海床
- 转向速率按体型分档：水母 2.0、鲸豚 2.5、其余 3.4 —— 4 m 的鲸不可能像小丑鱼一样急转
- 尾波间隔也按体型放慢：`isWhale ? 2.0 : 1`（鱼 2.6），强度 `isWhale ? 0.42 : 0.55`
- `updateCounter()` 输出 `鳐 N · 水母 M · 鱼 K · 龟 J · 鲸豚 P`（`n[rig.kind]++`，五个种类固定次序，
  缺项显示 0 而不是省略，避免计数行抖动换行）

### 8.4 帧内实例写入

```
beginCreatureFrame()            // 清空每个 rig 的 under.items / air.items
  updateCreature(c, dt, time)   // 推进状态，然后 c.bucket = above ? 'air' : 'under'
  push 到 rig[bucket].items
endCreatureFrame()              // 每个 rig: mesh.count = items.length，逐实例 setMatrixAt + 属性 buffer
```

- `mesh.frustumCulled = false`（实例包围盒不可靠）
- `instanceMatrix.setUsage(DynamicDrawUsage)`
- `mesh.count = 0` 时整批不画，所以**看不见生物优先查这里**（`items` 是否被正确 push）

### 8.5 卡片缩略图

- 每个物种用**真实 3D 模型**渲染一次，不画贴图：`renderThumbs()` 在启动时开一个 240×240
  `WebGLRenderTarget`，相机 `D = 1.22 / tan(16°)`，逐物种 `readRenderTargetPixels` 后翻转成 canvas。
- 四张查询表控制每个物种的取景，新增物种必须四张都填：
  `bgFor` 背景色、`ext` **取景尺度（≈ 模型最大尺寸，`2.0/ext` 是缩放）**、
  `lift` 视线目标的高度、`rot` 姿态 `[x, y, z]`。
- `ext` 不是"留白系数"而是"模型的包围尺寸"：小鱼给 1.2，座头鲸给 5.20。填大了模型缩成一点，
  填小了直接裁掉尾鳍。
- 现有 `ext` 值：`manta 3.1 / eagle 2.5 / sting 1.5 / moon 1.5 / nettle 1.4 / shark 3.1 /
  clown 1.2 / puffer 1.25 / turtle 1.5 / humpback 5.20 / orca 4.10 / sperm 4.30 /
  dolphin 1.95 / spinner 1.62`。
  鲸豚的取值空间极窄——从 5.85 降到 4.55 会裁尾鳍，再降到 4.55 以下又顶到画框，只能小步试。
- 鲸豚的姿态 `rot` 用俯视 3/4 角（`[0.46, 0.72, -0.05]` 一类）：`x` 越小越接近平视，
  尾鳍会被压缩；`x` 接近 0.5 时尾鳍展开最完整，但身体变成一条线。`lift` 基本留 0，
  只有虎鲸给 −0.05（它的高背鳍会把构图顶偏）。
- 背景色**按物种区分**：鳐与鱼用浅天蓝 `#bfe6ea` ~ `#aadde4`；水母用深水 `#3f8492` / `#35707f`；
  鲸豚用偏青的 `#84c1d1`（座头）/ `#7dbdd0`（虎鲸）/ `#8ac5d3`（抹香）/ `#93cdd9`（宽吻）/
  `#9ad3dd`（飞旋），越小的海豚底色越亮，卡片按组看时有层次。
  浅底上的半透明水母会直接消失，这是必须保留的设定。
- 卡片尺寸桌面 96 px（`.thumb` 同尺寸），≤1180 px 降 80，≤760 px 降 64，≤430 px 降 56。
- 英文名 `Blue-spotted Stingray` 正好吃满 96 px，**不要**再缩小卡片或加大字号，否则溢出到相邻卡片。
  `Bottlenose Dolphin` 与 `Humpback Whale` 同样接近上限。
- 一屏只显示**一组**物种（3–5 张），最宽的一组是「鲸豚」5 张 ≈ 5×96 + 4×8 = 512 px，
  960 px 以上视口完全放得下；`.deck` 仍留 `overflow-x:auto` 兜底。

## 9. 交互规格

### 卡片（dock）

| 操作 | 行为 |
| --- | --- |
| 点击（< 9 px 位移且 < 420 ms） | `throwArc()`：从卡片位置抛物线飞入海中，落水水花 + 涟漪 |
| 拖动（> 9 px） | 生物被"捏"在指针下，悬在水面上方，跟手移动 |
| 松手 | `dropCreature()`：在任意落点放下（水面上方则悬停后落入） |
| 达到 48 只 | toast `海中最多容纳 48 只生物`，不再生成 |

卡片是 `<button>`，桌面 96 px 宽；`pointerdown` 里 `setPointerCapture` 必须包 `try/catch`。
判定阈值为位移 < 9 px 且时长 < 420 ms。

### 物种分组下拉（`GROUPS` / `pickMenu`）

14 个物种平铺需要约 1.4 k px，所以卡座改成「左侧一个分组按钮 + 右侧该组的卡片」：

```js
GROUPS = [
  { cn: '鳐类', keys: ['manta', 'eagle', 'sting'] },
  { cn: '水母', keys: ['moon', 'nettle'] },
  { cn: '鱼类', keys: ['shark', 'clown', 'puffer'] },
  { cn: '海龟', keys: ['turtle'] },
  { cn: '鲸豚', keys: ['humpback', 'orca', 'sperm', 'dolphin', 'spinner'] }
]
```

- `pickWrap > button.pick`（`aria-haspopup="listbox"`、`aria-expanded` 跟随开合）＋
  `div.pickMenu[role="listbox"]`，每个选项是 `button[aria-selected]`。
- `buildGroupMenu()` 只建一次；`selectGroup(i)` 更新 `groupIdx` → `buildCards()` 重建 `deck`。
- **`deck` 重建时必须先 `if (drag) { dropCreature(drag.c); drag = null; }`**，否则换组后
  正在被拖的卡片从 DOM 里消失，生物永远卡在 `held`。
- 换组有 `deck.classList.remove('swap')` → 强制重排 → `add('swap')` 的淡入，不加会"啪"地跳一下。
- 键盘：`pick` 上 `ArrowDown/ArrowUp` 循环切组（并立即 `selectGroup`）、`Escape` 关闭；
  全局 `keydown` 也接了 `Escape → closeMenu()`。
- 点外部关闭：`document` 上 `pointerdown`，`!pickWrap.contains(e.target)` 时 `closeMenu()`。
- **`.dock` 必须 `overflow:visible`**，滚动交给 `.deck`；否则向上弹出的菜单会被 dock 裁掉。
  菜单 `bottom: calc(100% + 8px)`、`background: rgba(249,254,254,.93)`（低于 .90 会看不清）。
- `.pick` 没有固定高度：`align-self: stretch` + `height: 100%` + `justify-content: flex-end`
  + `padding-bottom: 12px`，才能和 96 px 的卡片等高、文字贴底对齐。
- 断点内尺寸：1180 px → 72×80，760 px → 60×64，430 px → 54×56 且隐藏 `.pkN`（「N 种」）。

### 工具条（7 个，含键盘）

| 按钮 | 键 | 行为 |
| --- | --- | --- |
| 降雨 | `R` | 雨滴涟漪 `rainRings` 注入高度场 |
| 漩涡 | `W` | 开启后**拖动水面**移动漩涡中心（`U.swirlPos`），切向坡度牵引生物 |
| 平静 | `C` | `uSwell → 0.10`、`uFoam → 0.30`，生物减速沉底 |
| 清澈 | `M` | `uClarity → 0.38`，水体更通透 |
| 声音 | `♪` | 合成海浪（噪声 + 滤波，增益跟 `swashReachJS` 同步）+ 溅水 + plink |
| 全屏 | `F` | `requestFullscreen` / 退出；≤760 px 隐藏该按钮（移动端无意义） |
| 隐藏 | `H` | `body.hideui`，隐藏全部 UI |

另有 `P` **暂停**：直接 `stopLoop()` 冻结整幅画面，再按恢复。没有按钮，只走键盘。

点击水面（非漩涡模式）会产生一圈涟漪 + 水花，附近 8 m 内的生物受惊逃走。

**掠过水面**：`canvas` 上的 `pointermove` 每 220 ms 最多留下一个 `addRing(x, z, 0.85, 0.13, 2.8)`
——极淡的细环，是"背景"能被无意间扰动的最小反馈。漩涡拖动时该分支让位给 `U.swirlPos`。

## 10. 性能与自适应

### 10.1 桌面背景（wallpaper）模式

| 项 | 默认 | 说明 |
| --- | --- | --- |
| 静默淡出 | 6.5 s（`?wallpaper=1` 时 2.8 s） | `pointermove` / `pointerdown` / `wheel` / `touchstart` / `keydown` / `focus` 唤醒；`document` 失焦立即淡出 |
| 淡出内容 | `.hud .tools .dock .hint` | **不含** `.vignette` 与 `.grain` —— 暗角与颗粒是画面的一部分，不是界面 |
| 拖动保护 | `pointerHeld` | 按住不放时计时器不生效，松手后重新计时 |
| 焦点保护 | `activeElement.closest('.dock,.tools')` | 键盘焦点在 UI 内时也不淡出 |
| 首次提示 | 一次性 toast | 非 wallpaper 模式第一次自动淡出后提示「界面已淡出 · 移动鼠标唤出」，否则会像坏了 |
| 光标 | `body.idle { cursor:none }` | 只在静默态生效 |
| 焦点隔离 | `inert` | 淡出时把 dock / tools 移出 tab 序，避免聚焦到看不见的按钮 |
| 帧率 | 不限（`?wallpaper=1` 时 30） | `?fps=N` 覆盖；跳帧实现，`last` **只在真正渲染时**更新，否则永远追不上阈值 |
| 后台 | `stopLoop()` | `visibilitychange` + `pagehide`；`pageshow`（bfcache，`e.persisted`）恢复 |
| 上下文丢失 | 3.5 s 后自动 `reload()` | three r128 无法保证 GPU 上下文回收后所有 buffer 重建 |
| 首帧 | `body.ready` 0.9 s 淡入 | 另有 4 s 兜底定时器，防止异常时整页停在 `opacity:0` |

**启动参数**

| 参数 | 作用 |
| --- | --- |
| `?wallpaper=1` / `?mode=wallpaper` | 直接进入静默态 + 30 Hz |
| `?fps=24` | 锁帧（≥5 才生效） |
| `?dpr=1.25` | 覆盖像素比上限（钳在 0.5–3） |
| `?q=low` | 初始 `QUALITY = 0.8` |
| `?cycle=1` | 把日光呼吸放大成 240 s 的可见暖冷循环 |

**日光呼吸**：默认 `sin(t·2π/420)` 驱动 `sun.intensity` ±3.15 %、`hemi` ±2.45 %，
肉眼几乎不可见但避免"死画面的光"。`?cycle=1` 时幅度 0.34，并在 `SUN_NEUTRAL / SUN_WARM / SUN_COOL`
之间插值 `sun.color`，同时同步 `waterMat.uniforms.uSunCol`（记得保持 ×1.45 的强度系数）。

**摆放建议**：Wallpaper Engine / Lively 用浏览器源指向 `index.html?wallpaper=1`，
分辨率与原屏一致；不要开"鼠标穿透"，否则卡片无法拖动。

### 10.2 自适应画质

- `DPR = min(devicePixelRatio, 2)`，`QUALITY` 作为乘数
- 每 45 帧统计 FPS，连续两轮 < 42 时 `QUALITY -= 0.16`（下限 0.62）并 `resize()`
- 阴影：`shadowMap.autoUpdate = false`，主循环里**隔帧**置 `needsUpdate = true`（`frameNo & 1`）。
  2048² 是最大单项开销；棕榈叶摆动很慢，30 Hz 更新肉眼不可见
- 目标：桌面 ≥ 50 fps（1080p、中端独显），移动端竖屏可读、不卡死

## 11. 踩坑清单（重犯概率高，务必先读）

1. **`dt` 必须为正**：`(now - last)/1000` 在 `--virtual-time-budget` 等无头环境会得到负值，
   `lerp` 反向外推 → 生物 `roll` 被推到 1.4 rad 侧立成一条线，看起来"消失"。
   已用 `Math.max(0.0005, Math.min(0.05, ...))` + `last = Math.max(last, now)` 双重钳制。
2. **生物不要走水面合成**：把生物画进 `rtScene` 再由水面 shader 采样（洋红标记 + `readRenderTargetPixels`
   反复验证过）——海床能透出、生物不能。现状是 layer 1 自绘 + `throughWater` 吸收。
3. **深度纹理重建厚度不可靠**：`DepthTexture` 采样在这条管线里拿不到稳定值（水面全浅绿 / 全亮）。
   已改为解析水深（与海床 mesh 同公式）。
4. **GLSL 保留字 `patch`**：加虎鲸眼后白斑时变量名写作 `patch`，整个页面直接
   `ERROR: 0:147: 'patch' : Illegal use of reserved word`，着色器编译失败 → 全屏只剩背景。
   已改为 `cheek`。`ptc` 同理（鳐的花纹变量）。`PI` 已由 three 内置 `#define`，
   不要在 `GLSL_COMMON` 里重复定义。
   附带踩坑：想在注释里写 ``patch``（反引号）说明这件事，但整段 shader 本身就是 JS 模板字符串，
   反引号会提前闭合字符串 → `Uncaught SyntaxError: Unexpected identifier 'patch'`。
   **在 shader 模板串里不要出现反引号。**
5. **`normalMatrix` 不是片元内建**：在 `onBeforeCompile` 的片元头部手动声明
   `uniform mat3 normalMatrix;`。
6. **attribute 上限 8**：见 §8.2。
7. **阴影相机必须覆盖整个可见盆地**（现 `±95`）：早先只覆盖沙滩 `±44`，远处海床被压暗近一半。
8. **高光用平滑法线**：噪声法线进 `pow(..., 260)` 会得到全屏白噪点。
9. **无头 Chrome 最小布局宽度 500**：`--window-size=390,...` 实际按 500 布局后裁切，
   竖屏验证请用 ≥ 420 并接受裁切，或直接用 500 宽。
10. **`resize()` 会重设相机**：调试想固定机位要包 `renderer.render`，别只在末尾改一次。
11. **`#screenshot` 写盘权限**：输出到 `%TEMP%`，不要写项目目录以外的受限路径。
12. **`setPointerCapture` 会抛异常**：对合成 / 过期 pointerId 调用会抛 `NotFoundError`，
    而它写在 `pointerdown` 末尾，一旦抛出，后续逻辑全断。已包 `try/catch`。
13. **水面"雾"可能来自碎浪泡沫**：`breakMask` 早期用 `smoothstep(4.2, 1.0, thick)`，
    导致整个浅盆都盖一层白蕾丝。现在收窄到 `smoothstep(2.4, 0.5, thick)`。
    遇到"整片海发白 / 像雪花噪点"，先 A/B 关掉 `foam` 与 `caus` 各截一张图再判断。
14. **`uSun` 是方向，不是颜色**：`shade()` 早期写 `col += uSun * pow(...)`，把光照方向当颜色加进去。
    鳐的薄片上只是隐约发绿，但刺鲀和海龟这种又宽又光滑的表面会直接鼓出一块**亮绿色斑**。
    现在高光用固定的 `vec3(1.0,0.97,0.90)`。改动 `shade()` 要同时看鳐、水母、鱼、龟四类。
15. **管状体的端盖是个平面圆盘**：`prof(v)` 收得不够尖，吻部就会像"鸭嘴"。
    鱼用 `1 - 0.82*smooth(0.74,1.0,v)` 把吻端收到 18 %，再加端盖才不显平。
16. **腹部反荫蔽的边界不能太窄**：`bellyMask` 用 `smoothstep(0.30,-0.62,N.y)`；
    早期 `(0.12,-0.30)` 在鱼身上会画出一条像折痕的硬边。
17. **俯视下竖直薄片的投影面积为零**：背鳍第一版是一个竖直的平面片（两条三角形拼的 quad），
    相机在正上方时它退化成一条 1 px 的线，五只鲸看起来都"没有背鳍"。
    必须建成**有厚度的四面体**（底边 `±h·0.52`、顶点后掠），俯视才有可见的梯形轮廓。
    同理，胸鳍初版藏在腹下（`y = -H·0.72`），俯视完全看不到，抬到 `-H·0.05 ~ -H·0.21` 才露出来。
18. **鲸鱼尾鳍很容易做成"领结"**：第一版让两个叶片各自从中心点向斜后方铺开，
    俯视就是标准的蝴蝶结/领结；第二版改成"四点多边形整体向后"→ 变成锤头鲛的锤头。
    正确解法是**沿两条曲线采样**：leading edge `t^1.6`（前缘几乎平直、末端急速收）、
    trailing edge `0.48 + 0.14·t^0.7`（后缘缓慢跟随），两条线在 `t=1` 汇于尖端，
    `t→0` 的间隙就是中央缺口。数一下顶点顺序，别让扇形自交。
19. **管状体收尾不够就成"餐盘"**：`buildWhale` 的 `prof(v)` 早期只有 `head` 项，
    吻端仍然是一个半径 0.3 的平面圆盘，座头鲸从上方看像顶了个盘子。
    加 `dome` 项（`1 - d·smooth(0.92, 1.0, v)`）并按物种配 `dome`：
    座头 0.28 / 虎鲸 0.42 / 抹香 0.16（它本来就是方的）/ 宽吻海豚 0.55 / 飞旋 0.62。
20. **喷气粒子"看不见"要先分清是没喷还是没画**：截图为空时先读
    `pAir.P` 与 `aAlpha` 数组（`blew=-1 live=0` → 根本没触发），别急着调粒子尺寸。
    无头环境下 rAF 帧数不可控，`--virtual-time-budget` 常常只跑十几帧，
    要手动 `for` 循环调 `window.__update(1/60, t)` 驱动，并在循环里锁死 `c.p` 与相机。

## 12. 验证流程

无构建、无测试框架，**唯一验收方式是截图 + 取色 + DOM 断言**。

```bash
# 桌面
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
  --no-sandbox --hide-scrollbars --window-size=1440,900 \
  --virtual-time-budget=9000 \
  --screenshot="C:/Users/Administrator/AppData/Local/Temp/shot.png" \
  "file:///D:/work/ai-game/ocean-shallows/index.html"
```

- 取色：自写 `px.py`（zlib 解 PNG，无第三方依赖），用来判断是不是真的告警/过曝/欠曝，
  不要只靠肉眼看截图缩略图。
- DOM 断言：`--dump-dom` + `grep` 读计数器文本（`鳐 N · 水母 M · 鱼 K · 龟 J · 鲸豚 P`）与按钮 `class="tool on"`。
- 交互验证：注入合成 `PointerEvent`（`pointerdown/move/up`）驱动卡片拖拽与点击，
  比手点更可复现。
- 临时调试图**必须**用 `dbg*.html` 命名并在结束时删除，仓库里只留 `index.html`。

### 每次改完的自检清单

- [ ] 没有新增外部依赖 / 没有多文件
- [ ] 水面不透出生物 → 检查 `depthWrite` 与 layer
- [ ] 生物看不见 → 先看 `rig.under.count` 与 `items`
- [ ] 改色后重新截图，确认近岸青绿 / 远海深蓝没有翻转
- [ ] 竖屏 430px 宽下工具条与卡片不溢出（无头最小 500 宽，需按 500 判断）
- [ ] 5 个分组在 1440 / 1100 / 500 宽下都能切到，最宽的「鲸豚」组 5 张卡不溢出
- [ ] 换组时若手上有拖动中的生物，先 `dropCreature` 再重建，不会留下卡在 `held` 的幽灵
- [ ] 新物种能在场景里被认出来（用 `dbg*.html` 把相机压低到 3~4 m 单只观察，看完删掉）
- [ ] 鲸豚上浮会喷气（`BLOW:whales=N | airParticles=M`，且粒子从鼻端冒出、不在背中间）
- [ ] 海龟会浮上水面再沉回去、刺鲀受惊鼓起 1.5 倍（直接连调 `window.__update(dt,t)` 400 步最省事，
      无头环境下 rAF 帧数不可控，用帧数等待会等不到）
- [ ] 控制台无 shader 编译错误（用 §12 的 `errlog` 注入法）；新增鲸豚后尤其要看
      `W_*` define 是否漏传，漏了会掉进 `#else`（飞旋海豚）分支而不是报错，花纹会"长错物种"
- [ ] 水母缩略图仍能在深色底上辨认出钟体与触手
- [ ] `.fatal` 覆盖层默认不出现（`#fatal` 的 class 不含 `show`）
- [ ] 普通模式 6.5 s 后 `body` 带 `idle`；`?wallpaper=1` 一进来就带 `idle`
- [ ] `document.dispatchEvent(new Event('blur'))` 立刻 idle，`pointermove` 立刻唤醒
- [ ] `?fps=30` 与 `?q=low` 下画面连续、无黑边、无报错
- [ ] 按 `P` 冻结后 `rafId === 0`，再按恢复；切到别的标签页再回来不会双循环

## 13. 健壮性与无障碍

| 机制 | 位置 | 行为 |
| --- | --- | --- |
| CDN 失败 | boot guards | `window.THREE` 缺失 → `.fatal` 覆盖层「无法加载 three.js」+ 重新加载按钮 |
| WebGL 失败 | renderer 构造 try/catch | 覆盖层「无法初始化 WebGL」 |
| 上下文丢失 | `webglcontextlost` | `preventDefault()` + 覆盖层提示刷新 |
| 降级动效 | `REDUCED` | `prefers-reduced-motion: reduce` 时不跃水、抛入旋转降速、CSS 过渡归零 |
| 后台标签页 | `visibilitychange` | 隐藏时把 master gain 收到 0，回到前台恢复 0.5 并重置 `last` |
| 键盘 | 全局 keydown | `R/W/C/M/H`；不要加需要输入焦点的快捷键 |
| 语义 | HTML | 画布 `role="img"`、计数 `aria-live="polite"`、`aria-pressed` 跟随按钮状态、卡片带中文 `aria-label` |
| 焦点 | CSS | `:focus-visible` 用 2px 深青描边，保证键盘可见 |

## 14. 代码风格

- IIFE + `'use strict'`，全程 `const`/`let`，不用 class
- 数学工具统一用文件顶部的 `clamp / lerp / smooth / rand`
- 着色器写成模板字符串常量，GLSL 片段尽量复用 `GLSL_COMMON`
- 单位：米、秒、弧度；坐标 y 向上，水面 y ≈ 0
- 注释用英文，UI 文案用中文
- 行宽不强制，但长 GLSL 行保持"一个概念一行"

## 15. 待办 / 未做

- [x] 阴影更新降频 —— 已改为隔帧
- [x] 无 WebGL / CDN 失败兜底 —— 已加 `.fatal` 覆盖层与上下文丢失处理
- [x] `prefers-reduced-motion` —— 已关跃水、降旋转、去 CSS 过渡
- [x] 桌面背景模式 —— 静默淡出、全屏、锁帧、后台暂停、上下文自动恢复、首帧淡入
- [x] 卡片过多 —— 已改为 `GROUPS` 五组 + `pickMenu` 分组下拉，一屏最多 5 张
- [ ] 移动端工具条 6 个按钮（`full` 已隐藏）在 430px 下仍偏挤，可收进"更多"折叠菜单
- [ ] 分组下拉目前只有纵向列表，物种更多时（>8 组）可考虑带缩略图的网格弹层
- [ ] 真正作为壁纸时无法接收鼠标事件（Wallpaper Engine 的源本身不转发），
      可考虑用 `?ambient=1` 让生物按更长的随机间隔自行投放，长时间不重样
- [ ] 鲸豚目前只有 5 种，还能加：蓝鲸（超长体型）、灰鲸（白斑 + 无背鳍）、
      白鲸（纯白 + 额隆）、拟虎鲸、真海豚（结群游）。加之前先确认 `WHALE_FS` 是否需要新的 `#ifdef`，
      以及 `GROUPS` 的「鲸豚」组要拆成「须鲸 / 齿鲸」
- [ ] 鲸豚的胸鳍只有俯仰摆动，没有真正的划水行程；远看的动态略"飘"
- [ ] 喷气目前是纯白雾 + 重力回落，缺一个"喷完在水面留一层白沫圈"的收尾
- [ ] 长时间运行（>24 h）后 `U.time` 精度下降可能导致噪声抖动，可考虑对 `uTime` 取模
- [ ] 生物被拖到沙滩上时的落地表现（现在统一按水面处理）
- [ ] 近距观察时水面泡沫呈"块状"，需要更细的 lace 分形（p×8 那层不够碎）
- [ ] 沙滩在俯视全景下偏平，沙纹起伏目前只有约 6% 对比，可加一层暗部颗粒
- [ ] 可选：把「清空海中生物」做成隐藏手势（长按 HUD 计数）
