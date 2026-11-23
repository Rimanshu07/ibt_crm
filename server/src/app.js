import { requestContext } from './core/context.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import modules from './modules/index.js';
import { ApiError } from './core/http.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
  app.use((req, res, next) => requestContext.run({ tz: null }, next)); // org timezone is filled in after login
  app.use(express.json({ limit: '25mb' })); // price sheets, logos and imports

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, name: 'IBT Travels CRM API' }));
  for (const [path, router] of modules) app.use(`/api/v1/${path}`, router);
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found')));

  // One error format: { error: { code, message, fields } }
  app.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
    if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'The file is too large' } });
    console.error(err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } });
  });
  return app;
}
