import { loadConfig, ConfigError } from '../src/config';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('refuses to start if a treasury key is present', () => {
    process.env.TREASURY_SECRET_KEY = 'sEdSomeSecret';
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it('loads defaults when no treasury key is present', () => {
    delete process.env.TREASURY_SECRET_KEY;
    delete process.env.TREASURY_SEED;
    delete process.env.TREASURY_PRIVATE_KEY;
    const config = loadConfig();
    expect(config.port).toBeGreaterThan(0);
  });
});
