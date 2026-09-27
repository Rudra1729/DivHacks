/**Run the live checks and write the evidence folder.

Starts a real copy of the server, sends real requests to it, confirms the
results on the XRPL testnet and Solana devnet, and writes everything to
evidence/live-runs/<run id>/ for the pitch.

Usage:
    npm run live:check                 real networks (spends a few cents of test funds)
    npm run live:check:dry             fake modes, spends nothing, for testing the runner
    npm run live:check -- --only C05,C06   run just some checks

Settings:
    LIVE_REWARD_SCALE   reward scale for the run, default 0.01
*/

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getAgentAddress } from '../../src/xrpl';
import { loadSavedWallets } from '../xrpl/common';
import { Check, CHECKS, Ctx, TestUser } from './checks';
import { Chains } from './lib/chains';
import { createRunFolder, findSecrets, removeRunFolder, RunInfo, writeCheckFile, writeReports } from './lib/evidence';
import { LiveServer } from './lib/server';
import { CheckResult } from './lib/types';

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function runId(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

/** Every secret value the evidence folder must never contain. */
function collectSecrets(): string[] {
  const secrets: string[] = [];
  for (const file of ['.env', '.env.guardian']) {
    if (!existsSync(file)) {
      continue;
    }
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && /(SEED|API_KEY|SECRET|PRIVATE)/.test(match[1]) && match[2].trim()) {
        secrets.push(match[2].trim());
      }
    }
  }
  if (existsSync('.keys')) {
    for (const name of readdirSync('.keys')) {
      if (!name.endsWith('.json') || name === 'collections.json') {
        continue;
      }
      try {
        const data = JSON.parse(readFileSync(join('.keys', name), 'utf8'));
        if (Array.isArray(data)) {
          secrets.push(data.slice(0, 32).join(','));
        } else if (data && typeof data === 'object') {
          for (const value of Object.values(data)) {
            if (typeof value === 'string') {
              secrets.push(value);
            }
          }
        }
      } catch {
        // not a key file
      }
    }
  }
  return secrets;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fake = args.includes('--fake');
  const onlyArg = args.find((a) => a.startsWith('--only='))?.slice(7) ?? (args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined);
  const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim().toUpperCase())) : null;

  const rewardScale = process.env.LIVE_REWARD_SCALE ?? '0.01';
  process.env.REWARD_SCALE = rewardScale;
  // The checks prove payments at cultural places like Apollo, so those must pay.
  process.env.CULTURAL_REWARDS = 'on';
  process.env.XRPL_MODE = fake ? 'fake' : 'real';
  process.env.SOLANA_MODE = fake ? 'fake' : 'real';
  delete process.env.SOLANA_FORCE_FAIL;

  const id = runId();
  const dir = createRunFolder(id);
  const startedAt = new Date().toISOString();
  console.log(`Live check run ${id} (${fake ? 'FAKE dry run' : 'REAL networks'}), reward scale ${rewardScale}`);
  console.log(`Evidence folder: ${dir}\n`);

  const wallets = loadSavedWallets();
  const chains = new Chains();
  if (!fake) {
    await chains.init();
  }
  // Each run uses brand new Solana wallets, so stamps from earlier runs never
  // block this run. The XRPL demo wallets are reused because they already have
  // an RLUSD trust line. The new Solana keys live in memory only.
  const user = (role: 'user-1' | 'user-2' | 'user-3'): TestUser => {
    const wallet = chains.newSolanaWallet();
    return { xrpl: wallets[role]!.classicAddress, solana: wallet.address, solanaKeypair: wallet.keypair };
  };
  const users = { 'user-1': user('user-1'), 'user-2': user('user-2'), 'user-3': user('user-3') };
  const attacker: TestUser = { xrpl: wallets.attacker!.classicAddress, solana: chains.solanaAddress('attacker') };

  const notes: string[] = [];
  const walletList: Record<string, string> = {
    'agent (XRPL)': getAgentAddress(),
    'treasury (XRPL)': wallets.treasury!.classicAddress,
    'demo user 1 (XRPL)': users['user-1'].xrpl,
    'demo user 2 (XRPL)': users['user-2'].xrpl,
    'demo user 3 (XRPL)': users['user-3'].xrpl,
    'attacker (XRPL)': attacker.xrpl,
    'visitor 1 (Solana, new this run)': users['user-1'].solana,
    'visitor 2 (Solana, new this run)': users['user-2'].solana,
    'visitor 3 (Solana, new this run)': users['user-3'].solana,
    'attacker (Solana)': attacker.solana,
  };

  const snapshot = async (): Promise<Record<string, string>> => {
    if (fake) {
      return {};
    }
    const out: Record<string, string> = {};
    out['agent RLUSD'] = `${await chains.rlusd(getAgentAddress())}`;
    out['treasury RLUSD'] = `${await chains.rlusd(wallets.treasury!.classicAddress)}`;
    out['demo user 1 RLUSD'] = `${await chains.rlusd(users['user-1'].xrpl)}`;
    out['demo user 2 RLUSD'] = `${await chains.rlusd(users['user-2'].xrpl)}`;
    out['demo user 3 RLUSD'] = `${await chains.rlusd(users['user-3'].xrpl)}`;
    out['attacker RLUSD'] = `${await chains.rlusd(attacker.xrpl)}`;
    out['issuer SOL (pays mint fees)'] = (await chains.issuerSol()).toFixed(4);
    return out;
  };

  const balancesBefore = await snapshot();
  if (!fake) {
    const sol = Number(balancesBefore['issuer SOL (pays mint fees)']);
    if (sol < 0.05) {
      notes.push(`The issuer wallet had only ${sol} devnet SOL, so mints may fail.`);
    }
  }

  let nextPort = 3101;
  const servers: LiveServer[] = [];
  const makeServer = (label: string, env: Record<string, string> = {}): LiveServer => {
    const server = new LiveServer({ label, port: nextPort++, env, logFile: join(dir, 'logs', `server-${label}.log`) });
    servers.push(server);
    return server;
  };
  const serverA = makeServer('main');
  const ctx: Ctx = { real: !fake, chains: fake ? null : chains, serverA, makeServer, users, attacker, runId: id, logsDir: join(dir, 'logs'), rewardScale: Number(rewardScale), state: {} };

  const results: CheckResult[] = [];
  try {
    console.log('Starting the main server...');
    await serverA.start();
    console.log('Server is up.\n');

    const selected: Check[] = only ? CHECKS.filter((c) => only.has(c.id)) : CHECKS;
    for (const check of selected) {
      const started = Date.now();
      let result: CheckResult;
      try {
        const outcome = await check.run(ctx);
        const failed = outcome.assertions.filter((a) => !a.passed).length;
        result = {
          id: check.id,
          title: check.title,
          proves: check.proves,
          cost: check.cost,
          status: outcome.skipped ? 'skipped' : failed === 0 ? 'pass' : 'fail',
          summary: outcome.summary,
          assertions: outcome.assertions,
          evidence: outcome.evidence,
          links: outcome.links,
          durationMs: Date.now() - started,
        };
      } catch (error) {
        result = {
          id: check.id,
          title: check.title,
          proves: check.proves,
          cost: check.cost,
          status: 'fail',
          summary: 'The check crashed before it could finish.',
          assertions: [],
          evidence: {},
          links: [],
          durationMs: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      results.push(result);
      writeCheckFile(dir, result);
      const tag = result.status === 'pass' ? 'PASS   ' : result.status === 'fail' ? 'FAIL   ' : 'SKIPPED';
      console.log(`${result.id} ${tag} ${result.title} (${(result.durationMs / 1000).toFixed(1)}s)`);
      if (result.status === 'fail') {
        for (const a of result.assertions.filter((x) => !x.passed)) {
          console.log(`        x ${a.description}`);
        }
        if (result.error) {
          console.log(`        ! ${result.error}`);
        }
      }
      if (result.status === 'skipped') {
        console.log(`        (${result.summary})`);
      }
    }
  } finally {
    ctx.serverA.logText.length; // keep log buffer referenced until stop
    await serverA.stop();
    for (const s of servers) {
      if (s !== serverA) {
        await s.stop();
      }
    }
  }

  const balancesAfter = await snapshot();
  const info: RunInfo = {
    runId: id,
    startedAt,
    finishedAt: new Date().toISOString(),
    gitCommit: git('rev-parse --short HEAD'),
    gitBranch: git('rev-parse --abbrev-ref HEAD'),
    gitDirty: git('status --porcelain') !== '',
    nodeVersion: process.version,
    mode: fake ? 'fake modes (dry run)' : 'real networks',
    rewardScale,
    networks: fake ? ['no real networks used'] : ['XRPL testnet (wss://s.altnet.rippletest.net)', 'Solana devnet', 'real Grok API (xAI)'],
    wallets: walletList,
    balancesBefore,
    balancesAfter,
    notes,
  };
  writeReports(dir, info, results);
  if (!fake) {
    await chains.close();
  }

  const leaks = findSecrets(dir, collectSecrets());
  if (leaks.length > 0) {
    removeRunFolder(dir);
    console.error(`\nA secret value was found in the evidence (${leaks.length} file(s)). The folder was deleted. Nothing was kept.`);
    process.exit(2);
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);
  console.log(`Report: ${join(dir, 'REPORT.md')}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
