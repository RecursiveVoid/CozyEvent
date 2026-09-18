/**
 * A listener receives exactly one argument: the payload passed to `emit`/`emitAsync`
 * (`undefined` when none was given). Extra arguments are dropped.
 */
export type Listener<T = any> = (payload: T) => void;

/**
 * Shared, empty, null-prototype object used as the prototype of every instance's storage.
 * Nothing in the storage's prototype chain comes from `Object.prototype`, so every event name is
 * safe (bug fix #1). `Object.create` with a shared prototype is much faster to construct than a
 * `{ __proto__ }` literal, which always takes a runtime call. It also keeps the storage object in
 * V8's dictionary mode, which is what makes a lookup by a varying event name fast: constructing
 * the storage with `new` of an empty function instead is 1.12x faster on `new + on + emit`, but
 * 0.94x on emitting 20 different event names in turn (both measured, paired in-process runs).
 */
const P = Object.create(null);

/**
 * Registration counter. Every `on` registration stores a fresh value of it as its key, so the
 * returned unsubscribe matches exactly that registration (compared by value, never reused).
 */
let N = 0;

/**
 * Calls the first `n` slots' listeners of the flat record array `a` with `p`, in order.
 *
 * Record layout: two slots per registration, `[call, key, call, key, ...]`.
 * - `on`:   `call` is the listener, `key` is a unique number from `N` (the unsubscribe token).
 * - `once`: `call` is the guard closure (also the unsubscribe token), `key` is the user listener.
 * `off(event, fn)` matches either slot, so it finds `on(fn)` by `call` and `once(fn)` by `key`.
 *
 * Record arrays are append-only while current (`on`/`once` push in place, a removal replaces the
 * array with a copy), so the first `n` slots of an array never change: `(a, n)` taken at emit
 * time is the snapshot (S5, S8) with no copy and no cache.
 *
 * The first twelve listeners are called from twelve separate call sites, then a six-wide loop
 * calls the rest. All sites index with the same variable `i` (`(i += 2) < n` between them) instead
 * of a constant index each, so every site is identical source text and gzip stores it once. That
 * spelling alone (still ten sites and a four-wide loop) made the whole file 52 B smaller after
 * gzip, 468 B -> 416 B, and measured the same as the constant-index version in every scenario;
 * the twelve sites and six-wide loop it pays for are another 2 B smaller again and 1.02x on 100
 * listeners (9 paired rounds, [1.02 1.04 1.02 1.02 1.36 1.02 1.02 1.02 1.02]).
 * Each call site keeps its own type feedback, so it stays monomorphic and inlinable even when the
 * listeners are different functions. That is what `new Function` code generation gives other
 * emitters, without any code generation (CSP safe) and without a per-list dispatcher closure.
 * Listeners are called as plain functions (`(0, a[i])(p)`), so `this` is `undefined`.
 */
const E = (a: any[], p: unknown, n: number): void => {
  let i = 0;
  (0, a[i])(p);
  if ((i += 2) < n) {
    (0, a[i])(p);
    if ((i += 2) < n) {
      (0, a[i])(p);
      if ((i += 2) < n) {
        (0, a[i])(p);
        if ((i += 2) < n) {
          (0, a[i])(p);
          if ((i += 2) < n) {
            (0, a[i])(p);
            if ((i += 2) < n) {
              (0, a[i])(p);
              if ((i += 2) < n) {
                (0, a[i])(p);
                if ((i += 2) < n) {
                  (0, a[i])(p);
                  if ((i += 2) < n) {
                    (0, a[i])(p);
                    if ((i += 2) < n) {
                      (0, a[i])(p);
                      if ((i += 2) < n) {
                        (0, a[i])(p);
                        for (
                          ;
                          (i += 2) < n &&
                          ((0, a[i])(p), (i += 2) < n) &&
                          ((0, a[i])(p), (i += 2) < n) &&
                          ((0, a[i])(p), (i += 2) < n) &&
                          ((0, a[i])(p), (i += 2) < n) &&
                          ((0, a[i])(p), (i += 2) < n);

                        )
                          (0, a[i])(p);
                      }
                    }
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
 * Memory (delayed cleanup): when the last listener of an event is removed, its storage entry is
 * not deleted right away but marked empty with `null`, because deleting a property and adding
 * it back (e.g. `once` + `emit` in a loop) drops V8 storage into slow dictionary mode. Each emitter keeps at
 * most ONE empty entry: marking an event empty first deletes the entry of the previously emptied
 * event if it is still empty (and skips even looking when that is this same event, which is the
 * common `once` + `emit` loop). So retained empty entries are bounded by 1 per emitter, however
 * many distinct event names are churned. `removeAllListeners(event)` deletes the entry at once and
 * `removeAllListeners()` drops the whole storage.
 *
 * Complexity: `on`/`once` are O(1); `off`/unsubscribe are O(listeners of that event);
 * `emit` is O(listeners of that event) with no allocation.
 *
 * @typeParam Events - Map of event name to payload type, e.g. `{ login: User; logout: void }`.
 */
export class CozyEvent<
  Events extends Record<string, any> = Record<string, any>,
> {
  /**
   * Type-only marker (emits no JavaScript) so TypeScript can infer `Events` from subclasses,
   * e.g. `useCozyEvent(new Bus(), ...)` with `class Bus extends CozyEvent<MyEvents> {}`.
   * @internal
   */
  declare protected readonly _T?: Events;

  /**
   * Internal listener storage: event name to a flat record array (see `E`), or `null` for the one
   * event that was emptied last (see the class notes on memory). Arrays are append-only while
   * current (`on` pushes in place); a removal replaces the array with a copy. An emit only calls
   * the records that existed when it started, so it is never affected.
   * Internal: do not use or shadow this property.
   */
  private _e: Record<string, any> = Object.create(P);

  /**
   * Name of the event emptied last, whose storage entry may still be the empty marker `null`.
   * Created on the first removal that empties an event (type-only declaration, no field).
   * Internal: do not use or shadow this property.
   */
  declare private _k: string;

  /**
   * Registers a listener that is called every time `event` is emitted.
   *
   * @param event - The event name.
   * @param listener - Called with the payload.
   * @returns A function that removes this registration. Calling it again, or after the
   * registration was already removed, does nothing.
   */
  on<K extends keyof Events & string>(
    event: K,
    listener: Listener<Events[K]>
  ): () => void {
    // Append in place (O(1)); emits in progress only call their first `n` slots (see `E`).
    // The empty marker `null` is falsy, so it is simply replaced by a new array. Reading the entry
    // twice, and repeating this in `once` instead of sharing a helper, is smaller after gzip.
    this._e[event]
      ? this._e[event].push(listener, ++N)
      : (this._e[event] = [listener, ++N]);
    // Calls the private remover, not `off`, so a subclass overriding `off` never sees a token.
    // A bound function instead of an arrow: no context allocation, and calling it is cheaper.
    return this._r.bind(this, event, N);
  }

  /**
   * Registers a listener that is called at most once, on the next emit of `event`.
   * It is removed before it runs. `off(event, listener)` with the same function removes it too.
   *
   * @param event - The event name.
   * @param listener - Called with the payload.
   * @returns A function that removes this registration if it has not run yet.
   */
  once<K extends keyof Events & string>(
    event: K,
    listener: Listener<Events[K]>
  ): () => void {
    // `w` doubles as the "not run yet" flag: it is cleared right after removing the record,
    // so the listener runs at most once even if several snapshots still contain the guard.
    let w: any = (payload: Events[K]) => {
      if (w) {
        this._r(event, w);
        w = 0;
        listener(payload);
      }
    };
    // `?.push` skips the method load and the call when the entry is the nullish empty marker,
    // so the append reads the entry once instead of twice (measured 1.04x on once). `on` keeps
    // its `?:` because there `??` would have to test what `push` returns (measured 0.98x).
    this._e[event]?.push(w, listener) ?? (this._e[event] = [w, listener]);
    return this._r.bind(this, event, w);
  }

  /**
   * Removes one registration of `listener` for `event` (the most recently added one).
   * Works for listeners added with `on` and with `once`. Unknown event or listener: no-op.
   *
   * @param event - The event name.
   * @param listener - The function that was passed to `on` or `once`.
   */
  off<K extends keyof Events & string>(
    event: K,
    listener: Listener<Events[K]>
  ): void {
    this._r(event, listener);
  }

  /**
   * Removes the last record with a slot equal to `x`: an unsubscribe token (the `on` number or the
   * `once` guard) or a user listener (from `off`; matches both `on` and `once`, bug fix #2).
   * Internal: do not use or shadow this method.
   */
  private _r(event: string, x: any): void {
    const a = this._e[event];
    // Unknown or empty event: `i` starts as NaN, which is falsy, so the loop does not run.
    // Scans records from the end: `a[i]` is the key slot, `a[i - 1]` the call slot.
    for (let i = a?.length as number; i--; ) {
      if (a[i--] === x || a[i] === x) {
        if (a[2])
          // Copy on write (emits in progress keep the old array and their length, see `E`), then
          // shift the records after `i` down by one record. `x` is reused for the copy (smaller).
          // slice + pop + shift loop: `splice`, `filter`, `copyWithin`, `length -= 2` and
          // `slice(0, -2)` were all measured 1.3x to 2x slower on on + off and unsubscribe.
          for (
            x = this._e[event] = a.slice(), x.pop(), x.pop();
            i < x.length;
            i++
          )
            x[i] = a[i + 2];
        else {
          // `_k === event` is one event being emptied again (`once` + `emit` in a loop): the entry
          // is about to be set to the marker for that same event, so it must not be deleted either
          // way, and comparing the names skips the keyed lookup (measured 1.02x on once).
          this._k === event || this._e[this._k] || delete this._e[this._k];
          this._e[(this._k = event)] = null;
        }
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
    // Reuses the parameter for the record array (saves bytes, no extra local).
    ((event as any) = this._e[event]) && E(event as any, payload, event.length);
  }

  /**
   * Snapshots the listeners of `event` now and calls them in one microtask, so listeners
   * removed in between cannot make it throw (bug fix #3).
   * Schedules nothing when `event` has no listeners.
   *
   * @param event - The event name.
   * @param payload - The single argument passed to each listener.
   */
  emitAsync<K extends keyof Events & string>(
    event: K,
    payload?: Events[K]
  ): void {
    // The bound `(array, payload, length)` is the snapshot (see `E`); `E` is an arrow, so the
    // bound `this` is ignored.
    ((event as any) = this._e[event]) &&
      queueMicrotask(E.bind(0, event as any, payload, event.length));
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
