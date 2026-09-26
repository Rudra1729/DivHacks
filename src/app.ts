/**Express application setup, separate from the HTTP listener.

Keeping app construction separate from server.ts lets tests import the
Express app directly with supertest, without binding a real port.
*/

import express, { Express } from 'express';
import { AppConfig } from './config';

/** Build the Express application.

Args:
    config (AppConfig): The resolved app configuration.

Returns:
    Express: A configured Express app, not yet listening.
*/
export function createApp(config: AppConfig): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', testMode: config.isTestMode });
  });

  return app;
}
