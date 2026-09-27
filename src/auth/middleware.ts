/**Express middleware guarding routes that need a logged-in user.

Reads `Authorization: Bearer <token>`, verifies it, and attaches the
resolved user to `req.user`. Never trusts a user ID from the request body
or params for anything the wallet routes expose.
*/

import { NextFunction, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { getUserById, User } from '../db/users';
import { SessionTokenError, verifySessionToken } from './tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Build middleware that requires a valid session token and attaches the user.

Args:
    db (Database.Database): Open database handle, used to load the user.

Returns:
    Express middleware.
*/
export function requireAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ errors: ['missing or malformed Authorization header'] });
      return;
    }

    let userId: string;
    try {
      userId = verifySessionToken(token);
    } catch (error) {
      res.status(401).json({ errors: [(error as SessionTokenError).message] });
      return;
    }

    const user = getUserById(db, userId);
    if (!user) {
      res.status(401).json({ errors: ['session refers to a user that no longer exists'] });
      return;
    }

    req.user = user;
    next();
  };
}
