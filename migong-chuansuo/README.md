# 迷宫穿越 · Warpshift

3D 体素风推移解谜。整座迷宫由一块块带门的方砖拼成，你不能直接开路——只能整行整列地推动砖块，把断开的门对上，再走过去。操作为手机触屏优先。

## 玩法

- 在场景上横滑推动那一行，竖滑推动那一列，越界的砖从对面绕回来。
- 手指按住哪一格，棋盘外就亮出那一行一列的琥珀箭头，十字键正中也写着「行 N · 列 N」——推之前就知道会动哪一条。推移过程中只有正在动的那条会亮。
- 轻点能走到的格子就走过去；点走不到的格子会把它选中，再用十字键推它所在的行列。
- 走位不计步，只有推移计步。步数打到「标准步数」以内给三星。
- 多层关卡靠跃迁垫上下穿层：只有上下两层的垫子对齐时才接得上，推歪了就断链。
- 出口门拱钉在固定坐标上不跟着砖走，所以真正要对齐的是「通向它的那条路」。
- 撤销可以回退推移，提示会在两步以内帮你找一条推法，并顺手把那条线选中。
- 首次进入会弹一次玩法说明，之后可以点左上角「玩法」重看。

## 反馈

- 每个动作都有声音：推砖是石砖擦过的闷响，跨层跃迁往上滑音，推不动是下滑的短音——听着就分得清成败。
- 路一通就出一段上行琶音，出口门拱同时转快起伏；通关按星数给三档和弦，走到出口那一拍才响。
- 「推不动」「路通了」「通关」三个关口会震一下，其余动作不震。
- 左上角「音效」可以随时静音，选择记在本地；静音状态下不会建出音频线程。
- 撤销按钮角上标着还能撤几步，撤完自动禁用；顶栏的星数带分母，刷掉旧成绩会在结算面板打出「新纪录」。
- 音效全部由 WebAudio 现场合成，不引任何音频文件；`prefers-reduced-motion` 下庆祝动画自动关掉。


## 本地运行

```bash
npm run dev:migong-chuansuo   # http://127.0.0.1:4180
npm run test:migong-chuansuo
npm run build:migong-chuansuo
```

## 打 Android APK

用 Capacitor 把 Vite 产物包进一个 WebView 壳，原生工程在 `android/`（已入版本库，可以直接改）。

```bash
npm run apk:debug --workspace migong-chuansuo     # 产物在 android/app/build/outputs/apk/debug/app-debug.apk
npm run apk:release --workspace migong-chuansuo   # 未签名，需自备 keystore
```

跑之前要先把两件本机配置指对，否则会卡在很难看懂的报错上：

- **`android/local.properties` 写 SDK 路径**（这个文件按惯例不入库）：
  ```properties
  sdk.dir=E\:\\SDK
  ```
- **`JAVA_HOME` 指向一个 JDK 17–21**。别用 Android Studio 自带的 `jbr`：它现在是 JDK 25，
  而 Gradle 8.x 根本不支持 Java 25（要到 Gradle 9.1 才支持），AGP 8.7 这一侧又还没跟上 Gradle 9，
  两头对不上。本机用的是 `E:\apk\tools\jdk-21\jdk-21.0.5+11`：
  ```powershell
  $env:JAVA_HOME = "E:\apk\tools\jdk-21\jdk-21.0.5+11"
  ```

其他几处踩过的坑，都已经在仓库里修掉了：

- `vite.config.js` 里的 `base: './'` 是必须的。Capacitor 把 `dist` 塞进 APK 后是用 `file://` 加载的，
  绝对路径 `/assets/...` 会直接 404 白屏。相对路径在浏览器里跑一样正常。
- `gradle-wrapper.properties` 的 `networkTimeout` 从模板默认的 10 秒提到 180 秒——第一次下载
  Gradle 发行包时 10 秒连握手都不够。同时换成 `-bin.zip`，比 `-all.zip` 少下一半。
- 仓库根的 `.gitattributes` 把 `gradlew` 钉成 LF。这台机器 `core.autocrlf` 是开的，
  换成 CRLF 后在类 Unix 上会报 `bad interpreter: /bin/sh^M`。
- `compileSdk` 是 35，本机 SDK 里原本只有 `android-37.0`。AGP 会自己从 dl.google.com 补装
  `platforms;android-35` 和 `build-tools;34.0.0`（licenses 目录已有授权记录，不需要 cmdline-tools）。

实测产物：4.1 MB，`com.aigame.migongchuansuo`，minSdk 23 / targetSdk 35，应用名「迷宫穿越」，
`assets/public/` 里是相对路径的 index.html。首次构建含下载约 6 分钟，之后增量构建是秒级。

## 结构

`src/game/` 是纯逻辑层，不引用 Three.js：`rules.js` 用一个整数编码一块砖（低 4 位是四向门、第 5 位是跃迁垫），
`grid.js` 把「推移一行」化简成数组轮转并做连通性判定，`generator.js` 由 seed 生成关卡，
`solver.js` 是有界宽搜，`simulation.js` 是回合制状态机，`input.js` 把手势和按键归一成语义动作。

`src/scene/` 是渲染层，不写回模拟状态：`voxel.js` 烘体素网格并剔除隐藏面，`models.js` 定义砖块和角色，
`motion.js` 是插值数学（推移的绕回影子就在这里算），`createScene.js` 负责相机、砖块池和屏幕坐标反查格子，
`readout.js` 派生 HUD 文案，`audio.js` 派生音效并现场合成。

`audio.js` 和渲染层同一套分工：`soundsFor` / `vibrationFor` 是从 effects 派生音名的纯函数，能单测；
只有 `createAudio` 碰 `AudioContext`，而且懒建——静音开局一个音频节点都不建。


## 可解性是构造出来的

关卡不是「随机生成再碰运气验证」，而是反向造出来的：

1. 每层先用随机 DFS 铺一棵生成树，层内任意两格必然连通；
2. 相邻层之间放一对对齐的跃迁垫，跨层也必然连通——此时出口一定可达，这就是「解开态」；
3. 从解开态开始施加若干次推移当打乱。推移是可逆的，玩家在打乱时也跟着砖走；
4. 于是「把打乱序列反过来、方向取反」天然就是一条解法，长度等于打乱步数。

`validateLevel` 会把这条保底解法真的回放一遍，确认它落回解开态且出口可达，同时确认初始态还没通关。
`par` 再用有界宽搜校正：搜到更短的解就用它，搜不到就沿用保底解法长度（宁可给个偏松的标准，也不谎报一个搜不动的数）。

`test/generator.test.js` 对关卡表里六关各跑 12 个连续 seed，全部要求生成通过且体检为 ok。
