/**GET /events: a server-sent-events stream of decision and audit events.*/

import { Router } from 'express';
import { subscribeToEvents } from '../events/bus';

export const eventsRouter = Router();

eventsRouter.get('/events', (req, res) => {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const unsubscribe = subscribeToEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});
