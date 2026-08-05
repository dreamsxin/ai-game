import express from 'express';
import { CaseError } from './caseEngine.js';

function expectedVersion(body) {
  const value = body?.expectedVersion;
  if (!Number.isInteger(value) || value < 0) throw new CaseError('expectedVersion is required.', { code: 'invalid_version' });
  return value;
}

async function withAbort(req, res, work) {
  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  const abortIfDisconnected = () => { if (!res.writableEnded) controller.abort(); };
  req.once('aborted', abortRequest);
  res.once('close', abortIfDisconnected);
  try {
    const payload = await work(controller.signal);
    if (!controller.signal.aborted && !res.headersSent) res.json(payload);
  } catch (error) {
    if (controller.signal.aborted || error.code === 'cancelled') return;
    const status = error.status || 500;
    const code = error.code || 'internal_error';
    if (status >= 500) console.error('Mystery API failed:', error.message);
    if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'The investigation service is unavailable.' : error.message, code });
  } finally {
    req.off('aborted', abortRequest);
    res.off('close', abortIfDisconnected);
  }
}

export function createApp({ investigationService }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      provider: 'deepseek',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      game: 'echo-gallery',
      mcpEndpoint: '/mcp',
    });
  });

  app.post('/api/case/start', (req, res) => withAbort(req, res, async () => investigationService.start()));
  app.get('/api/case/:gameId', (req, res) => withAbort(req, res, async () => investigationService.getState(req.params.gameId)));
  app.post('/api/case/:gameId/action', (req, res) => withAbort(req, res, async () =>
    investigationService.action(req.params.gameId, expectedVersion(req.body), req.body?.action)));
  app.post('/api/case/:gameId/dialogue', (req, res) => withAbort(req, res, signal =>
    investigationService.dialogue(req.params.gameId, expectedVersion(req.body), {
      characterId: req.body?.characterId,
      question: req.body?.question,
    }, { signal })));
  app.post('/api/case/:gameId/confront', (req, res) => withAbort(req, res, async () =>
    investigationService.confront(req.params.gameId, expectedVersion(req.body), {
      targetId: req.body?.targetId,
      evidenceId: req.body?.evidenceId,
    })));
  app.post('/api/case/:gameId/accuse', (req, res) => withAbort(req, res, async () =>
    investigationService.submitAccusation(req.params.gameId, expectedVersion(req.body), req.body?.accusation)));

  app.use((error, _req, res, next) => {
    if (!error) return next();
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.', code: 'invalid_json' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.', code: 'payload_too_large' });
    }
    console.error('Mystery request failed:', error.message);
    return res.status(500).json({ error: 'The investigation service is unavailable.', code: 'internal_error' });
  });

  return app;
}
