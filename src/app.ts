/**Express application setup, separate from the HTTP listener.

Keeping app construction separate from server.ts lets tests import the
Express app directly with supertest, without binding a real port.
*/

import express, { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import { AppConfig } from './config';
import { Orchestrator } from './orchestrator/orchestrator';
import { placesRouter } from './routes/places';
import { createSubmissionsRouter } from './routes/submissions';
import { createMetadataRouter } from './routes/metadata';
import { createDecisionsRouter } from './routes/decisions';
import { usersRouter } from './routes/users';
import { eventsRouter } from './routes/events';
import { createTestAttackRouter } from './routes/testAttack';

/** Build the Express application.

Args:
    config (AppConfig): The resolved app configuration.
    db (Database.Database): Open database handle, passed to routes that need storage.
    orchestrator (Orchestrator): Runs the submission pipeline for POST /submissions.

Returns:
    Express: A configured Express app, not yet listening.
*/
export function createApp(config: AppConfig, db: Database.Database, orchestrator: Orchestrator): Express {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', testMode: config.isTestMode });
  });

  app.use(placesRouter);
  app.use(createSubmissionsRouter(config, orchestrator));
  app.use(createMetadataRouter(db));
  app.use(createDecisionsRouter(db));
  app.use(usersRouter);
  app.use(eventsRouter);

  if (config.isTestMode) {
    app.use(createTestAttackRouter());
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ errors: [`upload error: ${err.message}`] });
      return;
    }
    next(err);
  });

  return app;
}
