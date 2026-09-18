# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## 2.0.0

The main entry is typed, free of React and smaller than v1's (430 vs 760 bytes min+gzip). The core class alone grew by about 160 bytes to fix the bugs below, add unsubscribe functions and make `emit` faster. React support is now a single hook in `cozyevent/react`. See [MIGRATION.md](MIGRATION.md) for before/after code.

### Breaking changes

- **React removed from the main entry.** `cozyevent` exports only `CozyEvent` (and the `Listener` type), and never imports React.
- **React support moved to `cozyevent/react`** and is now a single hook: `useCozyEvent(emitter, event, listener)`. It returns `void`.
- **Removed:** `CozyEventProvider`, `CozyEventContext`, `registerCozyEventInstance`, `getCozyEventInstanceById`, the global fallback instance, and the `useCozyEvent` options `namespace` and `id`.
- **`react` is an optional peer dependency** (`>=16.8.0`) instead of a hard requirement of the main entry.
- **The `latest-light` dist-tag was dropped.** Install with plain `npm install cozyevent`.
- **`off(event, fn)` removes one registration** (the most recently added one) instead of every registration of `fn`.
- **`removeAllListeners('')`** clears only the `''` event. It no longer clears everything.
- **Snapshot semantics:** a listener removed during an `emit` that has not run yet still runs in that emit. `emitAsync` captures its listeners when it is called, not when the microtask runs.
- **`once` listeners are removed before they run.** Previously they were removed after running, so a throwing `once` listener stayed registered.
- **Package layout:** `dist/index.js`, `dist/index.cjs`, `dist/react.js` and `dist/react.cjs`, with type declarations for ESM (`.d.ts`) and CommonJS (`.d.cts`), resolved through the `exports` map. `dist/index.esm.js` no longer exists. Deep imports into `dist/` are not supported.
- **Types:** the per-method generics (`on<T>`, `emit<T>`, and so on) were replaced by an event-map type parameter on the class, `CozyEvent<Events>`. The internal `_events` property is gone. Internals are now the private members `_e`, `_k` and `_r` plus the type-only marker `_T`, and subclasses must not use those names.

### Bug fixes

- **Event names inherited from `Object.prototype` crashed.** `emit('toString')` threw `forEach is not a function`, and `on('constructor', cb)` threw `push is not a function`. Listener storage no longer inherits from `Object.prototype`, so `'__proto__'`, `'constructor'`, `'toString'`, `'hasOwnProperty'` and every other string work.
- **`once(ev, fn)` could not be removed with `off(ev, fn)`**, because `off` compared against a hidden wrapper. It is now removed correctly.
- **`emitAsync` threw `Cannot read properties of undefined`** when listeners were removed between the call and the microtask. Listeners are now captured at call time.
- **Importing the main entry pulled in `react/jsx-runtime`**, so non-React users needed React. The core no longer contains any React code.
- React hook (rewritten): fixed the conditional `useContext` call (a rules-of-hooks violation), fixed resubscribing on every render when the callback was inline, and fixed the registry lookup throwing on first render.

### Performance

Measured with `npm run benchmark` (each library and scenario in its own process, 3 rounds, median) on Apple M4, Node v22.14.0. Full tables: [`benchmark/reports/results.md`](benchmark/reports/results.md).

- **No code generation.** `emit` calls the first twelve listeners from separate call sites and loops over the rest six at a time, so V8 can inline each listener. Every call site is the same source text, so gzip stores it once and the unrolling costs almost no bytes. It uses no `eval` or `new Function`, so it works under a strict Content Security Policy.
- **`emit` does not copy or allocate.** `on`/`once` append in place; only removal copies the listener array, and each emit stops at the listener count it started with (snapshot semantics).
- **Unsubscribe functions** are bound functions rather than closures.
- **`once` keeps emptied events in storage (delayed cleanup)**, so a `once` + `emit` loop never deletes and re-adds a key. It also appends with `?.push`. `once` + `emit` is 2.8x faster than the earlier 2.0 build, which deleted emptied entries immediately (interleaved A/B, 5 rounds).
- **vs v1.4.2** (interleaved A/B, `node benchmark/ab.js`, 5 rounds, median ratio): `emit` is 1.7x faster with 1 listener, 1.8x to 5.9x faster with 3 and 10 listeners, 1.25x faster with 100 listeners and 1.15x faster on a 20-event app bus. `on` + `off` is 1.15x faster, `once` + `emit` 3.6x, `emitAsync` 1.14x and creating an emitter 1.7x. `emit` with 0 listeners is equal within noise.
- **vs other libraries:** fastest of the libraries that do not generate code for `emit` with 3, 10 and 100 listeners (1.16x ahead of @braintree/event-emitter with 100), `on` + `off` and `emitAsync`. Tied for first with 1 listener and on the 20-event app bus. Second for `once` (tseep's CSP-safe build is 2.2x faster; v2 is 1.37x faster than nanoevents, the next one) and for creating an emitter (emitix is 1.12x faster). tseep's default build (which uses `new Function`) is faster at `emit` with 3 or more listeners and at `once`.

### Features

- **Typed events:** `new CozyEvent<{ login: User; logout: void }>()` type-checks event names, payloads and listeners, including for subclasses (`class Bus extends CozyEvent<Events>`) passed to `useCozyEvent`.
- **`on` and `once` return an unsubscribe function.** It is safe to call more than once.
- **`Listener<T>` type export.**
- **`useCozyEvent(emitter, event, listener)`:** subscribes once for each `[emitter, event]` and always calls the latest listener through a ref. Inline arrow functions do not resubscribe. It is safe with StrictMode and server rendering.
- **No memory growth from dynamic event names (delayed cleanup):** when an event loses its last listener, its entry is marked empty instead of being deleted, and it is deleted when the next event is emptied, unless it got listeners again in between. Each emitter therefore keeps at most one empty entry, however many distinct event names it goes through. Deleting and re-adding the same key on every `once` + `emit` would push V8's storage into a slow mode (see Performance). `removeAllListeners(event)` deletes the entry at once, and `removeAllListeners()` drops all storage. A test (`__tests__/core.memory.test.ts`) churns 1,000,000 distinct event names through `on`/`off`, unsubscribe and `once` under `node --expose-gc`. It checks that retained heap stays bounded; the measured maximum was 42 KB.
- **Typings** use `export type { Listener }`, so TypeScript 3.8+ can read them.
- **Benchmarks:** each library and scenario runs in its own process with realistic listener counts (`npm run benchmark`), and sizes are measured by `npm run size` (published files) and `node benchmark/size.js` (bundle comparison).

## 1.4.0

- **React support:** `CozyEventProvider`, `useCozyEvent` and an instance registry. Special thanks to [jeangq24](https://github.com/jeangq24).

## 1.2.0

- Performance improvement: 22x faster than v1.1.0, according to the v1 benchmarks.

## 1.1.0

- Performance improvement: 4x faster than v1.0, according to the v1 benchmarks.
