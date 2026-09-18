/**
 * Heap-retention probe for core.memory.test.ts. Runs in its own process:
 *
 *   node --expose-gc test-types/memory-child.cjs <impl> [N]
 *
 * <impl> is a module exporting `CozyEvent`: a built file (dist/index.cjs) or a TypeScript source
 * (src/index.ts; transpiled in memory with the repo's `typescript`, relative imports included).
 * For every scenario it builds a fresh long-lived emitter that also holds a few live listeners,
 * forces GC, runs N churn iterations, forces GC again and reports the retained heap growth.
 * Prints one JSON line: { impl, n, results: [{ name, retained, perIteration, liveOk }] }.
 *
 * Only public API is used; nothing reads internal storage.
 */
'use strict';
const path = require('path');

if (typeof gc !== 'function') {
  console.error('run with node --expose-gc');
  process.exit(2);
}

const impl = path.resolve(process.argv[2]);
const N = Number(process.argv[3] || 1e6);

if (impl.endsWith('.ts')) {
  const ts = require('typescript');
  const fs = require('fs');
  require.extensions['.ts'] = (module, filename) => {
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        useDefineForClassFields: true,
        esModuleInterop: true,
      },
    });
    module._compile(out.outputText, filename);
  };
}
const { CozyEvent } = require(impl);

const noop = () => {};

/** Each scenario: one churn iteration `i` on emitter `e`. Names are unique per iteration where stated. */
const scenarios = {
  'unique names: on + off': (e, i) => {
    const n = `ev:${i}`;
    e.on(n, noop);
    e.off(n, noop);
  },
  'unique names: on + unsubscribe': (e, i) => {
    e.on(`ev:${i}`, noop)();
  },
  'unique names: once + emit': (e, i) => {
    const n = `ev:${i}`;
    e.once(n, noop);
    e.emit(n, i);
  },
  'unique names: once + off': (e, i) => {
    const n = `ev:${i}`;
    e.once(n, noop);
    e.off(n, noop);
  },
  'unique names: mixed on/once, emitAsync-free': (e, i) => {
    const n = `ev:${i}`;
    const u = e.on(n, noop);
    e.once(n, noop);
    e.emit(n, i);
    u();
  },
  // Same event name every time: catches records (once guards, copies) that are never released.
  'one event: once + emit': (e) => {
    e.once('same', noop);
    e.emit('same', 0);
  },
  'one event: on + off': (e) => {
    e.on('same', noop);
    e.off('same', noop);
  },
  'one event: on + unsubscribe': (e) => {
    e.on('same', noop)();
  },
};

const heap = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

const results = [];
for (const [name, step] of Object.entries(scenarios)) {
  let live = 0;
  const count = () => live++;
  const e = new CozyEvent();
  // a long-lived emitter with some live events (and a live listener on the churned 'same' event)
  for (let k = 0; k < 16; k++) e.on(`live:${k}`, count);
  e.on('same', count);
  // warm up code paths so JIT/feedback allocations are not counted as retention
  for (let i = 0; i < 1000; i++) step(e, -1 - i);
  const base = heap();
  for (let i = 0; i < N; i++) step(e, i);
  const after = heap();
  live = 0;
  for (let k = 0; k < 16; k++) e.emit(`live:${k}`, 0);
  const liveOk = live === 16;
  results.push({ name, retained: after - base, perIteration: (after - base) / N, liveOk });
  // keep `e` reachable until after the measurement
  if (!e) throw new Error('unreachable');
}
process.stdout.write(JSON.stringify({ impl, n: N, results }) + '\n');
