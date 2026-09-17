/**
 * A listener receives exactly one argument: the payload passed to `emit`/`emitAsync`
 * (`undefined` when none was given). Extra arguments are dropped.
 */
export type Listener<T = any> = (payload: T) => void;

/**
 * Internal registration record, one object per registration so each has a unique identity
 * (the returned unsubscribe removes exactly that one).
 * `f` is the function emit calls (the listener itself, or the `once` guard),
 * `l` is the user's listener, which `off(event, listener)` matches (`once` clears it after running).
 * @internal
 */
type Entry = { f: Listener; l: Listener };

/**
 * Shared, empty, null-prototype object used as the prototype of every instance's storage.
 * Nothing in the storage's prototype chain comes from `Object.prototype`, so every event name is
 * safe (bug fix #1). `Object.create` with a shared prototype is much faster to construct than a
 * `{ __proto__ }` literal, which always takes a runtime call.
 */
const P = Object.create(null);

/**
 * Calls the first `n` listeners of the record array `a` with `p`, in order.
 *
 * Record arrays are append-only while current (`on`/`once` push in place, a removal replaces the
 * array with a copy), so the first `n` records of an array never change: `(a, n)` taken at emit
 * time is the snapshot (S5, S8) with no copy and no cache.
 *
 * The first ten listeners are called from ten separate call sites, then a loop calls the rest.
 * Each call site keeps its own type feedback, so it stays monomorphic and inlinable even when the
 * listeners are different functions. That is what `new Function` code generation gives other
 * emitters, without any code generation (CSP safe) and without a per-list dispatcher closure.
 * Listeners are called as plain functions (`(0, r.f)(p)`), so `this` is `undefined`.
 */
const E = (a: Entry[], p: unknown, n: number): void => {
  (0, a[0].f)(p);
  if (n > 1) {
    (0, a[1].f)(p);
    if (n > 2) {
      (0, a[2].f)(p);
      if (n > 3) {
        (0, a[3].f)(p);
        if (n > 4) {
          (0, a[4].f)(p);
          if (n > 5) {
            (0, a[5].f)(p);
            if (n > 6) {
              (0, a[6].f)(p);
              if (n > 7) {
                (0, a[7].f)(p);
                if (n > 8) {
                  (0, a[8].f)(p);
                  if (n > 9) {
                    (0, a[9].f)(p);
                    for (let i = 10; i < n; ) (0, a[i++].f)(p);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

/**
 * Tiny, typed event emitter with synchronous `emit` and microtask-based `emitAsync`.
 *
 * Semantics in short:
 * - Any string is a safe event name (`__proto__`, `constructor`, `""`, ...).
 * - Listeners run in registration order; the same function may be registered more than once.
 * - Snapshot semantics: an emit calls the listeners registered when the emit started.
 *   Listeners added during an emit do not run in it; listeners removed during an emit that
 *   have not run yet still run in it. `emitAsync` takes the same snapshot at call time.
 * - A `once` listener is removed before it runs and never runs more than once.
 * - No try/catch: a throwing listener stops the rest of that emit and the error propagates.
 * - Listeners are called with `this` set to `undefined`.
 *
 * Complexity: `on`/`once` are O(1); `off`/unsubscribe are O(listeners of that event);
 * `emit` is O(listeners of that event) with no allocation.
 *
 * @typeParam Events - Map of event name to payload type, e.g. `{ login: User; logout: void }`.
 */
export class CozyEvent<Events extends Record<string, any> = Record<string, any>> {
  /**
   * Type-only marker (emits no JavaScript) so TypeScript can infer `Events` from subclasses,
   * e.g. `useCozyEvent(new Bus(), ...)` with `class Bus extends CozyEvent<MyEvents> {}`.
   * @internal
   */
  declare protected readonly _T?: Events;

  /**
   * Internal listener storage: event name to a listener record array. Arrays are append-only
   * while current (`on` pushes in place); a removal replaces the array with a copy. An emit only
   * calls the records that existed when it started, so it is never affected. Empty events are
   * deleted. Internal: do not use or shadow this property.
   */
  private _e: Record<string, Entry[]> = Object.create(P);

  /**
   * Registers a listener that is called every time `event` is emitted.
   *
   * @param event - The event name.
   * @param listener - Called with the payload.
   * @returns A function that removes this registration. Calling it again, or after the
   * registration was already removed, does nothing.
   */
  on<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): () => void {
    return this._a(event, { f: listener, l: listener });
  }

  /**
   * Registers a listener that is called at most once, on the next emit of `event`.
   * It is removed before it runs. `off(event, listener)` with the same function removes it too.
   *
   * @param event - The event name.
   * @param listener - Called with the payload.
   * @returns A function that removes this registration if it has not run yet.
   */
  once<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): () => void {
    // `r.l` doubles as the "not run yet" flag: it is cleared right after removing the record,
    // so the listener runs at most once even if several snapshots still contain it.
    const r: Entry = {
      f: (payload) => {
        if (r.l) {
          this._r(event, r);
          r.l = 0 as any;
          listener(payload);
        }
      },
      l: listener,
    };
    return this._a(event, r);
  }

  /**
   * Adds a registration record and returns its unsubscribe function.
   * Internal: do not use or shadow this method.
   */
  private _a(event: string, r: Entry): () => void {
    const a = this._e[event];
    // Append in place (O(1)); emits in progress only call their first `n` records (see `E`).
    a ? a.push(r) : (this._e[event] = [r]);
    // Calls the private remover, not `off`, so a subclass overriding `off` never sees a record.
    // A bound function instead of an arrow: no context allocation, and calling it is cheaper
    // (measured ~1.4x faster on + unsubscribe).
    return this._r.bind(this, event, r);
  }

  /**
   * Removes one registration of `listener` for `event` (the most recently added one).
   * Works for listeners added with `on` and with `once`. Unknown event or listener: no-op.
   *
   * @param event - The event name.
   * @param listener - The function that was passed to `on` or `once`.
   */
  off<K extends keyof Events & string>(event: K, listener: Listener<Events[K]>): void {
    this._r(event, listener);
  }

  /**
   * Removes the last registration that is `x` (a record, from an unsubscribe function) or whose
   * listener is `x` (from `off`; also matches `once` registrations, bug fix #2).
   * Internal: do not use or shadow this method.
   */
  private _r(event: string, x: unknown): void {
    const a = this._e[event];
    // Unknown event: `i` starts as NaN, which is falsy, so the loop does not run.
    for (let i = a?.length as number; i--; ) {
      if (a[i] === x || a[i].l === x) {
        // Copy on write (emits in progress keep the old array and their length, see `E`).
        // slice + pop + shift rather than filter or splice: the copy keeps one spare slot, so the
        // next `on` push does not reallocate (measured ~1.3x faster on + off and unsubscribe;
        // splice was ~2x slower).
        if (a[1]) {
          const b = (this._e[event] = a.slice());
          b.pop();
          while (++i < a.length) b[i - 1] = a[i];
        } else delete this._e[event];
        return;
      }
    }
  }

  /**
   * Calls every listener of `event` synchronously, in registration order, with `payload`.
   *
   * @param event - The event name.
   * @param payload - The single argument passed to each listener.
   */
  emit<K extends keyof Events & string>(event: K, payload?: Events[K]): void {
    const a = this._e[event];
    a && E(a, payload, a.length);
  }

  /**
   * Snapshots the listeners of `event` now and calls them in one microtask, so listeners
   * removed in between cannot make it throw (bug fix #3).
   * Schedules nothing when `event` has no listeners.
   *
   * @param event - The event name.
   * @param payload - The single argument passed to each listener.
   */
  emitAsync<K extends keyof Events & string>(event: K, payload?: Events[K]): void {
    const a = this._e[event];
    // The bound `(a, payload, length)` is the snapshot (see `E`); `E` is an arrow, so the bound
    // `this` is ignored.
    a && queueMicrotask(E.bind(0, a, payload, a.length));
  }

  /**
   * Removes all listeners of `event`, or of every event when `event` is omitted or `undefined`.
   * An empty string is a normal event name.
   *
   * @param event - (Optional) The event name.
   */
  removeAllListeners(event?: keyof Events & string): void {
    event ?? (this._e = Object.create(P));
    delete this._e[event!];
  }
}
