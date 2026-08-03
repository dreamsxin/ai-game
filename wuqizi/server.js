import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { requestDeepSeekMove } from './server/aiProvider.js';
import { handleMcpRequest } from './server/mcpServer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 4173);
const app = express();

app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    provider: 'deepseek',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    mcpEndpoint: '/mcp',
  });
});

app.post('/api/mcp/gomoku/move', async (req, res) => {
  try {
    const move = await requestDeepSeekMove(req.body);
    res.json(move);
  } catch (error) {
    console.error('AI move failed:', error.message);
    res.status(502).json({ error: 'AI provider unavailable' });
  }
});

app.post('/mcp', handleMcpRequest);
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Use POST for stateless MCP requests.' }));
app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'Stateless MCP sessions cannot be deleted.' }));

if (production) {
  app.use(express.static(path.join(root, 'dist')));
  app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, '127.0.0.1', () => {
  console.log(`Wuqizi: http://localhost:${port}`);
  console.log(`MCP:     http://localhost:${port}/mcp`);
});
