/**A small in-process pub/sub bus for decision and audit events.

Backs the live event stream (GET /events). Anything in the backend can
publish an event; SSE clients subscribe and get every event published
after they connect.
*/

import { EventEmitter } from 'events';

export interface WebPassEvent {
  type: string;
  decisionId?: string;
  message: string;
  createdAt: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const EVENT_NAME = 'webpass-event';

/** Publish an event to every current subscriber.

Args:
    event (Omit<WebPassEvent, 'createdAt'>): The event to publish;
        createdAt is stamped automatically.
*/
export function publishEvent(event: Omit<WebPassEvent, 'createdAt'>): void {
  emitter.emit(EVENT_NAME, { ...event, createdAt: new Date().toISOString() });
}

/** Subscribe to every future event.

Args:
    listener ((event: WebPassEvent) => void): Called for each published event.

Returns:
    () => void: Call to unsubscribe.
*/
export function subscribeToEvents(listener: (event: WebPassEvent) => void): () => void {
  emitter.on(EVENT_NAME, listener);
  return () => emitter.off(EVENT_NAME, listener);
}
