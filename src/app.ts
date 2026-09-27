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

  // Last stop for any error nothing else handled. The visitor gets a short,
  // safe message, and the real error goes to the server log.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const status = clientErrorStatus(err);
    if (status) {
      res.status(status).json({ error: 'bad request' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`Unhandled error in ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'something went wrong on our side, please try again' });
  });

  return app;
}

/** The HTTP status of an error caused by the request itself, such as malformed JSON.

Args:
    err (unknown): An error passed to Express's error handling.

Returns:
    number | undefined: A 4xx status if the error carries one, otherwise undefined.
*/
function clientErrorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status ?? (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}
