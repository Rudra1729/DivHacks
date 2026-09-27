/**Writes a live run's results and evidence to a folder, and checks nothing secret leaks into it.

Each run gets its own folder under evidence/live-runs/. It holds a readable
REPORT.md for the pitch, results.json with everything, one JSON file per check
with the raw evidence, and the server logs.
*/

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CheckResult } from './types';

export interface RunInfo {
  runId: string;
  startedAt: string;
  finishedAt: string;
  gitCommit: string;
  gitBranch: string;
  nodeVersion: string;
  mode: 'real networks' | 'fake modes (dry run)';
  rewardScale: string;
  networks: string[];
  wallets: Record<string, string>;
  balancesBefore: Record<string, string>;
  balancesAfter: Record<string, string>;
  notes: string[];
}

export const EVIDENCE_ROOT = join('evidence', 'live-runs');

/** Make the folder for a run and its subfolders.

Args:
    runId (string): The run's ID, used as the folder name.

Returns:
    string: The run folder path.
*/
export function createRunFolder(runId: string): string {
  const dir = join(EVIDENCE_ROOT, runId);
  mkdirSync(join(dir, 'checks'), { recursive: true });
  mkdirSync(join(dir, 'logs'), { recursive: true });
  return dir;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

function icon(status: CheckResult['status']): string {
  return status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIPPED';
}

function show(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

/** Write one check's raw evidence file.

Args:
    dir (string): The run folder.
    result (CheckResult): The check's result.
*/
export function writeCheckFile(dir: string, result: CheckResult): void {
  writeFileSync(join(dir, 'checks', `${result.id}-${slug(result.title)}.json`), JSON.stringify(result, null, 2));
}

/** Build the readable report.

Args:
    info (RunInfo): Facts about the run.
    results (CheckResult[]): Every check's result.

Returns:
    string: Markdown for REPORT.md.
*/
export function buildReport(info: RunInfo, results: CheckResult[]): string {
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const lines: string[] = [];

  lines.push(`# WebPass NYC live check report`);
  lines.push('');
  lines.push(`**${passed} passed, ${failed} failed, ${skipped} skipped** out of ${results.length} checks.`);
  lines.push('');
  lines.push(`Run against: ${info.mode}. ${info.networks.join('; ')}.`);
  lines.push('');
  lines.push('| | |');
  lines.push('| --- | --- |');
  lines.push(`| Run ID | ${info.runId} |`);
  lines.push(`| Started / finished (UTC) | ${info.startedAt} / ${info.finishedAt} |`);
  lines.push(`| Code tested | ${info.gitBranch} @ ${info.gitCommit} |`);
  lines.push(`| Node | ${info.nodeVersion} |`);
  lines.push(`| Reward scale | ${info.rewardScale} (a 1 RLUSD place pays that much) |`);
  lines.push('');

  if (info.notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const note of info.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('| # | Check | Result | Test funds used |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.title} | ${icon(r.status)} | ${r.cost} |`);
  }
  lines.push('');

  lines.push('## Wallets used (public addresses)');
  lines.push('');
  for (const [name, address] of Object.entries(info.wallets)) {
    lines.push(`- ${name}: \`${address}\``);
  }
  lines.push('');
  lines.push('## Balances');
  lines.push('');
  lines.push('| Wallet | Before | After |');
  lines.push('| --- | --- | --- |');
  for (const name of Object.keys(info.balancesBefore)) {
    lines.push(`| ${name} | ${info.balancesBefore[name]} | ${info.balancesAfter[name] ?? ''} |`);
  }
  lines.push('');

  lines.push('## Checks');
  for (const r of results) {
    lines.push('');
    lines.push(`### ${r.id}. ${r.title}: ${icon(r.status)}`);
    lines.push('');
    lines.push(`**What it proves:** ${r.proves}`);
    lines.push('');
    lines.push(`**Result:** ${r.summary}`);
    if (r.error) {
      lines.push('');
      lines.push(`**Error:** ${r.error}`);
    }
    if (r.assertions.length > 0) {
      lines.push('');
      for (const a of r.assertions) {
        const seen = a.actual === undefined ? '' : ` (saw: \`${show(a.actual).replace(/`/g, "'")}\`)`;
        lines.push(`- [${a.passed ? 'x' : ' '}] ${a.description}${seen}`);
      }
    }
    if (r.links.length > 0) {
      lines.push('');
      lines.push('**Evidence links:**');
      for (const link of r.links) {
        lines.push(`- [${link.label}](${link.url})`);
      }
    }
    lines.push('');
    lines.push(`_Raw evidence: \`checks/${r.id}-${slug(r.title)}.json\`. Took ${(r.durationMs / 1000).toFixed(1)}s._`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Write REPORT.md and results.json.

Args:
    dir (string): The run folder.
    info (RunInfo): Facts about the run.
    results (CheckResult[]): Every check's result.
*/
export function writeReports(dir: string, info: RunInfo, results: CheckResult[]): void {
  writeFileSync(join(dir, 'REPORT.md'), buildReport(info, results));
  writeFileSync(join(dir, 'results.json'), JSON.stringify({ info, results }, null, 2));
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...listFiles(path));
    } else {
      out.push(path);
    }
  }
  return out;
}

/** Look for any secret value inside a run folder.

Args:
    dir (string): The run folder.
    secrets (string[]): Secret values that must never appear, such as seeds and API keys.

Returns:
    string[]: Paths of files that contain a secret. Empty means clean.
*/
export function findSecrets(dir: string, secrets: string[]): string[] {
  const real = secrets.filter((s) => s.length >= 8);
  const hits: string[] = [];
  for (const file of listFiles(dir)) {
    const text = readFileSync(file, 'utf8');
    if (real.some((secret) => text.includes(secret))) {
      hits.push(file);
    }
  }
  return hits;
}

/** Delete a run folder, used when it turns out to contain a secret.

Args:
    dir (string): The run folder.
*/
export function removeRunFolder(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
