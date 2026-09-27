/**Express application setup, separate from the HTTP listener.

Keeping app construction separate from server.ts lets tests import the
Express app directly with supertest, without binding a real port.
*/

import express, { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import { AppConfig } from './config';
import { placesRouter } from './routes/places';
import { createSubmissionsRouter } from './routes/submissions';

/** Build the Express application.

Args:
    config (AppConfig): The resolved app configuration.
    db (Database.Database): Open database handle, passed to routes that need storage.

Returns:
    Express: A configured Express app, not yet listening.
*/
export function createApp(config: AppConfig, db: Database.Database): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', testMode: config.isTestMode });
  });

  app.use(placesRouter);
  app.use(createSubmissionsRouter(config, db));

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ errors: [`upload error: ${err.message}`] });
      return;
    }
    next(err);
  });

  return app;
}
