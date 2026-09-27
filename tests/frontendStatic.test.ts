import request from 'supertest';
import { buildTestApp } from './testHelpers/buildTestApp';

describe('serving the web app', () => {
  it('serves the frontend page at /', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('id="submissionForm"');
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves the frontend scripts', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/locationCapture.js');
    expect(response.status).toBe(200);
    expect(response.text).toContain('WebPassCapture');
  });

  it('keeps API routes ahead of static files', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.status).toBe(200);
    expect(response.body.places.length).toBeGreaterThan(0);
  });
});
