// Runs ONE (library x scenario) measurement and prints one JSON line to stdout.
// Usage: node benchmark/case.js "<library>" <scenario> [maxTimeSeconds]
// Spawned by benchmark/run.js and benchmark/ab.js; one process per case so JIT feedback from
// other libraries or scenarios cannot pollute call sites. Candidates arrive via BENCH_CANDS.

import { createRequire } from 'node:module';
import { libs } from './libs.js';

const require = createRequire(import.meta.url);
const Benchmark = require('benchmark');

export const scenarios = {
  emit0: 'emit, 0 listeners on the event',
  emit1: 'emit, 1 listener',
  emit3: 'emit, 3 listeners (same code)',
  emit3distinct: 'emit, 3 distinct listener functions',
  emit10: 'emit, 10 listeners (same code)',
  emit10distinct: 'emit, 10 distinct listener functions',
  emit100: 'emit, 100 listeners (same code)',
  emitMixed: 'app bus: 20 event names, 1-3 distinct listeners each, emit round-robin',
  onoff: 'on + off cycle (5 existing listeners)',
  once: 'once + emit',
  emitAsync: 'emitAsync, 10 listeners (incl. microtask drain)',
  create: 'create emitter + on + emit',
};

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');

// Realistic app bus event names (internalized string constants, as in real code).
const MIXED_NAMES = [
  'user:login', 'user:logout', 'cart:add', 'cart:remove', 'route:change', 'modal:open', 'modal:close',
  'toast', 'theme:change', 'resize', 'scroll', 'socket:message', 'socket:open', 'socket:close',
  'form:submit', 'form:error', 'data:loaded', 'data:error', 'player:play', 'player:pause',
];

async function main() {
  const [name, scen, maxTimeArg] = process.argv.slice(2);
  const maxTime = Number(maxTimeArg) || 0.5;
  const lib = libs[name];
  if (!lib) throw new Error('unknown library ' + name);
  if (!(scen in scenarios)) throw new Error('unknown scenario ' + scen);
  if (lib.only && !lib.only.includes(scen)) return out({ lib: name, scen, skipped: 'n/a' });

  const create = await lib.load();
  const payload = { a: 1 };
  let calls = 0;
  // Same code, a new closure each time (one SharedFunctionInfo: call sites stay monomorphic).
  const mk = () => (p) => {
    calls += p.a;
  };
  // Ten listeners with DIFFERENT code (distinct functions: call sites become polymorphic /
  // megamorphic like a real app). Each adds exactly p.a to calls.
  const distinct = [
    (p) => { calls += p.a; },
    (p) => { calls = calls + p.a; },
    (p) => { calls += p.a | 0; },
    (p) => { calls -= -p.a; },
    (p) => { if (p) calls += p.a; },
    (p) => { calls += p.a >>> 0; },
    (p) => { const v = p.a; calls += v; },
    (p) => { calls += +p.a; },
    (p) => { calls += p.a * 1; },
    (p) => { calls += p['a']; },
  ];

  const ee = create();
  ee.on('other', mk()); // an unrelated event so storage is not trivially empty
  let fn;
  let expectCalls = true;
  let want = 0; // listener calls expected per `checkIters` calls of fn
  let checkIters = 1;
  const N = { emit1: 1, emit3: 3, emit10: 10, emit100: 100 }[scen];
  const ND = { emit3distinct: 3, emit10distinct: 10 }[scen];

  if (N) {
    for (let i = 0; i < N; i++) ee.on('x', mk());
    fn = () => ee.emit('x', payload);
    want = N;
  } else if (ND) {
    for (let i = 0; i < ND; i++) ee.on('x', distinct[i]);
    fn = () => ee.emit('x', payload);
    want = ND;
  } else if (scen === 'emitMixed') {
    let j = 0;
    for (let i = 0; i < MIXED_NAMES.length; i++) {
      const count = 1 + ((i * 7) % 3); // 1..3, deterministic
      for (let c = 0; c < count; c++) ee.on(MIXED_NAMES[i], distinct[j++ % distinct.length]);
      want += count;
    }
    let k = 0;
    fn = () => {
      ee.emit(MIXED_NAMES[k], payload);
      if (++k === 20) k = 0;
    };
    checkIters = MIXED_NAMES.length;
  } else if (scen === 'emit0') {
    fn = () => ee.emit('x', payload);
    expectCalls = false;
  } else if (scen === 'onoff') {
    for (let i = 0; i < 5; i++) ee.on('x', mk());
    const f = mk();
    if (lib.unsub) fn = () => ee.on('x', f)();
    else
      fn = () => {
        ee.on('x', f);
        ee.off('x', f);
      };
    expectCalls = false;
  } else if (scen === 'once') {
    const f = mk();
    const once = lib.once;
    if (once)
      fn = () => {
        once(ee, 'x', f);
        ee.emit('x', payload);
      };
    else
      fn = () => {
        ee.once('x', f);
        ee.emit('x', payload);
      };
    want = 1;
  } else if (scen === 'create') {
    const f = mk();
    fn = () => {
      const e = create();
      e.on('x', f);
      e.emit('x', payload);
    };
    want = 1;
  } else if (scen === 'emitAsync') {
    if (typeof ee.emitAsync !== 'function') return out({ lib: name, scen, skipped: 'no emitAsync' });
    for (let i = 0; i < 10; i++) ee.on('x', mk());
    // Throughput loop: BATCH emitAsync calls, then wait for a macrotask so every queued microtask
    // (and eventemitter2's promises) has run. Samples are ~50 ms windows; rme like benchmark.js.
    const BATCH = 1000;
    const drain = () => new Promise((r) => setImmediate(r));
    const window = async (ms) => {
      let n = 0;
      const t0 = performance.now();
      let t;
      while ((t = performance.now()) - t0 < ms) {
        for (let i = 0; i < BATCH; i++) ee.emitAsync('x', payload);
        await drain();
        n += BATCH;
      }
      return n / ((t - t0) / 1000);
    };
    for (let i = 0; i < 6; i++) await window(50); // warm-up
    const samples = [];
    const end = performance.now() + maxTime * 1000;
    while (performance.now() < end || samples.length < 10) samples.push(await window(50));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length - 1));
    const rme = ((1.96 * sd) / Math.sqrt(samples.length) / mean) * 100;
    // correctness: every emitAsync must have reached all 10 listeners
    const before = calls;
    for (let i = 0; i < 10; i++) ee.emitAsync('x', payload);
    await drain();
    if (calls - before !== 100) throw new Error(`${name} emitAsync delivered ${calls - before}/100`);
    return out({ lib: name, scen, hz: mean, rme, samples: samples.length });
  }

  // sanity check before timing: behaviour must match the scenario
  const before = calls;
  for (let i = 0; i < checkIters; i++) fn();
  const delta = calls - before;
  if (delta !== want) throw new Error(`${name}/${scen}: ${checkIters} call(s) delivered ${delta}, expected ${want}`);
  if (scen === 'once') {
    const b2 = calls;
    ee.emit('x', payload);
    if (calls !== b2) throw new Error(`${name}: once listener fired twice`);
  }
  if (scen === 'onoff') {
    const b2 = calls;
    ee.emit('x', payload);
    if (calls - b2 !== 5) throw new Error(`${name}: on+off left ${calls - b2 - 5} extra listener(s)`);
  }

  for (let i = 0; i < 1e5; i++) fn(); // warm-up / reach optimized tier
  const b = new Benchmark(scen, fn, { maxTime, minSamples: 10 });
  b.run();
  if (expectCalls && calls === 0) throw new Error('listeners never called');
  out({ lib: name, scen, hz: b.hz, rme: b.stats.rme, samples: b.stats.sample.length });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => {
    out({ lib: process.argv[2], scen: process.argv[3], error: String(e && e.message) });
    process.exitCode = 1;
  });
}
