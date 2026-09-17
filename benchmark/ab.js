// Quick interleaved A/B for candidate implementations. Never writes the official reports.
//
//   node benchmark/ab.js --cand=a=/abs/a.js --cand=b=/abs/b.js \
//     --libs=tseep,"cozyevent v2" --scenarios=emit1,emit10distinct --rounds=5 --max-time=0.3
//
// Options:
//   --cand=<name>=<abs path>  repeatable; ESM file exporting CozyEvent (or default). Shown as cand:<name>.
//   --libs=a,b                other libraries to include (default: cozyevent v2, tseep, tseep (CSP-safe build), emitix,
//                             nanoevents, @braintree/event-emitter).
//                             'cozyevent v1.4.2' is always added (it is the "vs v1" reference).
//   --scenarios=a,b           default: all scenarios in case.js
//   --rounds=5 --max-time=0.3
//   --json=<path>             also write raw runs + medians as JSON
//
// Every round visits each scenario and runs every entry once, each in a fresh process; the entry
// order rotates every round so no entry always runs first/last. Tables show the median of rounds.
// Columns per entry: median ops/s, ratio vs the best NON-cozyevent library measured in this run
// (vsComp, > 1.00 means faster than every competitor included), ratio vs the best competitor that does
// not use eval/new Function (vsSafe; tseep's default build uses eval), and ratio vs cozyevent v1.4.2.
// Ratios within about +-5% are noise on a busy machine: rerun with more rounds before concluding.

import { writeFileSync } from 'node:fs';
import { libs } from './libs.js';
import { scenarios } from './case.js';
import { arg, fmt, isCozy, list, median, runCase, setupCandidates } from './harness.js';

const cands = setupCandidates();
const ROUNDS = Number(arg('rounds', 5));
const MAX_TIME = Number(arg('max-time', 0.3));
const V1 = 'cozyevent v1.4.2';
const extra = list(arg('libs')) ?? ['cozyevent v2', 'tseep', 'tseep (CSP-safe build)', 'emitix', 'nanoevents', '@braintree/event-emitter'];
const entries = [...cands.map(([n]) => `cand:${n}`), ...extra, V1].filter((l, i, a) => a.indexOf(l) === i);
const scenNames = list(arg('scenarios')) ?? Object.keys(scenarios);
for (const l of entries) if (!libs[l]) throw new Error(`unknown library "${l}". Known: ${Object.keys(libs).join(', ')}`);
for (const s of scenNames) if (!scenarios[s]) throw new Error(`unknown scenario "${s}". Known: ${Object.keys(scenarios).join(', ')}`);

const raw = {};
const t0 = Date.now();
for (let r = 0; r < ROUNDS; r++) {
  for (const s of scenNames) {
    const applicable = entries.filter((l) => !libs[l].only || libs[l].only.includes(s));
    const rot = r % Math.max(1, applicable.length);
    const order = [...applicable.slice(rot), ...applicable.slice(0, rot)];
    for (const l of order) {
      const res = runCase(l, s, MAX_TIME);
      ((raw[s] ??= {})[l] ??= []).push(res);
      if (!res.hz) console.error(`  ${s} ${l}: ${res.skipped || res.error}`);
    }
  }
  console.error(`round ${r + 1}/${ROUNDS} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const med = {};
for (const s of scenNames) {
  med[s] = {};
  for (const l of entries) {
    const m = raw[s]?.[l] && median(raw[s][l]);
    if (m) med[s][l] = m.hz;
  }
}

const shown = entries.filter((l) => isCozy(l));
const comps = entries.filter((l) => !isCozy(l));
const safeComps = comps.filter((l) => !libs[l].eval);
const pad = (x, n) => String(x).padStart(n);
const ratio = (a, b) => (a && b ? (a / b).toFixed(2) : '-');
const W = Math.max(...entries.map((l) => l.length), 14);

const bestOf = (s, pool) => pool.reduce((b, l) => ((med[s][l] ?? 0) > (med[s][b] ?? 0) ? l : b), null);
let txt = `A/B: ${ROUNDS} rounds, max-time ${MAX_TIME}s, medians (ops/s). vsComp = / best non-cozyevent lib in this run; vsSafe = / best competitor without eval; vsV1 = / ${V1}.\n`;
for (const s of scenNames) {
  const bestComp = bestOf(s, comps);
  const bestSafe = bestOf(s, safeComps);
  txt += `\n${s}${bestComp ? `  (best comp: ${bestComp} ${fmt(med[s][bestComp] ?? 0)}; best no-eval: ${bestSafe} ${fmt(med[s][bestSafe] ?? 0)})` : ''}\n`;
  for (const l of entries) {
    const hz = med[s][l];
    if (!hz) continue;
    const runs = raw[s][l].filter((x) => x.hz).map((x) => (x.hz / hz).toFixed(2)).join(' ');
    txt += `  ${l.padEnd(W)} ${pad(fmt(hz), 13)}  vsComp ${pad(ratio(hz, med[s][bestComp]), 5)}  vsSafe ${pad(ratio(hz, med[s][bestSafe]), 5)}  vsV1 ${pad(ratio(hz, med[s][V1]), 5)}  runs/med [${runs}]\n`;
  }
}
// geometric mean of ratios over the scenarios where both values exist
const geo = (xs) => (xs.length ? Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length).toFixed(2) : '-');
txt += `\ngeomean over scenarios\n`;
for (const l of shown) {
  const vc = [];
  const vs = [];
  const v1 = [];
  for (const s of scenNames) {
    const hz = med[s][l];
    if (!hz) continue;
    const bc = Math.max(0, ...comps.map((c) => med[s][c] ?? 0));
    if (bc) vc.push(hz / bc);
    const bs = Math.max(0, ...safeComps.map((c) => med[s][c] ?? 0));
    if (bs) vs.push(hz / bs);
    if (med[s][V1]) v1.push(hz / med[s][V1]);
  }
  txt += `  ${l.padEnd(W)} vsComp ${pad(geo(vc), 5)}  vsSafe ${pad(geo(vs), 5)}  vsV1 ${pad(geo(v1), 5)}\n`;
}
console.log(txt);
if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ rounds: ROUNDS, maxTime: MAX_TIME, cands, medians: med, raw }, null, 2));
