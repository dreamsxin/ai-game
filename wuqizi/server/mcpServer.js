import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { requestDeepSeekMove } from './aiProvider.js';

const boardSchema = z.array(z.array(z.number().int().min(0).max(2)).length(15)).length(15);

function createGameServer() {
  const server = new McpServer({ name: 'ai-game-wuqizi', version: '0.1.0' });
  server.registerTool('gomoku_move', {
    title: '五子棋 AI 落子',
    description: '根据十五路五子棋局面和难度推演白棋下一步。0为空，1为玩家黑棋，2为AI白棋。',
    inputSchema: {
      board: boardSchema,
      difficulty: z.number().int().min(0).max(3).default(0),
      reasoningDepth: z.number().int().min(1).max(4).default(1),
    },
  }, async (input, extra) => {
    const move = await requestDeepSeekMove(input, { signal: extra.signal });
    return {
      content: [{ type: 'text', text: JSON.stringify(move) }],
      structuredContent: move,
    };
  });
  return server;
}

export async function handleMcpRequest(req, res) {
  const server = createGameServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'MCP tool failed' }, id: null });
    }
  } finally {
    res.on('close', () => {
      transport.close();
      server.close();
    });
  }
}
