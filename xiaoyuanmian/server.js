import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/createApp.js';
import { createDialogueService } from './server/dialogueService.js';
import { createInvestigationService } from './server/investigationService.js';
import { createLlmClient } from './server/llmClient.js';
import { createMcpHandler } from './server/mcpServer.js';
import { createSessionStore } from './server/sessionStore.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 4174);
const store = createSessionStore();
const llmClient = createLlmClient();
const dialogueService = createDialogueService({ llmClient });
const investigationService = createInvestigationService({ store, dialogueService });
const app = createApp({ investigationService });

app.post('/mcp', createMcpHandler(investigationService));
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Use POST for stateless MCP requests.' }));
app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'Stateless MCP sessions cannot be deleted.' }));

if (production) {
  app.use(express.static(path.join(root, 'dist')));
  app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { port: Number(process.env.HMR_PORT || 24679) } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, '127.0.0.1', () => {
  console.log(`Echo Gallery: http://localhost:${port}`);
  console.log(`MCP:          http://localhost:${port}/mcp`);
});
