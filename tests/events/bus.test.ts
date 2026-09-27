import { publishEvent, subscribeToEvents } from '../../src/events/bus';

describe('event bus', () => {
  it('delivers published events to subscribers', () => {
    const received: string[] = [];
    const unsubscribe = subscribeToEvents((event) => {
      received.push(event.message);
    });

    publishEvent({ type: 'test.event', message: 'hello' });
    unsubscribe();
    publishEvent({ type: 'test.event', message: 'not received' });

    expect(received).toEqual(['hello']);
  });
});
