import http from 'http';
import { AddressInfo } from 'net';
import { publishEvent } from '../../src/events/bus';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('GET /events', () => {
  it('streams a published event to a connected client', (done) => {
    const { app } = buildTestApp();
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;

      const req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
        expect(res.headers['content-type']).toContain('text/event-stream');

        res.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          if (text.includes('sse-test-event')) {
            req.destroy();
            server.close(() => done());
          }
        });

        setImmediate(() => {
          publishEvent({ type: 'test', message: 'sse-test-event' });
        });
      });
    });
  });
});
