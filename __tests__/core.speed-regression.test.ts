/**
 * Regression tests for the speed-oriented core design (append-only record arrays with
 * copy-on-remove, `(array, length)` snapshots, ten unrolled call sites + loop, bound unsubscribe).
 * Every test runs against the TypeScript source and, when it has been built, against the
 * minified dist/index.cjs, so minifier rewrites (e.g. dropping `(0, fn)(p)`) are caught too.
 * @jest-environment node
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { CozyEvent as SrcCozyEvent } from '../src/index';

const distFile = join(__dirname, '..', 'dist', 'index.cjs');
const impls: [string, typeof SrcCozyEvent][] = [['src', SrcCozyEvent]];
// eslint-disable-next-line @typescript-eslint/no-var-requires
if (existsSync(distFile)) impls.push(['dist', require(distFile).CozyEvent]);

const keys = (e: object) =>
  Object.keys((e as any)._e)
    .map((k) => `${k}:${(e as any)._e[k].length}`)
    .sort();

/** Sizes that cross every call-site boundary of the unrolled emit (1..10) and the loop (11+). */
const SIZES = [1, 2, 3, 9, 10, 11, 12, 20, 101];

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
      expect(keys(e)).toEqual([]);
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
        expect(keys(e)).toEqual(live.length ? [`x:${live.length}`] : []);
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
        expect(log).toEqual([-1]);
        expect(keys(e)).toEqual(['x:1']);
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
      expect(keys(e)).toEqual(['x:13']);
    });
  });

  describe('same function registered many times, mixed on/once/unsubscribe/off', () => {
    test('each unsubscribe removes exactly its own registration and is idempotent', () => {
      const e = new CozyEvent();
      const seen: string[] = [];
      const f = (p: string) => seen.push(p);
      const u: (() => void)[] = [];
      for (let i = 0; i < 24; i++) u.push(i % 3 === 2 ? e.once('x', f) : e.on('x', f));
      expect(keys(e)).toEqual(['x:24']);
      // unsubscribe a few, twice each
      for (const i of [0, 5, 11, 12, 23]) {
        u[i]();
        u[i]();
      }
      expect(keys(e)).toEqual(['x:19']);
      e.emit('x', 'a');
      expect(seen.length).toBe(19);
      // once registrations 2,8,14,17,20 ran and are gone (5 and 11 and 23 were unsubscribed)
      expect(keys(e)).toEqual(['x:14']);
      // unsubscribing a once that already ran is a no-op
      for (const i of [2, 8, 14, 17, 20]) u[i]();
      expect(keys(e)).toEqual(['x:14']);
      // off removes the most recent remaining registration, one at a time
      for (let k = 14; k > 0; k--) {
        e.off('x', f);
        expect(keys(e)).toEqual(k > 1 ? [`x:${k - 1}`] : []);
      }
      // every old unsubscribe is now a no-op, even after re-adding the same function
      e.on('x', f);
      u.forEach((x) => x());
      expect(keys(e)).toEqual(['x:1']);
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
        expect(keys(e)).toEqual([]);
      }
    });

    test('bound unsubscribe ignores extra arguments and a foreign this', () => {
      const e = new CozyEvent();
      const f = jest.fn();
      const g = jest.fn();
      e.on('x', g);
      const u = e.on('x', f) as (...a: unknown[]) => void;
      u.call({ _e: {} }, g, 'x', 1);
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
      expect(keys(e)).toEqual([]);
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
      for (let i = 0; i < 10; i++) e.on('x', () => {});
      e.once('x', f);
      expect(() => e.emit('x')).toThrow('x');
      e.emit('x');
      expect(f).toHaveBeenCalledTimes(1);
      expect(keys(e)).toEqual(['x:10']);
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
        expect(keys(e)).toEqual([]);
        e.on(name, f);
        e.removeAllListeners(name);
        expect(keys(e)).toEqual([]);
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
      expect(Object.getPrototypeOf((a as any)._e)).toBe(Object.getPrototypeOf((b as any)._e));
      expect(Object.keys(Object.getPrototypeOf((a as any)._e))).toEqual([]);
      a.removeAllListeners();
      expect(Object.getPrototypeOf((a as any)._e)).toBe(Object.getPrototypeOf((b as any)._e));
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
      expect(keys(b)).toEqual([]);
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
      expect(keys(e)).toEqual(['x:1']);
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
      expect(keys(e)).toEqual(['x:1']);
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
        expect(n).toBe(i);
        expect(keys(e)).toEqual(['x:1']);
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
      expect(keys(e)).toEqual([]);
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
      expect(keys(e)).toEqual(['x:1']);
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
        expect(keys(e)).toEqual([`x:${n}`]);
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
      expect(keys(e)).toEqual(['a:11', 'b:11', 'constructor:11']);
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
          } else {
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
          }
          if (realLog.join() !== modelLog.join() || keys(e).join() !== (model.length ? `x:${model.length}` : ''))
            throw new Error(`seed ${s} diverged at step ${k}: ${realLog} vs ${modelLog}`);
        }
      }
    });
  });
});
