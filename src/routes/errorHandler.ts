/**The last stop for any error a route did not handle itself.

The visitor gets a short, safe message and the real error goes to the server
log. Errors caused by the request itself, such as malformed JSON, keep their
4xx status instead of being reported as a server failure.
*/

import { NextFunction, Request, Response } from 'express';

/** The HTTP status of an error caused by the request itself, such as malformed JSON.

Args:
    err (unknown): An error passed to Express's error handling.

Returns:
    number | undefined: A 4xx status if the error carries one, otherwise undefined.
*/
function clientErrorStatus(err: unknown): number | undefined {
  const carrier = err as { status?: unknown; statusCode?: unknown } | null;
  const status = carrier?.status ?? carrier?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/** Express error middleware: answer with a clean error and log the real one.

Args:
    err (unknown): The error.
    req (Request): The request that failed.
    res (Response): The response to send.
    next (NextFunction): Passes on to Express's default handler if a response was already started.
*/
export function finalErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
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
}
