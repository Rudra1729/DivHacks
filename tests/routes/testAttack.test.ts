import request from 'supertest';
import { createApp } from '../../src/app';
import { AppConfig } from '../../src/config';
import { openDatabase } from '../../src/db';
import { isPolicyBypassEnabled, disablePolicyBypass } from '../../src/testMode/attackFlag';

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    dbPath: ':memory:',
    isTestMode: false,
    maxUploadBytes: 5 * 1024 * 1024,
    grokModel: 'grok-test',
    grokEndpoint: 'https://example.com/grok',
    ...overrides,
  };
}

describe('POST /test/attack', () => {
  afterEach(() => {
    disablePolicyBypass();
  });

  it('is unreachable outside test mode', async () => {
    const app = createApp(buildConfig({ isTestMode: false }), openDatabase(':memory:'));
    const response = await request(app).post('/test/attack');
    expect(response.status).toBe(404);
  });

  it('enables the policy bypass flag in test mode', async () => {
    const app = createApp(buildConfig({ isTestMode: true }), openDatabase(':memory:'));
    expect(isPolicyBypassEnabled()).toBe(false);

    const response = await request(app).post('/test/attack');
    expect(response.status).toBe(200);
    expect(isPolicyBypassEnabled()).toBe(true);
  });
});
