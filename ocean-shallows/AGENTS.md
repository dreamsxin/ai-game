# AGENTS.md — Ocean Shallows / 浅海

本文件是本项目的**唯一设定与约束来源**。任何人（包括 AI 代理）在改动 `index.html` 之前必须先读完本文，
改动之后必须回来同步更新受影响的小节。

---

## 1. 项目定位

- **是什么**：一个可以直接双击打开的 WebGL 小场景。俯视视角看一片热带浅海，左上角有一小片弧形沙滩，
  海底有沙纹、海草、珊瑚与碎石；底部磨砂玻璃卡片可以把鳐鱼、水母抛进 / 放进海里。
- **不是什么**：不是游戏，没有分数、关卡、存档；不引入构建工具、不做模块拆分、不接后端。
- **现在的目标**：作为**桌面互动背景**常驻。没人碰它时界面自动淡出，只剩海面与生物；
  鼠标掠过留下细环，点击 / 拖动才有反应；可全屏、可锁帧、标签页隐藏时完全停下。
- **交付物**：`ocean-shallows/index.html`（唯一运行文件，约 124 KB）与本文 `AGENTS.md`。

## 2. 硬约束（不可协商）

| 约束 | 值 | 原因 |
| --- | --- | --- |
| 文件形态 | 单文件，HTML + CSS + JS 全内联 | 双击即开，可直接丢给静态站 |
| 三维库 | `three.js` **r128**，cdnjs CDN | 全文使用 r128 API（`outputEncoding`、`Geometry` 免迁移写法等） |
| 构建 | 无。不许出现 `npm`、`import`、打包器、外链脚本（three 除外） | 同上 |
| 外部资源 | 仅 Google Fonts（Fraunces + Nunito Sans）与 three CDN | 断网时标题降级为系统字体，场景仍须可用 |
| 语言 | 界面文案**全部中文**，代码注释可英文 | 用户要求 |
| 生物上限 | `CREATURE_CAP = 48` | 实例池 `cap = 16`/物种，共 5 物种 = 80 上限，逻辑层提前拦截 48 并 toast |
| 增量原则 | 改一个点就验证一个点；不要在未截图验证的情况下批量改色 | 见 §11 踩坑，色彩/曝光很容易连锁崩 |

> 之所以锁 r128：全文依赖 `THREE.sRGBEncoding`、`renderer.outputEncoding`、`RGBFormat` 时代的
> `WebGLRenderTarget` 行为、`Geometry.setAttribute` 与旧版 `InstancedMesh` 语义。升级 three 会连带
> 破坏水面合成与实例属性，属于**不允许的重构**。

## 3. 文件结构地图

`index.html` 内的分区（按自上而下顺序，注释里有 `// ----` 分隔线，可直接跳转）：

| 区块 | 内容 |
| --- | --- |
| `<style>` | 全部 UI 样式。命名空间：`.hud .brand .tools .tool .dock .card .thumb .hint .toast`，`body.hideui` |
| `<body>` | `#c` 画布、`.vignette`、`.grain`、HUD、7 个工具按钮、dock、提示、toast、`.fatal` 兜底层 |
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
| 生物几何 | `buildRay(cfg)` / `buildJelly(cfg)`，`SPECIES` 参数表 |
| 生物着色器 | `RAY_VS` `MANTA_FS` `EAGLE_FS` `STING_FS` `JELLY_VS` `JELLY_FS`、`shade()` `throughWater()` |
| `makeRayRig` / `makeJellyRig` | 每个物种一对 `InstancedMesh`（`under` / `air`）+ `items[]` |
| 生物状态机 | `spawnCreature` `updateCreature` `beginCreatureFrame` `endCreatureFrame` |
| 生物阴影 / 环境群 | `cShadow` 实例化贴地阴影、初始 12 只种群 |
| 粒子 / 涟漪 / 音频 | `pAir` `pUnder` `ringMesh` `addRing` `initAudio` `playSplash` `playPlink` |
| 卡片 / 工具 / 交互 | `CARD_ORDER` `bindCard` `throwArc` `dropCreature` `toggle` 键盘 |
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

| key | 中文 | span / R | chord / H | 尾长 | 拍翅/脉动 | 深度 `dep` | 半径 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `manta` | 蝠鲼 | 2.15 | 1.92 | 3.4 | 2.5 | [-4.6, -1.3] | 2.0 |
| `eagle` | 鹰鳐 | 1.58 | 1.62 | 3.9 | 2.9 | [-4.2, -1.1] | 1.6 |
| `sting` | 蓝斑魟 | 0.82 | 1.12 | 1.8 | 3.4 | [-0.85, -0.5] | 0.95 |
| `moon` | 海月水母 | 0.64 | 0.36 | — | 1.35 | [-5.5, -1.6] | 0.72 |
| `nettle` | 海荨麻 | 0.50 | 0.64 | — | 1.05 | [-6.5, -2.0] | 0.60 |

花纹与结构（改动须保持"能从俯视认出来"）：

- **Manta**：黑背 + 肩部白斑、头鳍（cephalic fins）、白腹黑点
- **Eagle**：深背白斑 + 白环、长鞭尾
- **Sting**：黄褐底 + 电蓝斑、喷水孔、条纹尾
- **Moon**：四枚粉色马蹄形生殖腺、辐管、缘触手
- **Nettle**：琥珀钟体 + 锈色条纹、长拖尾触手、奶白褶皱口腕

### 8.2 几何与实例

- `buildRay(cfg)`：上/下两片 sheet + tail + cephalic fins，属性 `aUV / aPart / aSheet`
- `buildJelly(cfg)`：钟体两片 + 触手 + 口腕，属性 `aUV / aPart / aInfo(vec4) / aSide`
- 实例属性：`aPhase / aAmp / aHold / aVel`
- ⚠️ **单几何体的 attribute 数量上限是 8 个 float**。水母曾因 `aHold` 超限编译失败，
  才把 `t/width/ang/len` 合并进 `aInfo`。新增属性前先数一遍。
- `define`：鳐 → `FLAP`（蝠鲼/鹰鳐拍翅）；魟 → `UNDULATE`（圆盘起伏）；水母用 `vPulse` 快收慢张
- 触手是 **camera-facing billboard 飘带**：随速度流向身后，静止时垂下，被悬空时滴水

### 8.3 状态机

`swim → held → arc / fall → swim`，另有 `breach`（蝠鲼/鹰鳐偶尔跃出水面翻转）。

- `held`：跟随指针，`p.y` 平滑到 `holdY`，每 0.3–0.7 s 滴一滴水，并周期性在海面留湿环
- `arc`：`p.lerpVectors(from, to, k)` + `sin(kπ) * arcH` 抛物线，落地 `splash()`
- `swim`：洋流 `currentAt()` 叠加、朝 `target` 转向、`roll = clamp(-turn*9, ±0.55)` 侧倾、
  浅滩回避、漩涡吸引、被点击时 `flee`
- 种群数量变化 → `updateCounter()` 输出 `N 条鳐 · M 只水母`

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
- 背景色**按物种区分**（`bgFor`）：鳐用浅天蓝 `#bfe6ea` / `#c6e8e9`；水母用深水
  `#3f8492` / `#35707f`。浅底上的半透明水母会直接消失，这是必须保留的设定。
- 卡片尺寸桌面 96 px（`.thumb` 同尺寸），≤760 px 降 64，≤430 px 降 56。
- 英文名 `Blue-spotted Stingray` 正好吃满 96 px，**不要**再缩小卡片或加大字号，否则溢出到相邻卡片。

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
4. **GLSL 保留字**：`patch` 是 r128 的保留字，变量名用 `ptc`；`PI` 已由 three 内置 `#define`，
   不要在 `GLSL_COMMON` 里重复定义。
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
- DOM 断言：`--dump-dom` + `grep` 读计数器文本（`N 条鳐 · M 只水母`）与按钮 `class="tool on"`。
- 交互验证：注入合成 `PointerEvent`（`pointerdown/move/up`）驱动卡片拖拽与点击，
  比手点更可复现。
- 临时调试图**必须**用 `dbg*.html` 命名并在结束时删除，仓库里只留 `index.html`。

### 每次改完的自检清单

- [ ] 没有新增外部依赖 / 没有多文件
- [ ] 水面不透出生物 → 检查 `depthWrite` 与 layer
- [ ] 生物看不见 → 先看 `rig.under.count` 与 `items`
- [ ] 改色后重新截图，确认近岸青绿 / 远海深蓝没有翻转
- [ ] 竖屏 430px 宽下工具条与卡片不溢出（无头最小 500 宽，需按 500 判断）
- [ ] 控制台无 shader 编译错误（用 §12 的 `errlog` 注入法）
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
- [ ] 移动端工具条 6 个按钮（`full` 已隐藏）在 430px 下仍偏挤，可收进"更多"折叠菜单
- [ ] 真正作为壁纸时无法接收鼠标事件（Wallpaper Engine 的源本身不转发），
      可考虑用 `?ambient=1` 让生物按更长的随机间隔自行投放，长时间不重样
- [ ] 长时间运行（>24 h）后 `U.time` 精度下降可能导致噪声抖动，可考虑对 `uTime` 取模
- [ ] 生物被拖到沙滩上时的落地表现（现在统一按水面处理）
- [ ] 近距观察时水面泡沫呈"块状"，需要更细的 lace 分形（p×8 那层不够碎）
- [ ] 沙滩在俯视全景下偏平，沙纹起伏目前只有约 6% 对比，可加一层暗部颗粒
- [ ] 可选：把「清空海中生物」做成隐藏手势（长按 HUD 计数）
