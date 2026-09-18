/**
 * Adversarial / re-entrancy / scale tests for the core emitter.
 */
import { CozyEvent } from '../src/index';

import { tick } from '../test-types/behaviour';

describe('re-entrancy', () => {
  test('off of an earlier (already-run) listener during emit does not skip later ones', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const a = () => log.push('a');
    e.on('x', a);
    e.on('x', () => {
      log.push('b');
      e.off('x', a);
    });
    e.on('x', () => log.push('c'));
    e.emit('x');
    e.emit('x');
    expect(log).toEqual(['a', 'b', 'c', 'b', 'c']);
  });

  test('unsubscribe of self via returned function during emit', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    const un = e.on('x', () => {
      log.push('self');
      un();
      un();
    });
    e.on('x', () => log.push('next'));
    e.emit('x');
    e.emit('x');
    expect(log).toEqual(['self', 'next', 'next']);
  });

  test('adding the same listener during its own run does not loop forever', () => {
    const e = new CozyEvent();
    let n = 0;
    const fn = () => {
      n++;
      e.on('x', fn);
    };
    e.on('x', fn);
    e.emit('x');
    expect(n).toBe(1);
    e.emit('x');
    expect(n).toBe(1 + 2);
  });

  test('once re-registering itself runs once per emit', () => {
    const e = new CozyEvent();
    let n = 0;
    const fn = () => {
      n++;
      e.once('x', fn);
    };
    e.once('x', fn);
    for (let i = 0; i < 5; i++) e.emit('x');
    expect(n).toBe(5);
    // exactly one pending registration: removing one leaves nothing to run
    e.off('x', fn);
    e.emit('x');
    expect(n).toBe(5);
  });

  test('deep recursion through nested emit with once', () => {
    const e = new CozyEvent();
    let depth = 0;
    const fn = () => {
      depth++;
      if (depth < 1000) {
        e.once('x', fn);
        e.emit('x');
      }
    };
    e.once('x', fn);
    e.emit('x');
    expect(depth).toBe(1000);
    e.emit('x'); // nothing left: fn would run (depth 1001)
    expect(depth).toBe(1000);
  });

  test('removeAllListeners(event) during emit of another event', () => {
    const e = new CozyEvent();
    const b = jest.fn();
    e.on('b', b);
    e.on('a', () => {
      e.removeAllListeners('b');
      e.emit('b');
    });
    e.emit('a');
    expect(b).not.toHaveBeenCalled();
  });

  test('removeAllListeners() then on during emit: new listener not called now, called later', () => {
    const e = new CozyEvent();
    const late = jest.fn();
    const rest = jest.fn();
    e.on('a', () => {
      e.removeAllListeners();
      e.on('a', late);
    });
    e.on('a', rest);
    e.emit('a');
    expect(rest).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
    e.emit('a');
    expect(late).toHaveBeenCalledTimes(1);
    expect(rest).toHaveBeenCalledTimes(1);
  });

  test('emitAsync from inside an emitAsync listener runs in a later microtask', async () => {
    const e = new CozyEvent();
    const log: string[] = [];
    e.once('a', () => {
      log.push('first');
      e.on('a', () => log.push('second'));
      e.emitAsync('a');
      log.push('end-first');
    });
    e.emitAsync('a');
    await tick();
    expect(log).toEqual(['first', 'end-first', 'second']);
  });

  test('once removed via unsubscribe in between emitAsync call and microtask still runs once (snapshot)', async () => {
    const e = new CozyEvent();
    const fn = jest.fn();
    const un = e.once('a', fn);
    e.emitAsync('a', 1);
    un();
    await tick();
    expect(fn).toHaveBeenCalledTimes(1);
    e.emit('a', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('throw in a nested emit leaves outer state consistent', () => {
    const e = new CozyEvent();
    const log: string[] = [];
    e.once('inner', () => {
      throw new Error('inner');
    });
    e.on('outer', () => {
      log.push('outer1');
      try {
        e.emit('inner');
      } catch {
        log.push('caught');
      }
    });
    e.on('outer', () => log.push('outer2'));
    e.emit('outer');
    e.emit('outer');
    expect(log).toEqual(['outer1', 'caught', 'outer2', 'outer1', 'outer2']);
  });
});

describe('scale', () => {
  test('1e5 events x 3 listeners, then all removed', () => {
    const e = new CozyEvent();
    let hits = 0;
    const fns = [() => hits++, () => hits++, () => hits++];
    const N = 100_000;
    const uns: (() => void)[] = [];
    for (let i = 0; i < N; i++) for (const f of fns) uns.push(e.on(`e${i}`, f));
    for (let i = 0; i < N; i++) e.emit(`e${i}`);
    expect(hits).toBe(3 * N);
    for (let i = 0; i < N; i++) e.off(`e${i}`, fns[1]);
    hits = 0;
    for (let i = 0; i < N; i++) e.emit(`e${i}`);
    expect(hits).toBe(2 * N); // off removed exactly one per event
    for (const u of uns) u();
    for (let i = 0; i < N; i++) e.emit(`e${i}`);
    expect(hits).toBe(2 * N);
  });

  test('1e4 listeners on one event with random removal', () => {
    const e = new CozyEvent();
    const N = 10_000;
    const called = new Uint8Array(N);
    const fns = Array.from({ length: N }, (_, i) => () => void called[i]++);
    const uns = fns.map((f) => e.on('x', f));
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const removed = new Set<number>();
    for (let k = 0; k < N / 2; k++) {
      const i = Math.floor(rnd() * N);
      if (rnd() < 0.5) uns[i]();
      else if (!removed.has(i)) e.off('x', fns[i]);
      removed.add(i);
    }
    e.emit('x');
    e.emit('x');
    let bad = 0;
    for (let i = 0; i < N; i++) if (called[i] !== (removed.has(i) ? 0 : 2)) bad++;
    expect(bad).toBe(0);
    expect(called.reduce((a, b) => a + b, 0)).toBe(2 * (N - removed.size));
  });
});
