/**
 * Regression tests for the speed-oriented core design (append-only record arrays with
 * copy-on-remove, `(array, length)` snapshots, twelve unrolled call sites + a six-wide loop,
 * bound unsubscribe, one-slot delayed cleanup of emptied events).
 * Every test runs against the TypeScript source and, when it has been built, against the
 * minified dist/index.cjs, so minifier rewrites (e.g. dropping `(0, fn)(p)`) are caught too.
 * @jest-environment node
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { CozyEvent as SrcCozyEvent } from '../src/index';
import { mockCalls, tick } from '../test-types/behaviour';

const distFile = join(__dirname, '..', 'dist', 'index.cjs');
const impls: [string, typeof SrcCozyEvent][] = [['src', SrcCozyEvent]];
// eslint-disable-next-line @typescript-eslint/no-var-requires
if (existsSync(distFile)) impls.push(['dist', require(distFile).CozyEvent]);

// Behaviour only: live listener lists are observed by emitting and counting calls, never by
// reading internal storage.

/** Sizes that cross every call-site boundary of the unrolled emit (1..12) and the six-wide loop (13+). */
const SIZES = [1, 2, 3, 9, 10, 11, 12, 13, 18, 19, 20, 24, 25, 101];

const protoKeys = Object.getOwnPropertyNames(Object.prototype).sort();

describe.each(impls)('%s', (_name, CozyEvent) => {
  describe('call-site boundaries and 0 -> 1 -> 2 -> N -> 1 -> 0 transitions', () => {
    test.each(SIZES)('%i listeners: all called once, in order, with the payload', (n) => {
      const e = new CozyEvent();
      const log: string[] = [];
      const offs = Array.from({ length: n }, (_, i) => e.on('x', (p) => log.push(`${i}:${p}`)));
      e.emit('x', 7);
      expect(log).toEqual(Array.from({ length: n }, (_, i) => `${i}:7`));
      // remove from the middle, then the front, then the back
      log.length = 0;
      offs[Math.floor(n / 2)]();
      if (n > 1) offs[0]();
      if (n > 2) offs[n - 1]();
      const alive = Array.from({ length: n }, (_, i) => i).filter(
        (i) => i !== Math.floor(n / 2) && i !== 0 && i !== n - 1,
      );
      e.emit('x', 1);
      expect(log).toEqual(alive.map((i) => `${i}:1`));
      offs.forEach((u) => u());
      log.length = 0;
      e.emit('x', 2);
      expect(log).toEqual([]);
    });

    test('grow 0 -> 30 -> 0 one at a time, emitting at every step', () => {
      const e = new CozyEvent();
      const calls: number[] = [];
      const fns = Array.from({ length: 30 }, (_, i) => (p: number) => calls.push(i * 1000 + p));
      const expectAll = (live: number[], p: number) => {
        calls.length = 0;
        e.emit('x', p);
        expect(calls).toEqual(live.map((i) => i * 1000 + p));
      };
      const live: number[] = [];
      expectAll(live, 0);
      for (let i = 0; i < 30; i++) {
        e.on('x', fns[i]);
        live.push(i);
        expectAll(live, i + 1);
      }
      // shrink via off in a scrambled order
      const order = [29, 0, 15, 10, 9, 11, 1, 28, 2, 27, 3, 26, 4, 25, 5, 24, 6, 23, 7, 22, 8, 21, 12, 20, 13, 19, 14, 18, 16, 17];
      for (const i of order) {
        e.off('x', fns[i]);
        live.splice(live.indexOf(i), 1);
        expectAll(live, 100);
      }
      // regrow after being emptied (fresh array)
      e.on('x', fns[3]);
      expectAll([3], 5);
    });

    test('on after a removal pushes onto the copy, never onto an array an emit still holds', () => {
      for (const n of SIZES) {
        const e = new CozyEvent();
        const log: number[] = [];
        const offs: (() => void)[] = [];
        for (let i = 0; i < n; i++)
          offs.push(
            e.on('x', () => {
              log.push(i);
              if (i === 0) {
                // remove the last one (still runs: snapshot), then add two more (must not run now)
                offs[n - 1]();
                e.on('x', () => log.push(-1));
                e.on('x', () => log.push(-2));
              }
            }),
          );
        e.emit('x');
        expect(log).toEqual(Array.from({ length: n }, (_, i) => i));
        log.length = 0;
        e.emit('x');
        const again = n === 1 ? [-1, -2] : [...Array.from({ length: n - 1 }, (_, i) => i), -1, -2];
        // first listener adds two more again, which do not run in this emit
        expect(log).toEqual(n === 1 ? [-1, -2] : again);
      }
    });
  });

  describe('re-entrancy during emit (large lists, loop path)', () => {
    test('listener at index 12 removes indices 11, 13 and adds more: snapshot kept', () => {
      const e = new CozyEvent();
      const log: number[] = [];
      const fns: ((p?: unknown) => void)[] = [];
      for (let i = 0; i < 20; i++) {
        fns[i] = () => {
          log.push(i);
          if (i === 12) {
            e.off('x', fns[11]);
            e.off('x', fns[13]);
            e.on('x', () => log.push(100));
          }
        };
        e.on('x', fns[i]);
      }
      e.emit('x');
      expect(log).toEqual(Array.from({ length: 20 }, (_, i) => i));
      log.length = 0;
      e.emit('x');
      expect(log).toEqual([...Array.from({ length: 20 }, (_, i) => i).filter((i) => i !== 11 && i !== 13), 100]);
    });

    test('removeAllListeners(event) and removeAllListeners() inside a listener at index 10', () => {
      for (const all of [false, true]) {
        const e = new CozyEvent();
        const log: number[] = [];
        for (let i = 0; i < 15; i++)
          e.on('x', () => {
            log.push(i);
            if (i === 10) {
              all ? e.removeAllListeners() : e.removeAllListeners('x');
              e.on('x', () => log.push(-1));
            }
          });
        e.emit('x');
        expect(log).toEqual(Array.from({ length: 15 }, (_, i) => i));
        log.length = 0;
        e.emit('x');
        expect(log).toEqual([-1]); // exactly one live listener
      }
    });

    test('nested emit from index 11 sees the state at that moment; outer snapshot unaffected', () => {
      const e = new CozyEvent();
      const log: string[] = [];
      let depth = 0;
      const fns: ((p: string) => void)[] = [];
      for (let i = 0; i < 14; i++) {
        fns[i] = (p) => {
          log.push(`${p}${i}`);
          if (i === 11 && depth === 0) {
            depth++;
            e.off('x', fns[13]);
            e.on('x', (q) => log.push(`${q}new`));
            e.emit('x', 'in');
            depth--;
          }
        };
        e.on('x', fns[i]);
      }
      e.emit('x', 'out');
      const inner = [...Array.from({ length: 13 }, (_, i) => `in${i}`), 'innew'];
      expect(log).toEqual([
        ...Array.from({ length: 12 }, (_, i) => `out${i}`),
        ...inner,
        'out12',
        'out13',
      ]);
    });

    test('once listeners across the call-site boundary run exactly once under nested emits', () => {
      const e = new CozyEvent();
      const counts = new Array(25).fill(0);
      for (let i = 0; i < 25; i++) {
        const fn = () => {
          counts[i]++;
          e.emit('x'); // re-entrant: all remaining once records already removed only when run
        };
        i % 2 ? e.once('x', fn) : e.on('x', () => counts[i]++);
      }
      e.emit('x');
      for (let i = 1; i < 25; i += 2) expect(counts[i]).toBe(1);
      // the 13 on listeners are left, the once listeners are gone
      const before = [...counts];
      e.emit('x');
      expect(counts.map((c, i) => c - before[i])).toEqual(Array.from({ length: 25 }, (_, i) => (i % 2 ? 0 : 1)));
    });
  });

  describe('same function registered many times, mixed on/once/unsubscribe/off', () => {
    test('each unsubscribe removes exactly its own registration and is idempotent', () => {
      const e = new CozyEvent();
      const seen: string[] = [];
      const f = (p: string) => seen.push(p);
      const u: (() => void)[] = [];
      for (let i = 0; i < 24; i++) u.push(i % 3 === 2 ? e.once('x', f) : e.on('x', f));
      // unsubscribe a few, twice each
      for (const i of [0, 5, 11, 12, 23]) {
        u[i]();
        u[i]();
      }
      e.emit('x', 'a');
      expect(seen.length).toBe(19);
      // once registrations 2,8,14,17,20 ran and are gone (5 and 11 and 23 were unsubscribed);
      // unsubscribing a once that already ran is a no-op
      for (const i of [2, 8, 14, 17, 20]) u[i]();
      const count = () => {
        seen.length = 0;
        e.emit('x', 'c');
        return seen.length;
      };
      expect(count()).toBe(14);
      // off removes one remaining registration at a time
      for (let k = 14; k > 0; k--) {
        e.off('x', f);
        expect(count()).toBe(k - 1);
      }
      // every old unsubscribe is now a no-op, even after re-adding the same function
      e.on('x', f);
      u.forEach((x) => x());
      expect(count()).toBe(1);
    });

    test('off matches a once registration by its original listener, most recent first', () => {
      const e = new CozyEvent();
      const log: string[] = [];
      const f = (p: string) => log.push(p);
      e.on('x', f);
      e.once('x', f);
      e.off('x', f); // removes the once (most recent)
      e.emit('x', '1');
      e.emit('x', '2');
      expect(log).toEqual(['1', '2']);
    });

    test('unsubscribe after removeAllListeners then re-add does not remove the new registration', () => {
      for (const all of [false, true]) {
        const e = new CozyEvent();
        const f = jest.fn();
        const u1 = e.on('x', f);
        const u2 = e.once('x', f);
        all ? e.removeAllListeners() : e.removeAllListeners('x');
        const u3 = e.on('x', f);
        const u4 = e.once('x', f);
        u1();
        u2();
        u1();
        u2();
        e.emit('x', 1);
        expect(f).toHaveBeenCalledTimes(2);
        e.emit('x', 2);
        expect(f).toHaveBeenCalledTimes(3);
        u4();
        u3();
        e.emit('x', 3);
        expect(f).toHaveBeenCalledTimes(3);
      }
    });

    test('bound unsubscribe ignores extra arguments and a foreign this', () => {
      const e = new CozyEvent();
      const f = jest.fn();
      const g = jest.fn();
      e.on('x', g);
      const u = e.on('x', f) as (...a: unknown[]) => void;
      u.call({ off: g, emit: g }, g, 'x', 1);
      e.emit('x');
      expect(f).not.toHaveBeenCalled();
      expect(g).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitAsync snapshots (array + length captured at call time)', () => {
    test('pushes, removals and removeAllListeners between call and microtask', async () => {
      const e = new CozyEvent();
      const log: string[] = [];
      const offs = Array.from({ length: 12 }, (_, i) => e.on('x', (p) => log.push(`${p}${i}`)));
      e.emitAsync('x', 'a');
      e.on('x', (p) => log.push(`${p}late`)); // pushes onto the same array: must not run for 'a'
      e.emitAsync('x', 'b');
      offs[3]();
      offs[11]();
      e.emitAsync('x', 'c');
      e.removeAllListeners('x');
      e.emitAsync('x', 'd'); // no listeners: nothing scheduled
      e.on('x', (p) => log.push(`${p}re`));
      e.emitAsync('x', 'e');
      expect(log).toEqual([]);
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      const all = Array.from({ length: 12 }, (_, i) => i);
      expect(log).toEqual([
        ...all.map((i) => `a${i}`),
        ...all.map((i) => `b${i}`),
        'blate',
        ...all.filter((i) => i !== 3 && i !== 11).map((i) => `c${i}`),
        'clate',
        'ere',
      ]);
    });

    test('once in several async snapshots runs once; listener removing others does not affect a snapshot', async () => {
      const e = new CozyEvent();
      const f = jest.fn();
      const log: number[] = [];
      for (let i = 0; i < 11; i++) e.on('x', () => log.push(i));
      e.once('x', f);
      e.on('x', () => {
        log.push(99);
        e.removeAllListeners();
      });
      e.emitAsync('x', 1);
      e.emitAsync('x', 2);
      await new Promise((r) => setImmediate(r));
      expect(f).toHaveBeenCalledTimes(1);
      expect(f).toHaveBeenCalledWith(1);
      const one = [...Array.from({ length: 11 }, (_, i) => i), 99];
      expect(log).toEqual([...one, ...one]);
      e.emit('x', 3);
      expect(log).toHaveLength(2 * one.length);
      expect(f).toHaveBeenCalledTimes(1);
    });
  });

  describe('exceptions mid-emit', () => {
    test.each([0, 5, 9, 10, 15])('throw at index %i leaves state consistent; later emits correct', (t) => {
      const e = new CozyEvent();
      const log: number[] = [];
      let armed = true;
      for (let i = 0; i < 16; i++)
        (i % 4 === 1 ? e.once : e.on).call(e, 'x', () => {
          log.push(i);
          if (i === t && armed) {
            armed = false;
            throw new Error('boom');
          }
        });
      expect(() => e.emit('x')).toThrow('boom');
      expect(log).toEqual(Array.from({ length: t + 1 }, (_, i) => i));
      log.length = 0;
      e.emit('x');
      const ranOnce = (i: number) => i % 4 === 1 && i <= t;
      expect(log).toEqual(Array.from({ length: 16 }, (_, i) => i).filter((i) => !ranOnce(i)));
      log.length = 0;
      e.emit('x');
      expect(log).toEqual(Array.from({ length: 16 }, (_, i) => i).filter((i) => i % 4 !== 1));
    });

    test('throwing once listener is removed and never runs again', () => {
      const e = new CozyEvent();
      const f = jest.fn(() => {
        throw new Error('x');
      });
      let hits = 0;
      for (let i = 0; i < 10; i++) e.on('x', () => hits++);
      e.once('x', f);
      expect(() => e.emit('x')).toThrow('x');
      e.emit('x');
      expect(f).toHaveBeenCalledTimes(1);
      hits = 0;
      e.emit('x');
      expect(hits).toBe(10);
      expect(f).toHaveBeenCalledTimes(1);
    });
  });

  describe('__proto__ and prototype-ish names', () => {
    test.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '', 'undefined', 'null'])(
      '%j behaves as a normal event through all transitions',
      (name) => {
        const e = new CozyEvent();
        const f = jest.fn();
        expect(() => e.emit(name, 1)).not.toThrow();
        e.emitAsync(name, 1);
        e.off(name, f);
        const us = Array.from({ length: 12 }, () => e.on(name, f));
        e.once(name, f);
        e.emit(name, 1);
        expect(f).toHaveBeenCalledTimes(13);
        us.forEach((u) => u());
        e.emit(name, 2);
        expect(f).toHaveBeenCalledTimes(13);
        e.on(name, f);
        e.removeAllListeners(name);
        e.emit(name, 3);
        e.emitAsync(name, 4);
        expect(f).toHaveBeenCalledTimes(13);
        expect(Object.getPrototypeOf({})).toBe(Object.prototype);
        // nothing leaked onto Object.prototype
        expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(protoKeys);
      },
    );

    test('removeAllListeners() does not remove a real "undefined" event only when given it', () => {
      const e = new CozyEvent();
      const f = jest.fn();
      e.on('undefined', f);
      e.on('a', f);
      e.removeAllListeners('a');
      e.emit('undefined');
      expect(f).toHaveBeenCalledTimes(1);
      e.removeAllListeners();
      e.emit('undefined');
      expect(f).toHaveBeenCalledTimes(1);
    });

    test('instances do not share storage (shared null prototype stays empty)', () => {
      const a = new CozyEvent();
      const b = new CozyEvent();
      const f = jest.fn();
      a.on('x', f);
      a.on('__proto__', f);
      b.emit('x');
      b.emit('__proto__');
      expect(f).not.toHaveBeenCalled();
      // a fresh instance sees nothing either (listeners never land on shared state)
      const c = new CozyEvent();
      c.emit('x');
      c.emit('__proto__');
      expect(f).not.toHaveBeenCalled();
      a.removeAllListeners();
      a.emit('x');
      a.emit('__proto__');
      expect(f).not.toHaveBeenCalled();
      const g = jest.fn();
      b.on('x', g);
      a.on('__proto__', f);
      b.emit('x', 1);
      a.emit('x', 1);
      expect(g).toHaveBeenCalledTimes(1);
      expect(f).not.toHaveBeenCalled();
      a.emit('__proto__', 2);
      expect(f.mock.calls).toEqual([[2]]);
    });
  });

  describe('listener this and subclassing', () => {
    test.each(SIZES)('this is undefined for every listener position (%i listeners, emit, once, emitAsync)', async (n) => {
      const e = new CozyEvent();
      const thisValues: unknown[] = [];
      function rec(this: unknown) {
        thisValues.push(this);
      }
      for (let i = 0; i < n; i++) (i % 2 ? e.once : e.on).call(e, 'x', rec);
      e.emit('x');
      for (let i = 0; i < n; i++) e.on('y', rec);
      e.emitAsync('y');
      await Promise.resolve();
      expect(thisValues.length).toBe(2 * n);
      expect(thisValues.every((t) => t === undefined)).toBe(true);
    });

    test('subclass overriding on/once/off/emit/emitAsync/removeAllListeners keeps once and unsubscribe correct', () => {
      const calls: string[] = [];
      class Bus extends CozyEvent<{ x: number }> {
        constructor() {
          super();
        }
        on(ev: 'x', l: (p: number) => void) {
          calls.push('on');
          return super.on(ev, l);
        }
        once(ev: 'x', l: (p: number) => void) {
          calls.push('once');
          return super.once(ev, l);
        }
        off() {
          calls.push('off'); // deliberately does NOT remove anything
        }
        emit(ev: 'x', p?: number) {
          calls.push('emit');
          super.emit(ev, p);
        }
        emitAsync() {
          calls.push('emitAsync');
        }
        removeAllListeners() {
          calls.push('rm');
        }
        _other() {
          return 1;
        }
      }
      const b = new Bus();
      const f = jest.fn();
      const g = jest.fn();
      const uf = b.on('x', f);
      for (let i = 0; i < 11; i++) b.once('x', g);
      b.emit('x', 1);
      b.emit('x', 2);
      expect(g).toHaveBeenCalledTimes(11);
      expect(f).toHaveBeenCalledTimes(2);
      uf();
      uf();
      b.emit('x', 3);
      expect(f).toHaveBeenCalledTimes(2);
      b.emit('x', 4);
      expect(f).toHaveBeenCalledTimes(2);
      expect(g).toHaveBeenCalledTimes(11);
      expect(calls.filter((c) => c === 'off')).toEqual([]);
      expect(b._other()).toBe(1);
    });

    test('subclass with its own fields and constructor', () => {
      class Store extends CozyEvent<{ change: number }> {
        value = 0;
        set(v: number) {
          this.value = v;
          this.emit('change', v);
        }
      }
      const s = new Store();
      const seen: number[] = [];
      const u = s.on('change', (v) => seen.push(v));
      s.set(1);
      u();
      s.set(2);
      expect(seen).toEqual([1]);
      expect(s.value).toBe(2);
    });
  });

  describe('once / off / unsubscribe interplay while a once listener is running', () => {
    test('off(fn) inside a running once(fn) removes the other registration, not a no-op', () => {
      const e = new CozyEvent();
      const log: string[] = [];
      let armed = true;
      const f = (p: string) => {
        log.push(p);
        if (armed) {
          armed = false;
          e.off('x', f); // the running once is already removed, so this removes on(f)
        }
      };
      e.once('x', f); // index 0
      e.on('x', f); // index 1
      const g = jest.fn();
      e.on('x', g);
      e.emit('x', 'a'); // on(f) was removed during the emit but still runs from the snapshot
      expect(log).toEqual(['a', 'a']);
      e.emit('x', 'b');
      expect(log).toEqual(['a', 'a']);
      expect(g).toHaveBeenCalledTimes(2);
      e.emit('x', 'c');
      expect(log).toEqual(['a', 'a']);
      expect(g).toHaveBeenCalledTimes(3);
    });

    test('a running once listener unsubscribing itself does not remove another registration of the same fn', () => {
      const e = new CozyEvent();
      const seen: number[] = [];
      let u: () => void = () => {};
      const f = (p: number) => {
        seen.push(p);
        u();
        u();
      };
      e.on('x', f);
      u = e.once('x', f);
      e.emit('x', 1);
      e.emit('x', 2);
      expect(seen).toEqual([1, 1, 2]);
      e.emit('x', 3);
      expect(seen).toEqual([1, 1, 2, 3]);
    });

    test('once listener re-registering itself with once runs once per emit, never twice in one emit', () => {
      const e = new CozyEvent();
      let n = 0;
      const f = () => {
        n++;
        e.once('x', f);
        e.emit('y'); // unrelated nested emit
      };
      e.once('x', f);
      for (let i = 1; i <= 12; i++) {
        e.emit('x');
        expect(n).toBe(i); // one registration per emit: two would make n jump by 2
      }
    });

    test('once listener off-ing itself by function after running leaves other once(fn) registrations alone', () => {
      const e = new CozyEvent();
      const seen: number[] = [];
      const f = (p: number) => {
        seen.push(p);
        e.off('x', f); // removes the most recent still-registered f (a later once), since this one is gone
      };
      for (let i = 0; i < 3; i++) e.once('x', f);
      e.emit('x', 1); // first runs, removes 3rd; 2nd and 3rd still run from snapshot (3rd once guard: r.l still set)
      expect(seen).toEqual([1, 1, 1]);
      e.emit('x', 2);
      expect(seen).toEqual([1, 1, 1]);
    });

    test('mixed on/once of the same fn inside emitAsync: off and new registrations between call and microtask', async () => {
      const e = new CozyEvent();
      const seen: string[] = [];
      const f = (p: string) => seen.push(p);
      e.once('x', f);
      e.on('x', f);
      e.once('x', f);
      e.emitAsync('x', 'a');
      e.off('x', f); // removes once2, the most recent (it still runs once in 'a')
      e.once('x', f); // not in 'a'
      e.emitAsync('x', 'b'); // [once0, on1, once3]; once0 runs in 'a' first, so skipped in 'b'
      e.emit('x', 's'); // sync: once0, on1, once3 run now
      expect(seen).toEqual(['s', 's', 's']);
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      // 'a': once0 already ran (skipped), on1, once2 (removed by off after the snapshot, not yet run: S6 runs it once)
      // 'b': once0 skipped, on1, once3 already ran in 's' (skipped)
      expect(seen).toEqual(['s', 's', 's', 'a', 'a', 'b']);
      e.emit('x', 'z');
      e.emit('x', 'z');
      expect(seen).toEqual(['s', 's', 's', 'a', 'a', 'b', 'z', 'z']); // only on1 is left
    });

    test('listener calling removeAllListeners then on inside emitAsync microtask', async () => {
      const e = new CozyEvent();
      const seen: string[] = [];
      e.on('x', (p) => {
        seen.push(`1${p}`);
        e.removeAllListeners();
        e.on('x', (q) => seen.push(`n${q}`));
      });
      e.on('x', (p) => seen.push(`2${p}`));
      e.emitAsync('x', 'a');
      e.emitAsync('x', 'b');
      await new Promise((r) => setImmediate(r));
      // 'b' snapshot was taken before anything ran: both old listeners run again in 'b'
      expect(seen).toEqual(['1a', '2a', '1b', '2b']);
      e.emit('x', 'c');
      expect(seen).toEqual(['1a', '2a', '1b', '2b', 'nc']);
    });
  });

  describe('snapshot invariants on arrays shared with in-progress emits', () => {
    test('push onto the current array during an emit, then removal of an earlier record, then nested emit', () => {
      for (const n of SIZES) {
        const e = new CozyEvent();
        const log: string[] = [];
        const offs: (() => void)[] = [];
        let step = 0;
        for (let i = 0; i < n; i++)
          offs.push(
            e.on('x', (p) => {
              log.push(`${p}${i}`);
              if (p === 'o' && i === n - 1 && step++ === 0) {
                e.on('x', (q) => log.push(`${q}+`)); // push onto the array the outer emit holds
                offs[0](); // copy-on-remove
                e.emit('x', 'i'); // sees 1..n-1 and '+'
              }
            }),
          );
        e.emit('x', 'o');
        const outer = Array.from({ length: n }, (_, i) => `o${i}`);
        const inner = [...Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0).map((i) => `i${i}`), 'i+'];
        expect(log).toEqual([...outer, ...inner]);
        log.length = 0;
        e.emit('x', 'p');
        expect(log).toEqual([...Array.from({ length: n - 1 }, (_, i) => `p${i + 1}`), 'p+']);
      }
    });

    test('many events on one instance stay independent through all transitions', () => {
      const e = new CozyEvent();
      const log: string[] = [];
      const names = ['a', 'b', '__proto__', 'constructor', ''];
      const us = names.map((nm) => Array.from({ length: 11 }, (_, i) => e.on(nm, (p) => log.push(`${nm}${i}${p}`))));
      us[2].forEach((u) => u());
      e.removeAllListeners('');
      for (const nm of names) e.emit(nm, 1);
      expect(log).toEqual([
        ...Array.from({ length: 11 }, (_, i) => `a${i}1`),
        ...Array.from({ length: 11 }, (_, i) => `b${i}1`),
        ...Array.from({ length: 11 }, (_, i) => `constructor${i}1`),
      ]);
      log.length = 0;
      for (const nm of ['__proto__', '']) e.emit(nm, 2);
      expect(log).toEqual([]);
    });

    test('extra arguments are dropped at every call-site position', () => {
      for (const n of SIZES) {
        const e = new CozyEvent();
        const lens: number[] = [];
        for (let i = 0; i < n; i++)
          (i % 3 ? e.on : e.once).call(e, 'x', function (...args: unknown[]) {
            lens.push(args.length);
          });
        (e.emit as (...a: unknown[]) => void)('x', 1, 2, 3);
        expect(lens.length).toBe(n);
        expect(lens.every((l) => l === 1)).toBe(true);
      }
    });
  });

  describe('differential mini-model with long lists (exercises the loop path)', () => {
    function rng(seed: number) {
      return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
    }
    test('2000 random sequences over lists up to ~40 listeners', () => {
      for (let s = 1; s <= 2000; s++) {
        const r = rng(s);
        const e = new CozyEvent();
        type Rec = { fn: number; once: boolean; ran: boolean };
        let model: Rec[] = [];
        const realLog: number[] = [];
        const modelLog: number[] = [];
        const fns = Array.from({ length: 6 }, (_, i) => (p: number) => realLog.push(i * 100000 + p));
        const handles: [() => void, Rec][] = [];
        const emitBoth = (k: number) => {
          e.emit('x', k);
          const snap = model;
          for (const m of snap) {
            if (m.once) {
              if (m.ran) continue;
              m.ran = true;
              model = model.filter((z) => z !== m);
            }
            modelLog.push(m.fn * 100000 + k);
          }
        };
        const steps = 60 + Math.floor(r() * 60);
        for (let k = 0; k < steps; k++) {
          const x = r();
          const fn = Math.floor(r() * 6);
          if (x < 0.45) {
            const once = r() < 0.3;
            const rec = { fn, once, ran: false };
            model = [...model, rec];
            handles.push([once ? e.once('x', fns[fn]) : e.on('x', fns[fn]), rec]);
          } else if (x < 0.6) {
            e.off('x', fns[fn]);
            for (let i = model.length - 1; i >= 0; i--)
              if (model[i].fn === fn) {
                model = model.filter((_, j) => j !== i);
                break;
              }
          } else if (x < 0.75 && handles.length) {
            const [u, rec] = handles[Math.floor(r() * handles.length)];
            u();
            model = model.filter((m) => m !== rec);
          } else if (x < 0.77) {
            e.removeAllListeners(r() < 0.5 ? 'x' : undefined);
            model = [];
          } else emitBoth(k);
          if (realLog.join() !== modelLog.join())
            throw new Error(`seed ${s} diverged at step ${k}: ${realLog} vs ${modelLog}`);
        }
        // final behavioural probe of the whole list: every registration, then the survivors
        emitBoth(steps);
        emitBoth(steps + 1);
        if (realLog.join() !== modelLog.join()) throw new Error(`seed ${s} diverged in the final probe`);
      }
    });
  });

  describe('paired loop tail (listeners 11+ called two at a time) and once bookkeeping, 1..130', () => {
    /** Reference model: registration list with snapshot emit semantics. */
    type M = { id: number; fn: (p: number) => void; once: boolean; ran: boolean };

    test('every size 1..130: order, count, payload, with odd and even tails', () => {
      for (let n = 1; n <= 130; n++) {
        const e = new CozyEvent();
        const log: number[] = [];
        for (let i = 0; i < n; i++) e.on('x', (p) => log.push(i * 1000 + p));
        e.emit('x', 7);
        expect(log).toEqual(Array.from({ length: n }, (_, i) => i * 1000 + 7));
      }
    });

    test('every size 1..130 grown and shrunk one at a time around every threshold, emitting each step', () => {
      const e = new CozyEvent();
      const log: number[] = [];
      const offs: (() => void)[] = [];
      const live: number[] = [];
      const check = (p: number) => {
        log.length = 0;
        e.emit('x', p);
        expect(log).toEqual(live.map((i) => i * 1000 + p));
      };
      for (let i = 0; i < 130; i++) {
        offs.push(e.on('x', (p) => log.push(i * 1000 + p)));
        live.push(i);
        check(i);
      }
      // shrink alternately from the front and the back, crossing 130 -> 0
      for (let k = 0; k < 130; k++) {
        const idx = k % 2 ? live.shift()! : live.pop()!;
        offs[idx]();
        offs[idx](); // idempotent
        check(k);
      }
      check(-1); // nothing left
    });

    test('once mixed with on in registration order at every position (odd and even pair slots)', () => {
      for (const n of [10, 11, 12, 13, 14, 21, 22, 100, 101]) {
        const e = new CozyEvent();
        const log: string[] = [];
        for (let i = 0; i < n; i++)
          i % 3 === 1 ? e.once('x', (p) => log.push(`o${i}:${p}`)) : e.on('x', (p) => log.push(`n${i}:${p}`));
        e.emit('x', 1);
        expect(log).toEqual(Array.from({ length: n }, (_, i) => `${i % 3 === 1 ? 'o' : 'n'}${i}:1`));
        log.length = 0;
        e.emit('x', 2);
        const ons = Array.from({ length: n }, (_, i) => i).filter((i) => i % 3 !== 1);
        expect(log).toEqual(ons.map((i) => `n${i}:2`));
      }
    });

    test('same function registered as once many times (130): one call per emit, off(original) removes the latest', () => {
      const e = new CozyEvent();
      const f = jest.fn();
      for (let i = 0; i < 130; i++) e.once('x', f);
      e.off('x', f); // removes the most recent once
      e.emit('x', 1);
      // all 129 once registrations run in that emit (each is its own registration)
      expect(f).toHaveBeenCalledTimes(129);
      e.emit('x', 2);
      expect(f).toHaveBeenCalledTimes(129);
    });

    test('once inside once (and on inside once) across the loop tail', () => {
      const e = new CozyEvent();
      const log: string[] = [];
      let hits = 0;
      for (let i = 0; i < 15; i++) e.on('x', () => hits++);
      e.once('x', (p) => {
        log.push(`outer${p}`);
        e.once('x', (q) => {
          log.push(`inner${q}`);
          e.once('x', (r) => log.push(`innermost${r}`));
        });
      });
      e.emit('x', 1);
      expect(log).toEqual(['outer1']);
      e.emit('x', 2);
      expect(log).toEqual(['outer1', 'inner2']);
      e.emit('x', 3);
      e.emit('x', 4);
      expect(log).toEqual(['outer1', 'inner2', 'innermost3']);
      hits = 0;
      e.emit('x', 5);
      expect(hits).toBe(15);
      expect(log).toEqual(['outer1', 'inner2', 'innermost3']);
    });

    test('unsubscribe / off(original) of once before, during and after emit (loop tail positions)', () => {
      for (const pos of [0, 9, 10, 11, 12, 13, 40, 41]) {
        for (const how of ['unsub', 'off'] as const) {
          // before
          {
            const e = new CozyEvent();
            const f = jest.fn();
            const fill = Array.from({ length: 45 }, () => jest.fn());
            let u: () => void = () => {};
            for (let i = 0; i < 45; i++) i === pos ? (u = e.once('x', f)) : e.on('x', fill[i]);
            how === 'unsub' ? u() : e.off('x', f);
            e.emit('x');
            expect(f).not.toHaveBeenCalled();
            u();
            const fills = mockCalls(...fill);
            const before = fills();
            e.emit('x');
            expect(fills() - before).toBe(44);
            expect(f).not.toHaveBeenCalled();
          }
          // during: removed by an earlier listener in the same emit -> still runs (snapshot), once
          {
            const e = new CozyEvent();
            const f = jest.fn();
            let u: () => void = () => {};
            const earlier = pos === 0 ? -1 : pos - 1;
            let hits = 0;
            for (let i = 0; i < 45; i++)
              i === pos
                ? (u = e.once('x', f))
                : e.on('x', () => {
                    hits++;
                    if (i === earlier) how === 'unsub' ? u() : e.off('x', f);
                  });
            e.emit('x');
            e.emit('x');
            expect(f).toHaveBeenCalledTimes(1); // pos 0: nothing removes it earlier, it just runs once
            hits = 0;
            e.emit('x');
            expect(hits).toBe(44);
            expect(f).toHaveBeenCalledTimes(1);
          }
          // after: unsubscribe/off after it ran does not remove anything else
          {
            const e = new CozyEvent();
            const f = jest.fn();
            let u: () => void = () => {};
            let hits = 0;
            for (let i = 0; i < 45; i++) i === pos ? (u = e.once('x', f)) : e.on('x', () => hits++);
            e.on('x', f); // a later on(f) registration
            e.emit('x');
            expect(f).toHaveBeenCalledTimes(2);
            u();
            hits = 0;
            e.emit('x');
            expect(f).toHaveBeenCalledTimes(3);
            expect(hits).toBe(44);
          }
        }
      }
    });

    test('re-entrant emits while once records are pending removal in outer snapshots', () => {
      for (const n of [11, 12, 30, 31]) {
        const e = new CozyEvent();
        const counts = new Array(n).fill(0);
        let depth = 0;
        for (let i = 0; i < n; i++) {
          const fn = () => {
            counts[i]++;
            if (depth < 3) {
              depth++;
              e.emit('x');
              depth--;
            }
          };
          i % 2 ? e.once('x', fn) : e.on('x', () => counts[i]++);
        }
        e.emit('x');
        for (let i = 1; i < n; i += 2) expect(counts[i]).toBe(1);
        const before = [...counts];
        e.emit('x');
        expect(counts.map((c, i) => c - before[i])).toEqual(Array.from({ length: n }, (_, i) => (i % 2 ? 0 : 1)));
      }
    });

    test('emitAsync snapshots containing once records at every size 1..130 run each once exactly once', async () => {
      const e = new CozyEvent();
      const counts: number[] = [];
      const log: number[] = [];
      for (let n = 1; n <= 130; n++) {
        e.removeAllListeners('x');
        for (let i = 0; i < n; i++) {
          if (i % 2) {
            const k = counts.push(0) - 1;
            e.once('x', () => counts[k]++);
          } else e.on('x', (p: number) => log.push(p));
        }
        e.emitAsync('x', n);
        e.emitAsync('x', -n);
      }
      expect(counts.every((c) => c === 0)).toBe(true);
      await new Promise((r) => setImmediate(r));
      expect(counts.every((c) => c === 1)).toBe(true);
      const expected: number[] = [];
      for (let n = 1; n <= 130; n++) {
        const ons = Math.ceil(n / 2);
        for (let j = 0; j < ons; j++) expected.push(n);
        for (let j = 0; j < ons; j++) expected.push(-n);
      }
      expect(log).toEqual(expected);
    });

    test('removeAllListeners during emit at every pair slot: snapshot completes, storage empty', () => {
      for (const at of [9, 10, 11, 12, 13, 98, 99]) {
        for (const all of [false, true]) {
          const e = new CozyEvent();
          const log: number[] = [];
          const onceRan = jest.fn();
          for (let i = 0; i < 100; i++)
            i === at + 1
              ? e.once('x', onceRan)
              : e.on('x', () => {
                  log.push(i);
                  if (i === at) all ? e.removeAllListeners() : e.removeAllListeners('x');
                });
          e.emit('x');
          expect(log).toEqual(Array.from({ length: 100 }, (_, i) => i).filter((i) => i !== at + 1));
          expect(onceRan).toHaveBeenCalledTimes(at + 1 < 100 ? 1 : 0);
          e.emit('x');
          expect(log.length).toBe(at + 1 < 100 ? 99 : 100);
          expect(onceRan).toHaveBeenCalledTimes(at + 1 < 100 ? 1 : 0);
        }
      }
    });

    test('throw in either slot of a pair stops the rest; nothing after it runs', () => {
      for (const t of [10, 11, 12, 13, 128, 129]) {
        const e = new CozyEvent();
        const log: number[] = [];
        for (let i = 0; i < 130; i++)
          e.on('x', () => {
            log.push(i);
            if (i === t) throw new Error('boom');
          });
        expect(() => e.emit('x')).toThrow('boom');
        expect(log).toEqual(Array.from({ length: t + 1 }, (_, i) => i));
      }
    });

    test('this is undefined for listeners in both pair slots and the odd tail', () => {
      for (const n of [11, 12, 13]) {
        const e = new CozyEvent();
        const thisVals: unknown[] = [];
        for (let i = 0; i < n; i++)
          e.on('x', function (this: unknown) {
            thisVals.push(this);
          });
        e.once('x', function (this: unknown) {
          thisVals.push(this);
        });
        e.emit('x');
        expect(thisVals.length).toBe(n + 1);
        expect(thisVals.every((v) => v === undefined)).toBe(true);
      }
    });

    test('randomized model check with once/on/off/unsubscribe/emit for sizes up to 130', () => {
      let seed = 12345;
      const rnd = (m: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % m);
      for (let s = 0; s < 40; s++) {
        const e = new CozyEvent();
        let model: M[] = [];
        const realLog: number[] = [];
        const modelLog: number[] = [];
        const fns: ((p: number) => void)[] = Array.from({ length: 6 }, (_, j) => (p: number) => {
          realLog.push(j * 100000 + p);
        });
        const unsubs: { u: () => void; m: M }[] = [];
        const emitBoth = (k: number) => {
          e.emit('x', k);
          const snap = model;
          for (const m of snap) {
            if (m.once) {
              if (m.ran) continue;
              m.ran = true;
              model = model.filter((z) => z !== m);
            }
            modelLog.push(fns.indexOf(m.fn) * 100000 + k);
          }
        };
        let id = 0;
        for (let k = 0; k < 600; k++) {
          const op = rnd(10);
          const j = rnd(6);
          if (op < 4 || model.length < 8) {
            const once = rnd(3) === 0;
            const m: M = { id: id++, fn: fns[j], once, ran: false };
            const u = once ? e.once('x', fns[j]) : e.on('x', fns[j]);
            model.push(m);
            unsubs.push({ u, m });
            if (model.length > 130) {
              const r = unsubs[rnd(unsubs.length)];
              r.u();
              model = model.filter((z) => z !== r.m);
            }
          } else if (op === 4) {
            e.off('x', fns[j]);
            for (let q = model.length; q--; )
              if (model[q].fn === fns[j]) {
                model.splice(q, 1);
                break;
              }
          } else if (op === 5 && unsubs.length) {
            const r = unsubs[rnd(unsubs.length)];
            r.u();
            model = model.filter((z) => z !== r.m);
          } else emitBoth(k);
          if (realLog.join() !== modelLog.join()) throw new Error(`seed ${s} diverged at step ${k}`);
        }
        emitBoth(600);
        emitBoth(601);
        if (realLog.join() !== modelLog.join()) throw new Error(`seed ${s} diverged in the final probe`);
      }
    });
  });

  describe('delayed cleanup: emptied events across several names (behaviour only)', () => {
    const NAMES = ['a', 'b', 'c', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'undefined', 'null', ''];

    test('an emptied event takes new on/once listeners again, in order, for every way of emptying it', () => {
      for (const ev of NAMES)
        for (const how of ['off', 'unsub', 'once', 'removeAll'] as const) {
          const e = new CozyEvent();
          const log: string[] = [];
          const f = (p: unknown) => log.push(`f${p}`);
          const u = how === 'once' ? e.once(ev, f) : e.on(ev, f);
          if (how === 'off') e.off(ev, f);
          else if (how === 'unsub') u();
          else if (how === 'once') e.emit(ev, 0);
          else e.removeAllListeners(ev);
          log.length = 0;
          e.emit(ev, 1); // emitted while empty: nothing runs
          expect(log).toEqual([]);
          e.once(ev, (p) => log.push(`o${p}`));
          e.on(ev, (p) => log.push(`n${p}`));
          e.once(ev, (p) => log.push(`q${p}`));
          e.emit(ev, 2);
          e.emit(ev, 3);
          expect(log).toEqual(['o2', 'n2', 'q2', 'n3']);
          u(); // stale token: must not remove anything new
          e.off(ev, f); // unknown listener now
          log.length = 0;
          e.emit(ev, 4);
          expect(log).toEqual(['n4']);
        }
    });

    test('emptying one event never drops another event that was emptied before and refilled', () => {
      // Every ordered pair (first, second) of names; also a third event that stays live throughout.
      for (const first of NAMES)
        for (const second of NAMES) {
          if (first === second) continue;
          const e = new CozyEvent();
          const log: string[] = [];
          e.on('live', (p) => log.push(`live${p}`));
          const f1 = (p: unknown) => log.push(`first${p}`);
          const f2 = (p: unknown) => log.push(`second${p}`);
          e.on(first, f1);
          e.off(first, f1); // first is emptied (may be retained)
          e.on(first, f1); // refilled
          e.once(second, f2);
          e.emit(second, 1); // second emptied by a firing once
          e.emit(first, 2); // first must still be live
          e.off(first, f1); // empties first again
          e.on(second, f2);
          e.emit(second, 3);
          e.emit(first, 4); // nothing
          e.emit('live', 5);
          expect(log).toEqual(['second1', 'first2', 'second3', 'live5']);
        }
    });

    test('churn of many distinct names keeps every live event intact (including prototype-like names)', () => {
      const e = new CozyEvent();
      const counts: Record<string, number> = Object.create(null);
      const liveNames = NAMES.slice();
      for (const n of liveNames) e.on(n, () => (counts[n] = (counts[n] ?? 0) + 1));
      let churned = 0;
      for (let i = 0; i < 5000; i++) {
        const name = `ev${i}`;
        const g = () => churned++;
        const k = i % 4;
        if (k === 0) e.off(name, (e.on(name, g), g));
        else if (k === 1) e.on(name, g)();
        else if (k === 2) (e.once(name, g), e.emit(name));
        else e.once(name, g)();
        // occasionally empty and refill one of the live names too
        if (i % 97 === 0) {
          const n = liveNames[i % liveNames.length];
          e.removeAllListeners(n);
          e.on(n, () => (counts[n] = (counts[n] ?? 0) + 1));
        }
      }
      expect(churned).toBe(1250);
      for (const n of liveNames) e.emit(n);
      for (const n of liveNames) expect([n, counts[n]]).toEqual([n, 1]);
      // every churned name is really empty
      let stray = 0;
      for (let i = 0; i < 5000; i++) {
        const before = churned;
        e.emit(`ev${i}`);
        stray += churned - before;
      }
      expect(stray).toBe(0);
    });

    test('emptying (by once, off or unsubscribe) inside emit and emitAsync of other events keeps snapshots intact', async () => {
      const e = new CozyEvent();
      const log: string[] = [];
      const gB = (p: unknown) => log.push(`b${p}`);
      const uC = e.on('c', (p) => log.push(`c${p}`));
      e.on('b', gB);
      e.once('a', (p) => {
        log.push(`a${p}`);
        e.off('b', gB); // empties b while a is emitting
        e.emit('b', 'x'); // nothing
        uC(); // empties c
        e.on('b', gB); // refills b
      });
      e.on('a', (p) => log.push(`a2${p}`));
      e.emitAsync('c', 'async'); // snapshot of c taken before it is emptied
      e.emit('a', 1);
      e.emit('b', 2);
      e.emit('c', 3);
      e.emit('a', 4);
      expect(log).toEqual(['a1', 'a21', 'b2', 'a24']);
      await tick();
      expect(log).toEqual(['a1', 'a21', 'b2', 'a24', 'casync']);
    });

    test('removeAllListeners() after events were emptied, then refill and empty again', () => {
      for (const ev of NAMES) {
        const e = new CozyEvent();
        const log: string[] = [];
        const f = (p: unknown) => log.push(`${ev}:${p}`);
        e.on(ev, f);
        const u = e.on('other', (p) => log.push(`other:${p}`));
        e.off(ev, f); // ev emptied (retained)
        e.removeAllListeners(); // everything gone, including the retained entry
        e.emit(ev, 0);
        e.emit('other', 0);
        e.on(ev, f); // same name in fresh storage
        u(); // stale token from before removeAllListeners: no-op
        e.on('other', (p) => log.push(`other:${p}`));
        e.once('third', () => log.push('third'));
        e.emit('third'); // empties 'third': must not drop the refilled ev
        e.emit(ev, 1);
        e.emit('other', 1);
        e.off(ev, f);
        e.emit(ev, 2);
        e.removeAllListeners('other');
        e.emit('other', 2);
        expect(log).toEqual(['third', `${ev}:1`, 'other:1']);
      }
    });

    test('a subclass overriding off (and on) still gets correct once firing and unsubscribe with churn', () => {
      const calls: string[] = [];
      class Sub extends CozyEvent {
        off(event: string, listener: (p: any) => void): void {
          calls.push(`off:${event}`);
          super.off(event, listener);
        }
        on(event: string, listener: (p: any) => void): () => void {
          calls.push(`on:${event}`);
          return super.on(event, listener);
        }
      }
      const e = new Sub();
      const log: string[] = [];
      for (const ev of NAMES) {
        e.once(ev, (p) => log.push(`${ev}:${p}`));
        e.emit(ev, 1);
        e.emit(ev, 2);
        const u = e.on(ev, (p) => log.push(`${ev}+${p}`));
        u();
        u();
        e.emit(ev, 3);
      }
      expect(log).toEqual(NAMES.map((ev) => `${ev}:1`));
      expect(calls).toEqual(NAMES.map((ev) => `on:${ev}`));
    });

    test('unsubscribe tokens are per event: same function on many events, removing one leaves the others', () => {
      const e = new CozyEvent();
      const log: string[] = [];
      const f = (p: unknown) => log.push(String(p));
      const us = NAMES.map((ev) => e.on(ev, f));
      NAMES.forEach((ev, i) => {
        if (i % 2) us[i]();
      });
      NAMES.forEach((ev, i) => e.emit(ev, i));
      expect(log).toEqual(NAMES.map((_, i) => i).filter((i) => i % 2 === 0).map(String));
      // remove the rest via off, one at a time, checking the remaining ones each time
      NAMES.forEach((ev, i) => {
        if (i % 2 === 0) e.off(ev, f);
      });
      log.length = 0;
      NAMES.forEach((ev, i) => e.emit(ev, i));
      expect(log).toEqual([]);
    });

    test('multi-event randomized model (names incl. prototype-like, removeAllListeners, 0..40 listeners)', () => {
      type R = { tag: number; once: boolean; ran: boolean; fn: (p: number) => void };
      let seed = 987654;
      const rnd = (m: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % m);
      for (let s = 0; s < 30; s++) {
        const e = new CozyEvent();
        const model: Record<string, R[]> = Object.create(null);
        const real: string[] = [];
        const want: string[] = [];
        const fns = Array.from({ length: 4 }, (_, j) => (p: number) => real.push(`${j}:${p}`));
        const tokens: { ev: string; r: R; u: () => void }[] = [];
        const list = (ev: string) => (model[ev] ??= []);
        for (let k = 0; k < 1500; k++) {
          const ev = NAMES[rnd(NAMES.length)];
          const op = rnd(12);
          const j = rnd(4);
          if (op < 4 && list(ev).length < 40) {
            const once = rnd(2) === 0;
            const r: R = { tag: j, once, ran: false, fn: fns[j] };
            tokens.push({ ev, r, u: once ? e.once(ev, fns[j]) : e.on(ev, fns[j]) });
            list(ev).push(r);
          } else if (op < 6) {
            e.off(ev, fns[j]);
            const l = list(ev);
            for (let q = l.length; q--; )
              if (l[q].fn === fns[j]) {
                l.splice(q, 1);
                break;
              }
          } else if (op < 8 && tokens.length) {
            const t = tokens[rnd(tokens.length)];
            t.u();
            const l = list(t.ev);
            const q = l.indexOf(t.r);
            if (q >= 0) l.splice(q, 1);
          } else if (op === 8 && rnd(8) === 0) {
            if (rnd(2)) {
              e.removeAllListeners();
              for (const key of Object.keys(model)) model[key] = [];
            } else {
              e.removeAllListeners(ev);
              model[ev] = [];
            }
          } else {
            e.emit(ev, k);
            for (const r of list(ev).slice()) {
              if (r.once) {
                if (r.ran) continue;
                r.ran = true;
                const l = list(ev);
                l.splice(l.indexOf(r), 1);
              }
              want.push(`${r.tag}:${k}`);
            }
          }
          if (real.join() !== want.join()) throw new Error(`seed ${s} diverged at step ${k} (${ev})`);
        }
      }
    });
  });
});
