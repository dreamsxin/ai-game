# AI 小游戏集合

每款游戏使用独立目录，并通过 MCP 工具接入 AI。

## 游戏

- `wuqizi`：五子棋，支持分级 AI、积分和自动升阶。

## 本地运行

```bash
npm install
npm run dev
```

默认地址为 `http://localhost:4173`，MCP Streamable HTTP 端点为
`http://localhost:4173/mcp`。

## 五子棋 AI

`wuqizi/.env.local` 中的 `DEEPSEEK_API_KEY` 用于调用 DeepSeek Function
Calling 落子。`DEEPSEEK_TIMEOUT_MS` 控制上游响应时间，默认 5000 毫秒；
远程服务超时、返回非法坐标或未配置时，前端会使用本地五子棋引擎快速兜底。

## 验证

```bash
npm test
npm run build
```
