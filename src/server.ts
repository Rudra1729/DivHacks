/**HTTP entry point. Loads config, builds the app, and starts listening.*/

import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';

const config = loadConfig();
openDatabase(config.dbPath);
const app = createApp(config);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WebPass NYC backend listening on port ${config.port} (testMode=${config.isTestMode})`);
});
