/**HTTP entry point. Loads config, wires the orchestrator's dependencies,
and starts listening.

XRPL is still the in-memory fake: Tanish's real client isn't merged yet.
Swap FakeXrpl for the real XrplClient here once it lands, nothing else in
this file or the orchestrator needs to change.
*/

import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { Orchestrator } from './orchestrator/orchestrator';
import { RealSentinel } from './sentinel/realSentinel';
import { SqliteStorage } from './storage/sqliteStorage';
import { GrokAgent } from './agent/grok';
import { FakeXrpl } from './xrpl/fakeXrpl';
import { solanaStamps } from './solana';

const config = loadConfig();
const db = openDatabase(config.dbPath);

const orchestrator = new Orchestrator({
  sentinel: new RealSentinel(db),
  agent: new GrokAgent({
    apiKey: config.grokApiKey,
    model: config.grokModel,
    endpoint: config.grokEndpoint,
  }),
  xrpl: new FakeXrpl(10),
  solana: solanaStamps,
  storage: new SqliteStorage(db),
  isTestMode: config.isTestMode,
});

const app = createApp(config, db, orchestrator);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WebPass NYC backend listening on port ${config.port} (testMode=${config.isTestMode})`);
});
