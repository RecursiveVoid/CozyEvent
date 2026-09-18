/**
 * Randomized differential test: CozyEvent vs a trivially-correct reference model of SPEC S1-S11.
 * Listeners perform random re-entrant operations (on/once/off/unsubscribe/removeAllListeners/
 * nested emit/emitAsync) chosen deterministically, so both sides must produce identical call logs
 * after every top-level op.
 *
 * Live listener state is compared behaviourally, never by reading storage: at a probe point both
 * sides emit the PROBE payload to every event twice. Listeners answer a probe by logging their id
 * only (no scripted side effect), so the first probe reveals each event's full registration list in
 * order (on and once) and the second the surviving on registrations. Each sequence is run twice:
 * once to the end with a final probe, once cut at a random op (per seed) with a probe there.
 *
 * FUZZ_SEQUENCES env var overrides the number of sequences (default 10000).
 */
import { CozyEvent } from '../src/index';
import { PROBE } from '../test-types/behaviour';

type Rec = { ev: string; fn: number; once: boolean; ran: boolean };

/** Reference model: plain Map of arrays, copied on every mutation, obvious once flag. */
class Model {
  m = new Map<string, Rec[]>();
  q: { list: Rec[]; p: unknown }[] = [];
  constructor(private call: (fn: number, p: unknown) => void) {}
  add(ev: string, fn: number, once: boolean): Rec {
    const r = { ev, fn, once, ran: false };
    this.m.set(ev, [...(this.m.get(ev) ?? []), r]);
    return r;
  }
  private removeAt(ev: string, i: number) {
    const l = this.m.get(ev)!;
    const n = l.filter((_, j) => j !== i);
    if (n.length) this.m.set(ev, n);
    else this.m.delete(ev);
  }
  unsub(r: Rec) {
    const l = this.m.get(r.ev);
    const i = l ? l.indexOf(r) : -1;
    if (i >= 0) this.removeAt(r.ev, i);
  }
  off(ev: string, fn: number) {
    const l = this.m.get(ev) ?? [];
    for (let i = l.length - 1; i >= 0; i--)
      if (l[i].fn === fn) return this.removeAt(ev, i);
  }
  removeAll(ev?: string) {
    if (ev === undefined) this.m.clear();
    else this.m.delete(ev);
  }
  private run(list: Rec[], p: unknown) {
    for (const r of list) {
      if (r.once) {
        if (r.ran) continue;
        r.ran = true;
        this.unsub(r);
      }
      this.call(r.fn, p);
    }
  }
  emit(ev: string, p: unknown) {
    const l = this.m.get(ev);
    if (l) this.run(l, p);
  }
  emitAsync(ev: string, p: unknown) {
    const l = this.m.get(ev);
    if (l) this.q.push({ list: l, p });
  }
  flush() {
    while (this.q.length) {
      const { list, p } = this.q.shift()!;
      this.run(list, p);
    }
  }
}

// Deterministic PRNG
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENTS = ['a', 'b', '__proto__', 'constructor', 'toString', ''];
const NFN = 4;

type Op =
  | { t: 'on' | 'once'; ev: string; fn: number }
  | { t: 'off'; ev: string; fn: number }
  | { t: 'unsub'; h: number }
  | { t: 'rmall'; ev?: string }
  | { t: 'emit' | 'emitAsync'; ev: string; p: number }
  | { t: 'flush' }
  | { t: 'noop' };

function genOp(rnd: () => number, nested: boolean): Op {
  const ev = EVENTS[Math.floor(rnd() * EVENTS.length)];
  const fn = Math.floor(rnd() * NFN);
  const x = rnd();
  if (nested) {
    if (x < 0.35) return { t: 'noop' };
    if (x < 0.45) return { t: 'on', ev, fn };
    if (x < 0.55) return { t: 'once', ev, fn };
    if (x < 0.65) return { t: 'off', ev, fn };
    if (x < 0.75) return { t: 'unsub', h: Math.floor(rnd() * 64) };
    if (x < 0.8) return { t: 'rmall', ev: rnd() < 0.3 ? undefined : ev };
    if (x < 0.92) return { t: 'emit', ev, p: Math.floor(rnd() * 1000) };
    return { t: 'emitAsync', ev, p: Math.floor(rnd() * 1000) };
  }
  if (x < 0.22) return { t: 'on', ev, fn };
  if (x < 0.34) return { t: 'once', ev, fn };
  if (x < 0.46) return { t: 'off', ev, fn };
  if (x < 0.56) return { t: 'unsub', h: Math.floor(rnd() * 64) };
  if (x < 0.6) return { t: 'rmall', ev: rnd() < 0.3 ? undefined : ev };
  if (x < 0.82) return { t: 'emit', ev, p: Math.floor(rnd() * 1000) };
  if (x < 0.93) return { t: 'emitAsync', ev, p: Math.floor(rnd() * 1000) };
  return { t: 'flush' };
}

interface Side {
  log: string[];
  /** Emits PROBE to `ev` (sync, top level). */
  probe(ev: string): void;
  apply(op: Op): void | Promise<void>;
}

function makeSides(seed: number): [Side, Side] {
  // Per-function action scripts, pre-generated so both sides use identical scripts.
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const scripts = Array.from({ length: NFN }, () => Array.from({ length: 40 }, () => genOp(rnd, true)));

  function build(kind: 'real' | 'model'): Side {
    const log: string[] = [];
    const counts = new Array(NFN).fill(0);
    const handles: any[] = [];
    let depth = 0;
    const e = new CozyEvent();
    let model!: Model;
    const perform = (op: Op) => {
      switch (op.t) {
        case 'on':
        case 'once':
          handles.push(kind === 'real' ? e[op.t](op.ev, fns[op.fn]) : model.add(op.ev, op.fn, op.t === 'once'));
          break;
        case 'off':
          kind === 'real' ? e.off(op.ev, fns[op.fn]) : model.off(op.ev, op.fn);
          break;
        case 'unsub': {
          const h = handles[op.h % Math.max(1, handles.length)];
          if (h) kind === 'real' ? h() : model.unsub(h);
          break;
        }
        case 'rmall':
          kind === 'real' ? e.removeAllListeners(op.ev) : model.removeAll(op.ev);
          break;
        case 'emit':
          if (depth > 4) break;
          depth++;
          try {
            kind === 'real' ? e.emit(op.ev, op.p) : model.emit(op.ev, op.p);
          } finally {
            depth--;
          }
          break;
        case 'emitAsync':
          if (depth > 4) break;
          kind === 'real' ? e.emitAsync(op.ev, op.p) : model.emitAsync(op.ev, op.p);
          break;
      }
    };
    const invoke = (i: number, p: unknown) => {
      if (p === PROBE) return void log.push(`P${i}`);
      log.push(`${i}:${p}`);
      const c = counts[i]++;
      if (c < 40) perform(scripts[i][c]);
    };
    const fns = Array.from({ length: NFN }, (_, i) => (p: unknown) => invoke(i, p));
    model = new Model(invoke);
    return {
      log,
      probe: (ev) => (kind === 'real' ? e.emit(ev, PROBE) : model.emit(ev, PROBE)),
      apply(op) {
        if (op.t === 'flush') {
          if (kind === 'model') return model.flush();
          return new Promise<void>((r) => setImmediate(r));
        }
        perform(op);
      },
    };
  }
  return [build('real'), build('model')];
}

const SEQUENCES = Number(process.env.FUZZ_SEQUENCES ?? 10_000);

/** Runs ops[0..cut] on a fresh real/model pair, comparing logs after every op, then probes all events. */
async function run(s: number, ops: Op[], cut: number): Promise<{ calls: number; probed: number }> {
  const [real, model] = makeSides(s);
  const fail = (what: string, i: number) => {
    throw new Error(
      `seed ${s} diverged ${what} (cut ${cut}) at op #${i} ${JSON.stringify(ops[i])}\n` +
        `ops: ${JSON.stringify(ops.slice(0, i + 1))}\n` +
        `real log:  ${real.log.join(' ')}\nmodel log: ${model.log.join(' ')}`,
    );
  };
  for (let i = 0; i <= cut; i++) {
    // Only await on flush: any other await would drain pending emitAsync microtasks early.
    if (ops[i].t === 'flush') await real.apply(ops[i]);
    else real.apply(ops[i]);
    model.apply(ops[i]);
    if (real.log.join() !== model.log.join()) fail('in the call log', i);
  }
  const before = real.log.length;
  for (const ev of EVENTS) {
    real.probe(ev);
    model.probe(ev);
    real.probe(ev);
    model.probe(ev);
    if (real.log.join() !== model.log.join()) fail(`in the probe of ${JSON.stringify(ev)}`, cut);
  }
  return { calls: before, probed: real.log.length - before };
}

test(`differential fuzz: ${SEQUENCES} random op sequences match the reference model`, async () => {
  let totalCalls = 0;
  let totalProbed = 0;
  for (let s = 1; s <= SEQUENCES; s++) {
    const rnd = mulberry32(s);
    const len = 5 + Math.floor(rnd() * 40);
    const ops: Op[] = [];
    for (let i = 0; i < len; i++) ops.push(genOp(rnd, false));
    ops.push({ t: 'flush' });
    const full = await run(s, ops, ops.length - 1);
    const cut = await run(s, ops, Math.floor(mulberry32(s ^ 0x5bd1e995)() * ops.length));
    totalCalls += full.calls;
    totalProbed += full.probed + cut.probed;
  }
  // sanity: the fuzz actually exercises listeners and the probes actually see registrations
  expect(totalCalls).toBeGreaterThan(SEQUENCES);
  expect(totalProbed).toBeGreaterThan(SEQUENCES);
}, 600_000);
