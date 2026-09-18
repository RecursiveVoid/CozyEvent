/**
 * Core v2 contract tests (SPEC section 1, S1-S12) plus regression tests for the v1 bugs.
 * Adversarial / re-entrancy cases live in core.adversarial.test.ts,
 * the randomized differential test in core.fuzz.test.ts, compile-time checks in core.types.test.ts.
 */
import { CozyEvent } from '../src/index';
import * as core from '../src/index';

import { tick, callsOnEmit, mockCalls, expectNoListeners } from '../test-types/behaviour';

describe('exports', () => {
  test('runtime exports are exactly CozyEvent', () => {
    expect(Object.keys(core)).toEqual(['CozyEvent']);
    expect(typeof CozyEvent).toBe('function');
  });

  test('constructor takes no arguments and instances are independent', () => {
    const a = new CozyEvent();
    const b = new CozyEvent();
    const fa = jest.fn();
    a.on('x', fa);
    b.emit('x', 1);
    expect(fa).not.toHaveBeenCalled();
    a.emit('x', 2);
    expect(fa.mock.calls).toEqual([[2]]);
  });
});

describe('basics', () => {
  let e: CozyEvent;
  beforeEach(() => {
    e = new CozyEvent();
  });

  test('on + emit delivers the payload', () => {
    const fn = jest.fn();
    e.on('a', fn);
    e.emit('a', 'Luke');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('Luke');
  });

  test('emit on a never-registered event is a silent no-op', () => {
    expect(() => e.emit('nope', 1)).not.toThrow();
    const fn = jest.fn();
    e.on('nope', fn);
    e.emit('nope', 2);
    expect(fn.mock.calls).toEqual([[2]]);
  });

  test('on returns an unsubscribe function', () => {
    const fn = jest.fn();
    const off = e.on('a', fn);
    expect(typeof off).toBe('function');
    expect(off()).toBeUndefined();
    e.emit('a');
    expect(fn).not.toHaveBeenCalled();
    // the emptied event is reusable
    e.on('a', fn);
    e.emit('a', 1);
    expect(fn.mock.calls).toEqual([[1]]);
  });

  test('off removes a listener', () => {
    const fn = jest.fn();
    e.on('a', fn);
    e.off('a', fn);
    e.emit('a');
    expect(fn).not.toHaveBeenCalled();
  });

  test('off with an unknown event or listener is a no-op', () => {
    const fn = jest.fn();
    e.on('a', fn);
    expect(() => e.off('unknown', fn)).not.toThrow();
    expect(() => e.off('a', () => {})).not.toThrow();
    expect(() => e.off('a', undefined as any)).not.toThrow();
    e.emit('a', 1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('once runs once', () => {
    const fn = jest.fn();
    e.once('a', fn);
    e.emit('a', 1);
    e.emit('a', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
    e.once('a', fn);
    e.emit('a', 3);
    e.emit('a', 4);
    expect(fn.mock.calls).toEqual([[1], [3]]);
  });

  test('many emits', () => {
    let total = 0;
    e.on('a', () => total++);
    for (let i = 0; i < 1_000_000; i++) e.emit('a');
    expect(total).toBe(1_000_000);
  });
});

describe('S1 event names', () => {
  const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf',
    '__defineGetter__', 'propertyIsEnumerable', 'toLocaleString', '', 'undefined', 'null', '0', 'length'];

  test.each(names)('regression: bug #1 - name %p is safe for every method', (name) => {
    const e = new CozyEvent();
    expect(() => e.emit(name, 0)).not.toThrow();
    expect(() => e.emitAsync(name, 0)).not.toThrow();
    expect(() => e.off(name, () => {})).not.toThrow();
    expect(() => e.removeAllListeners(name)).not.toThrow();
    const fn = jest.fn();
    const onceFn = jest.fn();
    const un = e.on(name, fn);
    e.once(name, onceFn);
    e.emit(name, 1);
    e.emit(name, 2);
    expect(fn.mock.calls).toEqual([[1], [2]]);
    expect(onceFn.mock.calls).toEqual([[1]]);
    expect(callsOnEmit(e, name, mockCalls(fn, onceFn), 3)).toBe(1);
    un();
    expectNoListeners(e, [name], mockCalls(fn, onceFn));
    e.on(name, fn);
    e.off(name, fn);
    expectNoListeners(e, [name], mockCalls(fn, onceFn));
    e.once(name, onceFn);
    e.emitAsync(name, 4);
    return tick().then(() => expect(onceFn.mock.calls).toEqual([[1], [4]]));
  });

  test('regression: bug #1 - exact v1 repros', () => {
    const e = new CozyEvent();
    expect(() => e.emit('toString')).not.toThrow();
    expect(() => e.on('constructor', () => {})).not.toThrow();
  });

  test('__proto__ listener does not break other prototype names or leak across instances', () => {
    const a = new CozyEvent();
    const b = new CozyEvent();
    const proto = jest.fn();
    const str = jest.fn();
    a.on('__proto__', proto);
    a.on('toString', str);
    for (const n of ['hasOwnProperty', 'valueOf', 'constructor', 'isPrototypeOf', 'x'])
      expect(() => a.emit(n, 0)).not.toThrow();
    expect(mockCalls(proto, str)()).toBe(0);
    a.emit('__proto__', 1);
    expect(proto.mock.calls).toEqual([[1]]);
    expect(str).not.toHaveBeenCalled();
    const fn = jest.fn();
    b.on('x', fn);
    b.emit('__proto__');
    b.emit('toString');
    expect(mockCalls(proto, str)()).toBe(1);
    expect(callsOnEmit(b, 'x', mockCalls(fn, proto, str))).toBe(1);
    expect(callsOnEmit(new CozyEvent(), '__proto__', mockCalls(fn, proto, str))).toBe(0);
    expect(({} as any).toString).toBe(Object.prototype.toString);
  });

  test('event names are case- and whitespace-sensitive', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('a', fn);
    e.emit('A');
    e.emit(' a');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('S2 payload', () => {
  test.each([undefined, null, 0, '', false, NaN, { a: 1 }, [1, 2]])('payload %p delivered as-is', (p) => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('a', fn);
    e.emit('a', p);
    expect(fn).toHaveBeenCalledWith(p);
    expect(fn.mock.calls[0]).toHaveLength(1);
  });

  test('omitted payload -> single undefined argument', () => {
    const e = new CozyEvent();
    let args: unknown[] = [];
    e.on('a', (...a: unknown[]) => (args = a));
    e.emit('a');
    expect(args).toEqual([undefined]);
  });

  test('objects are passed by reference', () => {
    const e = new CozyEvent();
    const obj = { n: 1 };
    e.on('a', (p) => p.n++);
    e.on('a', (p) => expect(p).toBe(obj));
    e.emit('a', obj);
    expect(obj.n).toBe(2);
  });

  test('extra arguments are dropped for emit and emitAsync', async () => {
    const e = new CozyEvent();
    const lens: number[] = [];
    e.on('a', (...a: unknown[]) => lens.push(a.length));
    (e.emit as any)('a', 1, 2, 3);
    (e.emitAsync as any)('a', 1, 2, 3);
    await tick();
    expect(lens).toEqual([1, 1]);
  });
});

describe('S3 duplicates', () => {
  test('same listener twice is called twice; off removes one', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('a', fn);
    e.on('a', fn);
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(2);
    e.off('a', fn);
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(3);
    e.off('a', fn);
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(3);
    e.off('a', fn); // nothing left: no-op
    e.on('a', fn);
    expect(callsOnEmit(e, 'a', mockCalls(fn))).toBe(1);
  });

  test('off removes the most recently added matching registration', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const fn = (p: string) => log.push(p);
    const other = () => log.push('other');
    e.on('a', fn); // on-registration (older)
    e.on('a', other);
    e.once('a', fn); // once-registration (newest)
    e.off('a', fn); // must remove the once registration
    e.emit('a', 'x');
    e.emit('a', 'y');
    expect(log).toEqual(['x', 'other', 'y', 'other']);
  });

  test('off removes the newest on-registration when it is newer than a once', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const fn = (p: string) => log.push(p);
    e.once('a', fn);
    e.on('a', fn);
    e.off('a', fn); // removes the on
    e.emit('a', 'x');
    e.emit('a', 'y');
    expect(log).toEqual(['x']);
  });
});

describe('S4 order', () => {
  test('on and once interleaved run in registration order', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    e.on('a', () => log.push('on1'));
    e.once('a', () => log.push('once1'));
    e.on('a', () => log.push('on2'));
    e.once('a', () => log.push('once2'));
    e.emit('a');
    e.emit('a');
    expect(log).toEqual(['on1', 'once1', 'on2', 'once2', 'on1', 'on2']);
  });

  test('re-adding after removal appends at the end', () => {
    const e = new CozyEvent();
    const log: number[] = [];
    const f1 = () => log.push(1);
    const f2 = () => log.push(2);
    e.on('a', f1);
    e.on('a', f2);
    e.off('a', f1);
    e.on('a', f1);
    e.emit('a');
    expect(log).toEqual([2, 1]);
  });
});

describe('S5 snapshot semantics', () => {
  test('listeners added during emit are not called in that emit', () => {
    const e = new CozyEvent();
    const late = jest.fn();
    e.on('a', () => e.on('a', late));
    e.emit('a');
    expect(late).not.toHaveBeenCalled();
    e.emit('a');
    expect(late).toHaveBeenCalledTimes(1);
  });

  test('listener removing a later listener: it still runs in the current emit only', () => {
    const e = new CozyEvent();
    const b = jest.fn();
    e.on('a', () => e.off('a', b));
    e.on('a', b);
    e.emit('a');
    expect(b).toHaveBeenCalledTimes(1);
    e.emit('a');
    expect(b).toHaveBeenCalledTimes(1);
  });

  test('listener removing itself runs this time only; others unaffected', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const self = () => {
      log.push('self');
      e.off('a', self);
    };
    e.on('a', () => log.push('first'));
    e.on('a', self);
    e.on('a', () => log.push('last'));
    e.emit('a');
    e.emit('a');
    expect(log).toEqual(['first', 'self', 'last', 'first', 'last']);
  });

  test('removeAllListeners during emit: remaining snapshot still runs, next emit none', () => {
    const e = new CozyEvent();
    const first = jest.fn(() => e.removeAllListeners());
    const b = jest.fn();
    const c = jest.fn();
    e.on('a', first);
    e.on('a', b);
    e.on('other', c);
    e.emit('a');
    expect(b).toHaveBeenCalledTimes(1);
    e.emit('a');
    e.emit('other');
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
    expectNoListeners(e, ['a', 'other'], mockCalls(first, b, c));
  });

  test('nested emit sees the state at the moment of the nested call', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const added = () => log.push('added');
    let depth = 0;
    e.on('a', (p: number) => {
      log.push(`outer${p}`);
      if (depth++ === 0) {
        e.on('a', added);
        e.emit('a', 2);
      }
    });
    e.emit('a', 1);
    expect(log).toEqual(['outer1', 'outer2', 'added']);
  });
});

describe('S6 once', () => {
  test('regression: bug #2 - once then off(original) removes it', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.once('a', fn);
    e.off('a', fn);
    e.emit('a');
    expect(fn).not.toHaveBeenCalled();
    e.once('a', fn);
    e.emit('a', 1);
    e.emit('a', 2);
    expect(fn.mock.calls).toEqual([[1]]);
  });

  test('once returns an unsubscribe that removes it', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    const un = e.once('a', fn);
    un();
    e.emit('a');
    expect(fn).not.toHaveBeenCalled();
    un();
    e.once('a', fn);
    un(); // stale: must not remove the new registration
    e.emit('a', 1);
    e.emit('a', 2);
    expect(fn.mock.calls).toEqual([[1]]);
  });

  test('once is removed before its body runs (re-entrant emit does not re-run it)', () => {
    const e = new CozyEvent();
    let calls = 0;
    e.once('a', () => {
      calls++;
      e.emit('a');
    });
    e.emit('a');
    expect(calls).toBe(1);
  });

  test('inside a running once, emit and off(fn) already see it removed', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const other = (p: string) => log.push(`other:${p}`);
    const f = (p: string) => {
      log.push(`f:${p}`);
      if (p === 'outer') {
        e.emit('a', 'nested'); // snapshot [other, on(f)]: the once is gone
        e.off('a', f); // removes on(f): the once registration is already gone
      }
    };
    e.once('a', f);
    e.on('a', other);
    e.on('a', f);
    e.emit('a', 'outer');
    expect(log).toEqual([
      'f:outer',
      'other:nested',
      'f:nested',
      'other:outer',
      'f:outer', // on(f) is still in the outer snapshot
      'other:nested',
    ]);
    log.length = 0;
    e.emit('a', 'after');
    expect(log).toEqual(['other:after']);
  });

  test('once inside once', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    e.once('a', () => {
      log.push('outer');
      e.once('a', () => log.push('inner'));
    });
    e.emit('a');
    expect(log).toEqual(['outer']);
    e.emit('a');
    e.emit('a');
    expect(log).toEqual(['outer', 'inner']);
  });

  test('throwing once is still removed', () => {
    const e = new CozyEvent();
    const fn = jest.fn(() => {
      throw new Error('boom');
    });
    e.once('a', fn);
    expect(() => e.emit('a')).toThrow('boom');
    expect(() => e.emit('a')).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    const g = jest.fn();
    e.on('a', g);
    expect(() => e.emit('a')).not.toThrow();
    expect(g).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('once removed (off) during the emit that snapshotted it still runs exactly once', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('a', () => e.off('a', fn));
    e.once('a', fn);
    e.emit('a');
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('once in two emitAsync snapshots runs once', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.once('a', fn);
    e.emitAsync('a', 1);
    e.emitAsync('a', 2);
    await tick();
    expect(fn.mock.calls).toEqual([[1]]);
    e.emit('a', 3);
    e.emitAsync('a', 4);
    await tick();
    expect(fn.mock.calls).toEqual([[1]]);
  });

  test('once in an emitAsync snapshot and a later sync emit runs once (sync first)', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.once('a', fn);
    e.emitAsync('a', 'async');
    e.emit('a', 'sync');
    await tick();
    expect(fn.mock.calls).toEqual([['sync']]);
  });

  test('once unsubscribe after it ran does not remove another registration of the same fn', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    const un = e.once('a', fn);
    e.emit('a');
    e.on('a', fn);
    un();
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('S7 unsubscribe', () => {
  test('calling unsubscribe twice is a no-op and does not remove a duplicate', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    const un1 = e.on('a', fn);
    e.on('a', fn);
    un1();
    un1();
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe removes exactly its own registration (not the newest duplicate)', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const fn = (p: string) => log.push(p);
    const un1 = e.on('a', fn);
    e.once('a', fn);
    un1(); // removes the on registration, the once must survive
    e.emit('a', 'x');
    e.emit('a', 'y');
    expect(log).toEqual(['x']);
  });

  test('stale unsubscribe after off does not remove a re-added registration', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    const un = e.on('a', fn);
    e.off('a', fn);
    e.on('a', fn);
    un();
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('stale unsubscribe after removeAllListeners (all and per-event) is a no-op', () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    const un1 = e.on('a', fn);
    e.removeAllListeners();
    const un2 = e.on('a', fn);
    e.removeAllListeners('a');
    e.on('a', fn);
    un1();
    un2();
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe of an event in another instance is unaffected', () => {
    const a = new CozyEvent();
    const b = new CozyEvent();
    const fn = jest.fn();
    const un = a.on('x', fn);
    b.on('x', fn);
    un();
    un();
    b.emit('x');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('S8 emitAsync', () => {
  test('runs listeners in a microtask, not synchronously', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('a', fn);
    e.emitAsync('a', 1);
    expect(fn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(fn).toHaveBeenCalledWith(1);
  });

  test('regression: bug #3 - off/removeAllListeners before the microtask does not throw; snapshot still runs', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('a', fn);
    e.emitAsync('a', 1);
    e.off('a', fn);
    e.on('b', fn);
    e.emitAsync('b', 2);
    e.removeAllListeners();
    await tick();
    expect(fn.mock.calls).toEqual([[1], [2]]);
    e.emitAsync('a', 3);
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('listeners added between call and microtask do not run', async () => {
    const e = new CozyEvent();
    const first = jest.fn();
    const late = jest.fn();
    e.on('a', first);
    e.emitAsync('a');
    e.on('a', late);
    await tick();
    expect(first).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });

  test('schedules no microtask when there are no listeners', () => {
    const e = new CozyEvent();
    const spy = jest.spyOn(globalThis, 'queueMicrotask');
    try {
      e.emitAsync('none');
      expect(spy).not.toHaveBeenCalled();
      e.on('a', () => {});
      e.emitAsync('a');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test('one microtask per emitAsync call, listeners in registration order', async () => {
    const e = new CozyEvent();
    const spy = jest.spyOn(globalThis, 'queueMicrotask');
    const log: number[] = [];
    for (let i = 0; i < 10; i++) e.on('a', () => log.push(i));
    try {
      e.emitAsync('a');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    await tick();
    expect(log).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('ordering: sync emit runs before an earlier emitAsync; multiple emitAsync are FIFO', async () => {
    const e = new CozyEvent();
    const log: string[] = [];
    e.on('a', (p: string) => log.push(p));
    e.emitAsync('a', 'async1');
    e.emit('a', 'sync');
    e.emitAsync('a', 'async2');
    queueMicrotask(() => log.push('user-microtask'));
    await tick();
    expect(log).toEqual(['sync', 'async1', 'async2', 'user-microtask']);
  });

  test('payload captured by reference at call time', async () => {
    const e = new CozyEvent();
    const obj = { v: 1 };
    let seen: any;
    e.on('a', (p) => (seen = { ...p }));
    e.emitAsync('a', obj);
    obj.v = 2;
    await tick();
    expect(seen).toEqual({ v: 2 });
  });
});

describe('S9 errors', () => {
  test('a throwing listener aborts the rest and propagates; state stays consistent', () => {
    const e = new CozyEvent();
    const after = jest.fn();
    const before = jest.fn();
    const err = new Error('boom');
    e.on('a', before);
    const thrower = () => {
      throw err;
    };
    e.on('a', thrower);
    e.on('a', after);
    expect(() => e.emit('a')).toThrow(err);
    expect(before).toHaveBeenCalledTimes(1);
    expect(after).not.toHaveBeenCalled();
    e.off('a', thrower);
    e.emit('a');
    expect(after).toHaveBeenCalledTimes(1);
  });

  test('emitAsync error surfaces from the microtask, not the caller', async () => {
    const e = new CozyEvent();
    const err = new Error('async boom');
    const after = jest.fn();
    e.on('a', () => {
      throw err;
    });
    e.on('a', after);
    const orig = globalThis.queueMicrotask;
    let caught: unknown;
    globalThis.queueMicrotask = (cb) =>
      orig(() => {
        try {
          cb();
        } catch (x) {
          caught = x;
        }
      });
    try {
      expect(() => e.emitAsync('a')).not.toThrow();
    } finally {
      globalThis.queueMicrotask = orig;
    }
    await tick();
    expect(caught).toBe(err);
    expect(after).not.toHaveBeenCalled();
  });
});

describe('S10 removeAllListeners', () => {
  test('with event removes only that event', () => {
    const e = new CozyEvent();
    const a = jest.fn();
    const b = jest.fn();
    e.on('a', a);
    e.once('a', a);
    e.on('b', b);
    e.removeAllListeners('a');
    e.emit('a');
    e.emit('b');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(callsOnEmit(e, 'b', mockCalls(a, b))).toBe(1);
    expect(callsOnEmit(e, 'a', mockCalls(a, b))).toBe(0);
  });

  test('no argument and explicit undefined remove everything', () => {
    for (const call of [(e: CozyEvent) => e.removeAllListeners(), (e: CozyEvent) => e.removeAllListeners(undefined)]) {
      const e = new CozyEvent();
      const fn = jest.fn();
      e.on('a', fn);
      e.on('__proto__', fn);
      call(e);
      e.emit('a');
      e.emit('__proto__');
      expect(fn).not.toHaveBeenCalled();
      expectNoListeners(e, ['a', '__proto__', 'toString', 'constructor'], mockCalls(fn));
      // still usable, and still safe for prototype names
      e.on('toString', fn);
      e.emit('toString');
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  test("removeAllListeners('') removes only the empty-string event", () => {
    const e = new CozyEvent();
    const empty = jest.fn();
    const other = jest.fn();
    e.on('', empty);
    e.on('x', other);
    e.removeAllListeners('');
    e.emit('');
    e.emit('x');
    expect(empty).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
  });

  test("removeAllListeners('undefined') does not clear everything", () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    e.on('undefined', fn);
    e.on('x', fn);
    e.removeAllListeners('undefined');
    expect(callsOnEmit(e, 'x', mockCalls(fn))).toBe(1);
    expect(callsOnEmit(e, 'undefined', mockCalls(fn))).toBe(0);
  });

  test('on unknown event / empty emitter is a no-op', () => {
    const e = new CozyEvent();
    expect(() => e.removeAllListeners('nope')).not.toThrow();
    expect(() => e.removeAllListeners()).not.toThrow();
  });
});

describe('S11 events emptied by every removal path stay silent and reusable', () => {
  // Bounded memory under event-name churn is checked by heap measurement in core.memory.test.ts.
  const empty = (e: CozyEvent, fn: jest.Mock) => {
    e.on('off', fn);
    e.off('off', fn);
    e.on('un', fn)();
    e.once('once', fn);
    e.emit('once', 'consumed');
    e.on('rm', fn);
    e.on('rm', fn);
    e.removeAllListeners('rm');
    e.once('onceun', fn)();
    e.once('onceoff', fn);
    e.off('onceoff', fn);
    e.on('dup', fn);
    e.on('dup', fn);
    e.off('dup', fn);
    e.off('dup', fn);
  };
  const names = ['off', 'un', 'once', 'rm', 'onceun', 'onceoff', 'dup'];

  test('via off, unsubscribe, once firing, removeAllListeners(event): emit and emitAsync call nothing', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    empty(e, fn);
    expect(fn.mock.calls).toEqual([['consumed']]);
    fn.mockClear();
    for (const n of names) {
      expect(() => e.emit(n, 1)).not.toThrow();
      expect(() => e.emitAsync(n, 2)).not.toThrow();
    }
    await tick();
    expect(fn).not.toHaveBeenCalled();
  });

  test('each emptied event can be reused, in order, with on and once, many times', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    for (let round = 0; round < 3; round++) {
      empty(e, fn);
      fn.mockClear();
      for (const n of names) {
        const log: string[] = [];
        const u1 = e.on(n, (p) => log.push(`on1:${p}`));
        e.once(n, (p) => log.push(`once:${p}`));
        e.on(n, (p) => log.push(`on2:${p}`));
        e.emit(n, 1);
        u1();
        e.emitAsync(n, 2);
        await tick();
        expect(log).toEqual(['on1:1', 'once:1', 'on2:1', 'on2:2']);
        e.removeAllListeners(n);
      }
      expect(fn).not.toHaveBeenCalled();
    }
  });

  test('dynamic event names: removal leaves every name silent and other events intact', () => {
    const e = new CozyEvent();
    const keep = jest.fn();
    e.on('keep', keep);
    const fn = jest.fn();
    for (let i = 0; i < 10_000; i++) {
      const un = e.on(`ev${i}`, fn);
      i % 3 === 0 ? un() : i % 3 === 1 ? e.off(`ev${i}`, fn) : (e.once(`ev${i}`, fn), un(), e.emit(`ev${i}`));
    }
    expect(fn).toHaveBeenCalledTimes(3333);
    fn.mockClear();
    for (let i = 0; i < 10_000; i++) e.emit(`ev${i}`);
    expect(fn).not.toHaveBeenCalled();
    expect(callsOnEmit(e, 'keep', mockCalls(keep))).toBe(1);
  });
});

describe('subclassing', () => {
  type Ev = { ping: number };
  class Sub extends CozyEvent<Ev> {
    count = 0;
    f = 'not internal';
    l = 'not internal';
    constructor() {
      super();
    }
    ping(n: number) {
      this.count++;
      this.emit('ping', n);
    }
    // names that collide with nothing public
    emitTwice(n: number) {
      this.emit('ping', n);
      this.emit('ping', n);
    }
  }
  class NoCtor extends CozyEvent {
    hello() {
      return 'hi';
    }
  }

  test('subclass with constructor works', () => {
    const s = new Sub();
    const fn = jest.fn();
    s.on('ping', fn);
    s.ping(1);
    s.emitTwice(2);
    expect(fn.mock.calls).toEqual([[1], [2], [2]]);
    expect(s.count).toBe(1);
    expect(s).toBeInstanceOf(CozyEvent);
    expect(s).toBeInstanceOf(Sub);
  });

  test('subclass without constructor works, including once/off/emitAsync', async () => {
    const s = new NoCtor();
    const fn = jest.fn();
    s.once('constructor', fn);
    s.off('constructor', fn);
    s.on('x', fn);
    s.emitAsync('x', 1);
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.hello()).toBe('hi');
  });

  test('instances do not shadow the public API with own properties', () => {
    const own = Object.keys(new CozyEvent());
    for (const m of ['on', 'once', 'off', 'emit', 'emitAsync', 'removeAllListeners']) expect(own).not.toContain(m);
  });
});

describe('integration round 1 fixes', () => {
  test('listeners are called with this === undefined (never the internal record)', () => {
    const e = new CozyEvent();
    const seen: unknown[] = [];
    e.on('a', function (this: unknown) {
      seen.push(this);
    });
    e.once('a', function (this: unknown) {
      seen.push(this);
    });
    e.emit('a');
    e.emitAsync('a');
    return tick().then(() => expect(seen).toEqual([undefined, undefined, undefined]));
  });

  test('a function listener cannot corrupt the emitter through this', () => {
    const e = new CozyEvent();
    const fn = jest.fn(function (this: any) {
      try {
        this.f = 5;
      } catch {
        /* strict mode: this is undefined */
      }
    });
    e.on('a', fn);
    e.emit('a');
    e.emit('a');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('a subclass overriding off only ever receives user functions; once and unsubscribe still work', () => {
    const received: string[] = [];
    class Guarded extends CozyEvent {
      off(event: string, fn: (p: any) => void) {
        received.push(typeof fn);
        if (typeof fn !== 'function') throw new TypeError('listener must be a function');
        super.off(event, fn);
      }
    }
    const g = new Guarded();
    const fn = jest.fn();
    g.once('a', fn);
    g.emit('a', 1);
    g.emit('a', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    const un = g.on('b', fn);
    un();
    g.emit('b', 3);
    expect(fn).toHaveBeenCalledTimes(1);
    expectNoListeners(g, ['a', 'b'], mockCalls(fn));
    expect(received).toEqual([]);
    g.on('a', fn);
    g.off('a', fn);
    expect(received).toEqual(['function']);
    expectNoListeners(g, ['a', 'b'], mockCalls(fn));
  });

  test('adding many listeners to one event is linear (v1 regression guard)', () => {
    const e = new CozyEvent();
    let hits = 0;
    const t = Date.now();
    for (let i = 0; i < 1e5; i++) e.on('a', () => hits++);
    // O(n^2) copy-on-add took ~18 s for 1e5 here; O(1) push takes a few ms.
    expect(Date.now() - t).toBeLessThan(2000);
    e.emit('a');
    expect(hits).toBe(1e5);
  });

  test('append in place: listeners added during emit or before an emitAsync microtask do not run in it', async () => {
    const e = new CozyEvent();
    const log: string[] = [];
    e.on('a', () => {
      log.push('1');
      e.on('a', () => log.push('added'));
    });
    e.emit('a');
    expect(log).toEqual(['1']);
    log.length = 0;
    e.removeAllListeners();
    e.on('b', () => log.push('b1'));
    e.emitAsync('b');
    e.on('b', () => log.push('b2'));
    await tick();
    expect(log).toEqual(['b1']);
    e.emit('b');
    expect(log).toEqual(['b1', 'b1', 'b2']);
  });

  test('removal during emit after an in-place append keeps the snapshot', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const b = () => log.push('b');
    const c = () => log.push('c');
    e.on('a', () => {
      log.push('a');
      e.on('a', c); // appended in place
      e.off('a', b); // copy on write
      e.on('a', () => log.push('d')); // appended to the copy
    });
    e.on('a', b);
    e.emit('a');
    expect(log).toEqual(['a', 'b']);
    log.length = 0;
    e.emit('a');
    // second emit snapshots [L, c, d]; L appends more listeners (not run now), off(b) is a no-op
    expect(log).toEqual(['a', 'c', 'd']);
  });

  test('many emitters stay independent and prototype-name safe, before and after removeAllListeners()', () => {
    const fn = jest.fn();
    const protoNames = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
    const all: CozyEvent[] = [];
    for (let i = 0; i < 1000; i++) {
      const e = new CozyEvent();
      if (i % 2) e.removeAllListeners();
      for (const n of protoNames) expect(() => e.emit(n, i)).not.toThrow();
      all.push(e);
    }
    all[0].on('x', fn);
    all[1].on('toString', fn);
    all[2].on('__proto__', fn);
    for (let i = 3; i < all.length; i++) for (const n of ['x', ...protoNames]) all[i].emit(n);
    expect(fn).not.toHaveBeenCalled();
    all[1].removeAllListeners();
    all[1].emit('toString');
    all[3].on('toString', fn);
    all[3].emit('toString', 3);
    expect(fn.mock.calls).toEqual([[3]]);
  });
});
