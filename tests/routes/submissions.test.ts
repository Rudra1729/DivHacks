import request from 'supertest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';

describe('POST /submissions', () => {
  const app = createApp(loadConfig());

  it('rejects a submission missing required fields', async () => {
    const response = await request(app).post('/submissions').send({});
    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('photo is required');
  });

  it('accepts a fully valid submission', async () => {
    const response = await request(app)
      .post('/submissions')
      .field('placeId', 'apollo-theater')
      .field('latitude', '40.8102')
      .field('longitude', '-73.95')
      .field('timestamp', new Date().toISOString())
      .field('xrplAddress', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
      .field('solanaAddress', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
      .attach('photo', Buffer.from('fake-image-bytes'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
  });

  it('rejects an oversized photo', async () => {
    const response = await request(app)
      .post('/submissions')
      .field('placeId', 'apollo-theater')
      .field('latitude', '40.8102')
      .field('longitude', '-73.95')
      .field('timestamp', new Date().toISOString())
      .field('xrplAddress', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
      .field('solanaAddress', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
      .attach('photo', Buffer.alloc(6 * 1024 * 1024, 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
  });
});
