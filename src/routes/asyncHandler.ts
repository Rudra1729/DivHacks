/**Lets a route handler that uses async and await report its errors properly.

Express 4 ignores the promise an async handler returns. If the handler throws,
nothing catches it: the request never gets an answer and Node treats it as an
unhandled error, which ends the whole server. Wrapping a handler with this
passes any error on to Express's error handling instead, where app.ts turns it
into a clean response.
*/

import { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap an async route handler so its errors reach Express's error handling.

Args:
    handler (function): The async route handler.

Returns:
    RequestHandler: A handler that behaves the same, but forwards any error.
*/
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
