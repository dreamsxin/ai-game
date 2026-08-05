import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';

const versionSchema = z.number().int().nonnegative();

function createMysteryServer(investigationService) {
  const server = new McpServer({ name: 'ai-game-xiaoyuanmian', version: '0.1.0' });
  server.registerTool('mystery_start', {
    title: '开始校园谜案', description: '开始《回声画廊：消失的原作》调查。', inputSchema: {},
  }, async () => {
    const result = investigationService.start();
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('mystery_state', {
    title: '读取调查状态', description: '读取指定游戏会话的玩家可见状态。',
    inputSchema: { gameId: z.string().min(1) },
  }, async ({ gameId }) => {
    const result = investigationService.getState(gameId);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('mystery_action', {
    title: '调查现场', description: '访问地点或检查场景热点。',
    inputSchema: {
      gameId: z.string().min(1), expectedVersion: versionSchema,
      type: z.enum(['visit', 'inspect']), locationId: z.string().optional(), hotspotId: z.string().optional(),
    },
  }, async input => {
    const result = investigationService.action(input.gameId, input.expectedVersion, {
      type: input.type, locationId: input.locationId, hotspotId: input.hotspotId,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('mystery_dialogue', {
    title: '询问案件人物', description: '向案件人物提问，回答严格受固定剧本约束。',
    inputSchema: {
      gameId: z.string().min(1), expectedVersion: versionSchema,
      characterId: z.string().min(1), question: z.string().min(1).max(240),
    },
  }, async (input, extra) => {
    const result = await investigationService.dialogue(input.gameId, input.expectedVersion, input, { signal: extra.signal });
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('mystery_confront', {
    title: '出示证据对质', description: '向案件人物出示已收集证据，验证证词矛盾。',
    inputSchema: {
      gameId: z.string().min(1), expectedVersion: versionSchema,
      targetId: z.string().min(1), evidenceId: z.string().min(1),
    },
  }, async input => {
    const result = investigationService.confront(input.gameId, input.expectedVersion, input);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  server.registerTool('mystery_accuse', {
    title: '提交最终指控', description: '提交调包者、动机、原作位置和关键证据。',
    inputSchema: {
      gameId: z.string().min(1), expectedVersion: versionSchema,
      suspectId: z.string(), motiveId: z.string(), locationId: z.string(), evidenceIds: z.array(z.string()).min(3),
    },
  }, async input => {
    const result = investigationService.submitAccusation(input.gameId, input.expectedVersion, input);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}

export function createMcpHandler(investigationService) {
  return async function handleMcpRequest(req, res) {
    const server = createMysteryServer(investigationService);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Mystery MCP failed:', error.message);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Mystery tool failed' }, id: null });
    }
  };
}
