// Shared helpers for benchmark/run.js (official matrix) and benchmark/ab.js (quick A/B).
//
// Candidates: --cand=<name>=<absolute path to an ESM file exporting CozyEvent> (repeatable).
// They are registered as library 'cand:<name>' in this process and handed to every child
// case.js process through the BENCH_CANDS environment variable.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCandidates } from './libs.js';

export const here = dirname(fileURLToPath(import.meta.url));

/** Value of --key=value (everything after the first '='), or d. */
export const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a === undefined ? d : a.slice(k.length + 3);
};
/** All values of a repeatable --key=value. */
export const args = (k) => process.argv.filter((x) => x.startsWith(`--${k}=`)).map((x) => x.slice(k.length + 3));
export const list = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : null);

/** Parses every --cand=name=/abs/path.js, registers them, returns [[name, path], ...]. */
export function setupCandidates() {
  const cands = args('cand').map((v) => {
    const i = v.indexOf('=');
    if (i < 1) throw new Error(`--cand expects name=/absolute/path.js, got "${v}"`);
    return [v.slice(0, i), v.slice(i + 1)];
  });
  addCandidates(cands);
  if (cands.length) process.env.BENCH_CANDS = JSON.stringify(cands);
  return cands;
}

/** Runs one (library x scenario) in a fresh Node process; returns the parsed result line. */
export function runCase(lib, scen, maxTime) {
  const p = spawnSync(process.execPath, [join(here, 'case.js'), lib, scen, String(maxTime)], {
    encoding: 'utf8',
    timeout: 120_000,
    env: process.env,
  });
  try {
    return JSON.parse(p.stdout.trim().split('\n').pop());
  } catch {
    return { lib, scen, error: (p.stderr || p.error?.message || 'no output').slice(0, 300) };
  }
}

/** Middle run by hz (lower middle if even), or null if no run succeeded. */
export const median = (runs) => {
  const ok = runs.filter((x) => x.hz).sort((a, b) => a.hz - b.hz);
  return ok.length ? ok[(ok.length - 1) >> 1] : null;
};

export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const isCozy = (l) => l.startsWith('cozyevent') || l.startsWith('cand:');
