# AI 小游戏集合

每款游戏使用独立 workspace，并通过 MCP 工具接入 AI。

## 游戏

- `wuqizi`：五子棋，支持分级 AI、积分、自动升阶和对局交流。
- `xiaoyuanmian`：校园谜案《回声画廊：消失的原作》，支持现场调查、角色询问、证据对质和最终指控。

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

两款游戏的 MCP Streamable HTTP 端点都是各自服务下的 `/mcp`。

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
```
