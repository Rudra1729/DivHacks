/**HTTP entry point. Loads config, wires the orchestrator's dependencies,
and starts listening.

XRPL and Solana each pick their implementation from config: XRPL_MODE and
SOLANA_MODE, both 'fake' by default, so the server runs with no keys.
In real XRPL mode each user's custodial wallet is funded and given an RLUSD
trust line right before its first payment. Fake-mode stamps are reloaded
from the decisions table, so restarting keeps everyone's passport.
*/

import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { Orchestrator } from './orchestrator/orchestrator';
import { RealSentinel } from './sentinel/realSentinel';
import { SqliteStorage } from './storage/sqliteStorage';
import { GrokAgent } from './agent/grok';
import { xrplService } from './xrpl';
import { WalletActivator, withWalletActivation } from './xrpl/activation';
import { solanaStamps } from './solana';
import { fakeStampService } from './solana/fakeStamps';
import { getMintedStamps } from './db/decisions';

const config = loadConfig();
const db = openDatabase(config.dbPath);
fakeStampService.restore(getMintedStamps(db));

const orchestrator = new Orchestrator({
  sentinel: new RealSentinel(db, solanaStamps, { locationChecks: config.locationChecks }),
  agent: new GrokAgent({
    apiKey: config.grokApiKey,
    model: config.grokModel,
    endpoint: config.grokEndpoint,
    rewardScale: config.rewardScale,
  }),
  xrpl: withWalletActivation(xrplService, new WalletActivator(db)),
  solana: solanaStamps,
  storage: new SqliteStorage(db),
  isTestMode: config.isTestMode,
  rewardScale: config.rewardScale,
  culturalRewards: config.culturalRewards,
});

const app = createApp(config, db, orchestrator);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`WebPass NYC backend listening on port ${config.port} (testMode=${config.isTestMode})`);
});
