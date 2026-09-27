/**Express application setup, separate from the HTTP listener.

Keeping app construction separate from server.ts lets tests import the
Express app directly with supertest, without binding a real port.
*/

import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import Database from 'better-sqlite3';
import { AppConfig } from './config';
import { Orchestrator } from './orchestrator/orchestrator';
import { createPlacesRouter } from './routes/places';
import { createSubmissionsRouter } from './routes/submissions';
import { createMetadataRouter } from './routes/metadata';
import { createDecisionsRouter } from './routes/decisions';
import { usersRouter } from './routes/users';
import { eventsRouter } from './routes/events';
import { createTestAttackRouter } from './routes/testAttack';
import { createAuthRouter } from './routes/auth';
import { createWalletRouter } from './routes/wallet';
import { finalErrorHandler } from './routes/errorHandler';
import { xrplService } from './xrpl';
import { XrplService } from './xrpl/types';

/** The static web app, one level above both src/ and dist/. */
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');

/** Build the Express application.

Args:
    config (AppConfig): The resolved app configuration.
    db (Database.Database): Open database handle, passed to routes that need storage.
    orchestrator (Orchestrator): Runs the submission pipeline for POST /submissions.
    xrpl (XrplService): The ledger the places list and wallet routes read from.
        Defaults to the XRPL module, which picks real or fake from XRPL_MODE.

Returns:
    Express: A configured Express app, not yet listening.
*/
export function createApp(
  config: AppConfig,
  db: Database.Database,
  orchestrator: Orchestrator,
  xrpl: XrplService = xrplService
): Express {
  const app = express();

  // The frontend is served from a different origin (npm run dev under
  // frontend/), so it needs CORS to call this API from the browser.
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', testMode: config.isTestMode });
  });

  app.use(createPlacesRouter(xrpl, { rewardScale: config.rewardScale }));
  app.use(createSubmissionsRouter(config, orchestrator));
  app.use(createMetadataRouter(db));
  app.use(createDecisionsRouter(db));
  app.use(usersRouter);
  app.use(eventsRouter);
  app.use(createAuthRouter(db));
  app.use(createWalletRouter(db, xrpl));

  if (config.isTestMode) {
    app.use(createTestAttackRouter());
  }

  // Serve the web app too, so one server runs everything at http://localhost:PORT/.
  app.use(express.static(FRONTEND_DIR));

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ errors: [`upload error: ${err.message}`] });
      return;
    }
    next(err);
  });

  app.use(finalErrorHandler);

  return app;
}
