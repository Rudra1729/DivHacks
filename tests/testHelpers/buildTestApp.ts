/**Shared test helper: builds a real Express app backed by a real
Orchestrator, for route-level tests that don't care about agent/XRPL/
Solana behavior specifically (those get their own focused tests).
*/

import { Express } from 'express';
import Database from 'better-sqlite3';
import { createApp } from '../../src/app';
import { AppConfig, loadConfig } from '../../src/config';
import { openDatabase } from '../../src/db';
import { Orchestrator, OrchestratorDeps } from '../../src/orchestrator/orchestrator';
import { RealSentinel } from '../../src/sentinel/realSentinel';
import { SqliteStorage } from '../../src/storage/sqliteStorage';
import { AgentInput, AgentProposal, PayoutAgent } from '../../src/agent/types';
import { FakeXrpl } from '../../src/xrpl/fakeXrpl';
import { fakeStampService } from '../../src/solana/fakeStamps';

/** An agent that always proposes the place's base reward to the submitter. */
class BaseRewardAgent implements PayoutAgent {
  async propose(input: AgentInput): Promise<AgentProposal> {
    return { amount: input.place.baseReward, recipient: input.xrplAddress, reason: 'test agent' };
  }
}

export interface TestApp {
  app: Express;
  db: Database.Database;
  orchestrator: Orchestrator;
}

/** Build a test app with a real Sentinel and real SQLite storage, backed
by fakes for the agent, XRPL, and Solana (those have their own test suites).

Args:
    configOverrides (Partial<AppConfig>): Config fields to override.
    deps (Partial<OrchestratorDeps>): Orchestrator dependencies to replace,
        for example a different XRPL or Solana fake.

Returns:
    TestApp: The app, its database, and the orchestrator behind it.
*/
export function buildTestApp(
  configOverrides: Partial<AppConfig> = {},
  deps: Partial<OrchestratorDeps> = {}
): TestApp {
  const config: AppConfig = { ...loadConfig(), dbPath: ':memory:', ...configOverrides };
  const db = openDatabase(':memory:');

  const orchestrator = new Orchestrator({
    sentinel: new RealSentinel(db),
    agent: new BaseRewardAgent(),
    xrpl: new FakeXrpl(10),
    solana: fakeStampService,
    storage: new SqliteStorage(db),
    isTestMode: config.isTestMode,
    ...deps,
  });

  const app = createApp(config, db, orchestrator);
  return { app, db, orchestrator };
}
