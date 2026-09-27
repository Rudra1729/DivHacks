/**Treasury guardian: keeps the agent wallet topped up to its allowance.

This is a separate process from the API server. It is the only place the
treasury key lives. Every few minutes it reads the agent wallet's balance,
checks the agent's recent activity for signs of abuse, and if all looks
normal sends RLUSD from the treasury to bring the agent back up to its
allowance, never above it. If activity looks abnormal it sends nothing and
says why.

The agent's RLUSD trust line limit is set to the allowance, so even a bug
here cannot leave the agent holding more than that: the ledger refuses.

Usage:
    npm run guardian                   run continuously
    npm run guardian:once              one cycle, then exit
    npm run guardian:once -- --dry-run decide and report, send nothing
    npm run guardian:once -- --override skip the abnormal-spending check
        after a human has reviewed it (the allowance cap still applies)

Exit codes with --once: 0 done or nothing to do, 2 held for abnormal
activity, 1 error.
*/

import { disconnectClient, getClient, readAssetBalance } from '../src/xrpl/client';
import { evaluateActivity, planTopUp } from '../src/guardian/rules';
import { formatAmount } from '../src/xrpl/amount';
import { GuardianConfig, loadGuardianConfig } from './config';
import { readAgentActivity, sendTopUp } from './ledger';

type CycleOutcome = 'ok' | 'held' | 'error';

interface Flags {
  once: boolean;
  dryRun: boolean;
  override: boolean;
}

/** Print one timestamped log line.

Args:
    message (string): What to log.
*/
function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/** Run one guardian cycle: read, check, and top up if it is safe.

Args:
    config (GuardianConfig): Guardian settings.
    flags (Flags): Command-line switches.

Returns:
    Promise<CycleOutcome>: ok if done or nothing to do, held if abnormal
        activity blocked the top-up, error if something failed.
*/
async function runCycle(config: GuardianConfig, flags: Flags): Promise<CycleOutcome> {
  const client = await getClient(config.xrpl);
  const agentBalance = await readAssetBalance(client, config.xrpl, config.agentAddress);
  const treasuryBalance = await readAssetBalance(client, config.xrpl, config.treasury.classicAddress);
  log(`agent holds ${agentBalance} RLUSD, treasury holds ${treasuryBalance} RLUSD, allowance ${config.limits.targetBalance}`);

  const since = new Date(Date.now() - config.limits.windowMinutes * 60_000);
  const activity = await readAgentActivity(client, config, since);
  const reasons = evaluateActivity(activity, config.limits);
  for (const reason of reasons) {
    log(`ALERT: ${reason}`);
  }

  const plan = planTopUp(agentBalance, treasuryBalance, config.limits.targetBalance);
  if (plan.action === 'none') {
    log(`no top-up: ${plan.reason}`);
    return 'ok';
  }

  if (reasons.length > 0) {
    if (!flags.override) {
      log(`HOLD: top-up of ${plan.amount} RLUSD NOT sent because recent agent activity looks abnormal`);
      return 'held';
    }
    log('override: sending anyway after human review. The allowance cap still applies.');
  }

  if (flags.dryRun) {
    log(`dry run: would send ${plan.amount} RLUSD to the agent`);
    return 'ok';
  }

  const amount = formatAmount(plan.amount);
  log(`sending ${amount} RLUSD from the treasury to the agent...`);
  const sent = await sendTopUp(client, config, amount);
  if (!sent.ok) {
    log(`ERROR: top-up failed (${sent.code})${sent.hash ? ` https://testnet.xrpl.org/transactions/${sent.hash}` : ''}`);
    return 'error';
  }
  const after = await readAssetBalance(client, config.xrpl, config.agentAddress);
  log(`top-up done, agent now holds ${after} RLUSD https://testnet.xrpl.org/transactions/${sent.hash}`);
  return 'ok';
}

/** Wait for a number of seconds, or until the process is told to stop.

Args:
    seconds (number): How long to wait.
    isStopped (() => boolean): Returns true once shutdown was requested.

Returns:
    Promise<void>: Resolves after the wait or on shutdown.
*/
async function pause(seconds: number, isStopped: () => boolean): Promise<void> {
  for (let elapsed = 0; elapsed < seconds && !isStopped(); elapsed += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Start the guardian, once or continuously depending on the flags. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags: Flags = {
    once: args.includes('--once'),
    dryRun: args.includes('--dry-run'),
    override: args.includes('--override'),
  };
  const config = loadGuardianConfig();
  log(`guardian for agent ${config.agentAddress}, treasury ${config.treasury.classicAddress}`);
  if (flags.dryRun) log('dry run: nothing will be sent');

  let stopped = false;
  process.on('SIGINT', () => {
    stopped = true;
    log('stopping after this cycle');
  });

  let last: CycleOutcome = 'ok';
  do {
    try {
      last = await runCycle(config, flags);
    } catch (error) {
      last = 'error';
      log(`ERROR: cycle failed, will retry next cycle: ${String(error)}`);
    }
    if (!flags.once) await pause(config.intervalSeconds, () => stopped);
  } while (!flags.once && !stopped);

  await disconnectClient();
  if (flags.once) process.exit(last === 'ok' ? 0 : last === 'held' ? 2 : 1);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await disconnectClient();
  process.exit(1);
});
