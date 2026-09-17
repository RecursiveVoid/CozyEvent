// Library registry for the speed benchmark (benchmark/case.js, run.js, ab.js).
//
// Every entry has `load()` -> a factory `create()` returning an emitter instance. The benchmark
// calls the instance's OWN methods directly: ee.on(event, fn), ee.off(event, fn),
// ee.once(event, fn), ee.emit(event, payload), ee.emitAsync(event, payload).
// Optional entry fields:
//   only:  scenarios this entry applies to (others are reported as n/a)
//   unsub: remove listeners through the function returned by on() instead of off()
//   once:  (ee, event, fn) => void, a userland once for libraries that have none (see below)
//   note:  shown next to the name in reports
//
// Fairness notes:
// - No wrapper object sits between the benchmark and emit/on/off for any library. Each
//   (library x scenario) runs in its own Node process, so JIT feedback never mixes libraries.
// - @braintree/event-emitter, @protobufjs/eventemitter, mitt and nanoevents have no `once`. They
//   get the textbook userland once (wrap the listener in a closure that removes itself, then calls
//   the listener). For braintree/protobufjs it is a subclass method; for mitt and nanoevents it is a
//   plain helper function `once(ee, event, fn)`, so their instances stay the untouched native
//   objects (no extra property, no shape change) in every other scenario. This extra closure is cost
//   those libraries would not pay if they implemented once natively.
// - nanoevents has no off(event, fn): its native removal API is the function returned by on(),
//   so its on+off scenario uses that (like 'cozyevent v2 (unsubscribe fn)').
// - mitt and nanoevents are benchmarked natively: mitt's emit copies the handler array
//   (slice) and also dispatches '*' handlers; nanoevents' emit spreads ...args and allocates an
//   empty array for unknown events. That is their real code.
// - eventemitter2.emitAsync returns a Promise and awaits listener results (different semantics
//   from cozyevent's fire-and-forget microtask emit); its numbers include that Promise cost.
// - node:events: EventEmitter from Node core (not bundleable for browsers without a polyfill).
// - tseep's default build generates a specialised emit function per listener count with `eval`
//   (unrolled calls, one call site per listener: that is why it wins big with distinct listeners).
//   That is not allowed under a strict CSP (no 'unsafe-eval'), and cozyevent must stay CSP-safe.
//   'tseep (CSP-safe build)' is tseep's own no-eval build (tseep/lib/ee-safe, what tseep's
//   fallback entry picks when eval throws). Entries marked `eval: true` use code generation.
// - event-emitter (medikoo) is a mixin factory: `ee()` returns a new emitter object.

import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

const withOnce = (Base) =>
  class extends Base {
    once(e, fn) {
      const w = (p) => {
        this.off(e, w);
        fn(p);
      };
      this.on(e, w);
    }
  };

const cozy = (url) => async () => {
  const m = await import(url);
  const C = m.CozyEvent ?? m.default;
  if (typeof C !== 'function') throw new Error(`${url} exports no CozyEvent`);
  return () => new C();
};

export const libs = {
  'cozyevent v2': { pkg: 'cozyevent (dist)', load: cozy('../dist/index.js') },
  // Same library; on+off scenario uses the unsubscribe function returned by on() instead of off().
  'cozyevent v2 (unsubscribe fn)': {
    pkg: 'cozyevent (dist)',
    only: ['onoff'],
    unsub: true,
    load: cozy('../dist/index.js'),
  },
  'cozyevent v1.4.2': { pkg: 'benchmark/baseline/cozyevent-v1.js', load: cozy('./baseline/cozyevent-v1.js') },
  tseep: {
    pkg: 'tseep',
    note: 'uses eval',
    eval: true,
    load: async () => {
      const { EventEmitter } = require('tseep');
      return () => new EventEmitter();
    },
  },
  'tseep (CSP-safe build)': {
    pkg: 'tseep/lib/ee-safe',
    load: async () => {
      const { EventEmitter } = require('tseep/lib/ee-safe');
      return () => new EventEmitter();
    },
  },
  eventemitter3: {
    pkg: 'eventemitter3',
    load: async () => {
      const EE3 = require('eventemitter3');
      return () => new EE3();
    },
  },
  eventemitter2: {
    pkg: 'eventemitter2',
    load: async () => {
      const EE2 = require('eventemitter2');
      return () => new EE2();
    },
  },
  emitix: {
    pkg: 'emitix',
    load: async () => {
      const { EventEmitter } = require('emitix');
      return () => new EventEmitter();
    },
  },
  '@braintree/event-emitter': {
    pkg: '@braintree/event-emitter',
    note: 'once via userland adapter',
    load: async () => {
      const C = withOnce(require('@braintree/event-emitter'));
      return () => new C();
    },
  },
  '@protobufjs/eventemitter': {
    pkg: '@protobufjs/eventemitter',
    note: 'once via userland adapter',
    load: async () => {
      const C = withOnce(require('@protobufjs/eventemitter'));
      return () => new C();
    },
  },
  'event-emitter': {
    pkg: 'event-emitter',
    load: async () => {
      const ee = require('event-emitter');
      return () => ee();
    },
  },
  mitt: {
    pkg: 'mitt',
    note: 'once via userland adapter',
    optional: true,
    once: (ee, e, fn) => {
      const w = (p) => {
        ee.off(e, w);
        fn(p);
      };
      ee.on(e, w);
    },
    load: async () => {
      const mitt = (await import('mitt')).default;
      return () => mitt();
    },
  },
  nanoevents: {
    pkg: 'nanoevents',
    note: 'once via userland adapter; off = returned unbind',
    optional: true,
    unsub: true,
    once: (ee, e, fn) => {
      const u = ee.on(e, (p) => {
        u();
        fn(p);
      });
    },
    load: async () => {
      const { createNanoEvents } = await import('nanoevents');
      return () => createNanoEvents();
    },
  },
  'node:events': {
    pkg: 'node:events',
    load: async () => {
      const { EventEmitter } = await import('node:events');
      return () => new EventEmitter();
    },
  },
};

for (const [k, v] of Object.entries(libs)) {
  if (!v.optional) continue;
  try {
    require.resolve(v.pkg);
  } catch {
    delete libs[k]; // not installed: skipped (nothing is installed just for benchmarks)
  }
}

/** Registers candidate implementations as 'cand:<name>'. cands: [[name, absolutePath], ...] */
export function addCandidates(cands) {
  for (const [name, path] of cands) {
    if (!isAbsolute(path)) throw new Error(`candidate ${name}: path must be absolute (${path})`);
    if (!existsSync(path)) throw new Error(`candidate ${name}: ${path} does not exist`);
    libs[`cand:${name}`] = { pkg: path, load: cozy(pathToFileURL(path).href) };
  }
}

if (process.env.BENCH_CANDS) addCandidates(JSON.parse(process.env.BENCH_CANDS));
