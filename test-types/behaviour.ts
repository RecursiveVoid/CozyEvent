/**
 * Behavioural test helpers shared by the test suites.
 *
 * Tests observe the emitter ONLY through its public API (on/once/off/unsubscribe/emit/emitAsync/
 * removeAllListeners). They never read `_e`, array lengths or any other private member, so the
 * storage layout (and the empty-entry cleanup policy) is free to change.
 *
 * This file lives outside `__tests__/` so Jest does not collect it as a test suite.
 */

/** Resolves after all pending microtasks (including every `emitAsync`) have run. */
export const tick = (): Promise<void> => new Promise<void>((r) => setImmediate(r));

/**
 * Sentinel payload used by probes. Listeners built with {@link recorder} (and the fuzz models)
 * recognise it: they report their tag to the probe instead of logging or running side effects.
 */
export const PROBE: unique symbol = Symbol('cozyevent-test-probe');

/** Minimal structural type of an emitter, so the helpers work with src, dist and subclasses. */
export interface EmitterLike {
  emit(event: string, payload?: any): void;
}

/**
 * Number of listener calls one synchronous `emit(event, payload)` makes, measured as the growth of
 * `observe()` (e.g. `() => log.length`, or the sum of `jest.fn` call counts).
 * Destructive like any emit: `once` listeners in the list are consumed.
 */
export const callsOnEmit = (e: EmitterLike, event: string, observe: () => number, payload?: unknown): number => {
  const before = observe();
  e.emit(event, payload);
  return observe() - before;
};

/** Sum of `mock.calls.length` over the given jest mocks (use as an `observe` function). */
export const mockCalls =
  (...fns: jest.Mock[]) =>
  (): number =>
    fns.reduce((n, f) => n + f.mock.calls.length, 0);

/**
 * Behavioural "no listeners left": emits every event in `events` and expects `observe()` not to
 * change (no listener ran). Replaces the old `Object.keys(_e)` emptiness checks.
 */
export const expectNoListeners = (e: EmitterLike, events: readonly string[], observe: () => number): void => {
  for (const ev of events) expect([ev, callsOnEmit(e, ev, observe)]).toEqual([ev, 0]);
};

/**
 * A factory of tagged listeners that share one log.
 *
 * - `fn(tag, act?)` returns a NEW listener function on every call. On a normal payload it pushes
 *   `${tag}:${String(payload)}` to `log` and then runs `act(payload)`; on {@link PROBE} it only pushes
 *   `tag` to the current probe result (no log entry, no side effect).
 * - `probe(e, event)` emits PROBE once and returns the tags of the listeners that ran, in order:
 *   the exact live registration list of `event` (on and once; once registrations are consumed).
 * - `census(e, event)` probes twice and returns `{ all, persistent }`: every registration in order,
 *   then those that survived (the `on` registrations). Distinguishes on from once.
 */
export const recorder = () => {
  const log: string[] = [];
  let probing: string[] | null = null;
  const fn =
    (tag: string, act?: (p: any) => void) =>
    (p: any): void => {
      if (p === PROBE) {
        probing ? probing.push(tag) : log.push(`${tag}:PROBE-outside-probe`);
        return;
      }
      log.push(`${tag}:${String(p)}`);
      act?.(p);
    };
  const probe = (e: EmitterLike, event: string): string[] => {
    const out: string[] = [];
    const prev = probing;
    probing = out;
    try {
      e.emit(event, PROBE);
    } finally {
      probing = prev;
    }
    return out;
  };
  const census = (e: EmitterLike, event: string) => ({ all: probe(e, event), persistent: probe(e, event) });
  return { log, fn, probe, census };
};
