<p align="center">
  <img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/banner.png" alt="CozyEvent v2" width="800">
</p>

<p align="center">
  <b>A tiny, fast, typed event emitter for JavaScript and TypeScript.</b><br>
  430 bytes · zero dependencies · no <code>eval</code> · optional React hook
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/cozyevent"><img src="https://img.shields.io/npm/v/cozyevent" alt="npm"></a>
  <a href="https://bundlephobia.com/result?p=cozyevent"><img src="https://img.shields.io/bundlephobia/minzip/cozyevent?label=bundle%20size" alt="bundle size"></a>
  <img src="https://img.shields.io/badge/coverage-100%25-brightgreen" alt="coverage">
  <a href="https://github.com/RecursiveVoid/CozyEvent/blob/main/LICENSE"><img src="https://img.shields.io/github/license/RecursiveVoid/CozyEvent" alt="license"></a>
  <a href="https://www.npmjs.com/package/cozyevent"><img src="https://img.shields.io/npm/dt/cozyevent.svg" alt="downloads"></a>
</p>

```ts
import { CozyEvent } from 'cozyevent';

const events = new CozyEvent<{ ping: number }>();

const off = events.on('ping', (n) => console.log('ping', n));
events.emit('ping', 1); // ping 1
off();
```

<table>
  <tr>
    <td align="center" width="20%"><img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/icon-tiny.png" width="64" alt=""><br><b>Tiny</b><br><sub>430 B min+gzip,<br>zero dependencies</sub></td>
    <td align="center" width="20%"><img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/icon-fast.png" width="64" alt=""><br><b>Fast</b><br><sub>#1 of the CSP-safe emitters<br>in most benchmarks</sub></td>
    <td align="center" width="20%"><img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/icon-typed.png" width="64" alt=""><br><b>Typed</b><br><sub>event names and payloads<br>checked by TypeScript</sub></td>
    <td align="center" width="20%"><img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/icon-safe.png" width="64" alt=""><br><b>Safe</b><br><sub>no <code>eval</code>, strict-CSP ready,<br>any event name works</sub></td>
    <td align="center" width="20%"><img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/icon-react.png" width="64" alt=""><br><b>React</b><br><sub>one optional hook,<br>136 B</sub></td>
  </tr>
</table>

**COZY** stands for **C**ompact, **O**n-point, **Z**ero-overhead, **Y**et-powerful: a small family of TypeScript libraries for everyday needs. No bloat, just performance.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Guide](#guide)
  - [Typed events](#typed-events)
  - [Listening once](#listening-once)
  - [Unsubscribing](#unsubscribing)
  - [Async emit](#async-emit)
  - [Extending CozyEvent](#extending-cozyevent)
  - [React](#react)
- [API reference](#api-reference)
- [Behaviour in detail](#behaviour-in-detail)
- [Why is it so fast?](#why-is-it-so-fast)
- [Why is it so small?](#why-is-it-so-small)
- [Benchmarks](#benchmarks)
- [Size comparison](#size-comparison)
- [FAQ](#faq)
- [Migrating from v1](#migrating-from-v1)
- [Changelog](#changelog) · [License](#license)

## Install

```sh
npm install cozyevent
# or
yarn add cozyevent
# or
pnpm add cozyevent
```

There is one package. The core never imports React, so non-React projects never download or need it.

Works in Node.js 14+ and every modern browser: anything with class fields, `?.` / `??` and `queueMicrotask`. ESM and CommonJS builds are both included, with TypeScript types for each.

## Quick start

```ts
import { CozyEvent } from 'cozyevent';
// CommonJS: const { CozyEvent } = require('cozyevent');

const emitter = new CozyEvent();

const unsubscribe = emitter.on('message', (text) => {
  console.log(`Received: ${text}`);
});

emitter.once('ready', () => console.log('Ready (only logged once)'));

emitter.emit('ready');
emitter.emit('message', 'Hello, World!');
emitter.emitAsync('message', 'Hello from a microtask');

unsubscribe();
```

## Guide

### Typed events

Pass an event map as the type parameter. Each key is an event name and its value is the payload type. Use `void` for events without a payload.

```ts
import { CozyEvent } from 'cozyevent';

interface User {
  id: string;
  name: string;
}

const auth = new CozyEvent<{
  login: User;
  logout: void;
}>();

auth.on('login', (user) => console.log(`Hi ${user.name}`)); // user: User
auth.on('logout', () => console.log('Bye'));

auth.emit('login', { id: '1', name: 'Ada' }); // OK
auth.emit('logout'); // OK
// auth.emit('login', 42);    // type error: 42 is not a User
// auth.emit('sign-in', ...); // type error: unknown event
```

Without a type parameter, any string is an event name and payloads are `any`. The `Listener` type is exported too:

```ts
import type { Listener } from 'cozyevent';

const onLogin: Listener<User> = (user) => console.log(user.id);
```

### Listening once

`once` listeners run on the next emit and are removed **before** they run, so they never run twice, not even when the listener emits the same event again.

```ts
const onInit = () => console.log('Initialized');
const cancel = emitter.once('init', onInit);

// Either of these removes it before it has run:
cancel();
emitter.off('init', onInit); // the original function works too
```

### Unsubscribing

`on` and `once` return an unsubscribe function. It removes exactly that registration, and calling it again does nothing.

```ts
const stop = emitter.on('tick', render);
stop(); // removed
stop(); // no-op
```

`off(event, listener)` works too. It removes the **most recently added** registration of that function, whether it was added with `on` or `once`. To clear everything:

```ts
emitter.removeAllListeners('chat'); // one event
emitter.removeAllListeners(); // every event
```

### Async emit

`emitAsync` takes a snapshot of the listeners right away and calls them later, in one microtask.

```ts
emitter.emitAsync('data', { id: 1 });
console.log('this logs first');
```

It schedules nothing when the event has no listeners, and it never throws because listeners were removed in the meantime.

### Extending CozyEvent

Subclass it, with or without a constructor of your own:

```ts
import { CozyEvent } from 'cozyevent';

class Task extends CozyEvent<{ progress: number; done: string }> {
  run() {
    this.emit('progress', 50);
    this.emit('done', 'Task completed');
  }
}

const task = new Task();
task.on('progress', (pct) => console.log(`${pct}%`));
task.on('done', (message) => console.log(message));
task.run();
```

> CozyEvent reserves four internal names: `_e` (listener storage), `_k` (the event emptied last), the helper method `_r`, and `_T` (a type-only marker that lets TypeScript infer a subclass's event map). Don't define, read or write them in a subclass; TypeScript reports an error if you redeclare one. Overriding public methods such as `off` is fine, because `once` and the unsubscribe functions don't go through them.

### React

React support is a single hook in the `cozyevent/react` subpath. React is an **optional peer dependency** (`>=16.8.0`), needed only if you import this subpath. There is no provider, context or registry: create an emitter anywhere, usually at module level, and pass it in.

```tsx
// events.ts
import { CozyEvent } from 'cozyevent';

export const appEvents = new CozyEvent<{
  notify: string;
  'cart:add': { id: string; qty: number };
}>();
```

```tsx
// Toasts.tsx
import { useState } from 'react';
import { useCozyEvent } from 'cozyevent/react';
import { appEvents } from './events';

export function Toasts() {
  const [messages, setMessages] = useState<string[]>([]);

  // Inline listeners are fine: the hook does not resubscribe on re-render.
  useCozyEvent(appEvents, 'notify', (text) => {
    setMessages((m) => [...m, text]);
  });

  return <ul>{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>;
}
```

```tsx
// AddToCart.tsx
import { appEvents } from './events';

export function AddToCart({ id }: { id: string }) {
  return <button onClick={() => appEvents.emit('cart:add', { id, qty: 1 })}>Add to cart</button>;
}
```

How the hook works:

- It subscribes in `useEffect`, keyed on `[emitter, event]`, and unsubscribes on unmount, or when either of them changes.
- The latest `listener` is kept in a ref, so every emit calls the current listener and an inline arrow function never causes a resubscribe.
- It doesn't use `useLayoutEffect`, so it is safe with server rendering, and it leaves exactly one live subscription under `StrictMode`.

## API reference

```ts
type Listener<T = any> = (payload: T) => void;

class CozyEvent<Events extends Record<string, any> = Record<string, any>> {
  on(event, listener): () => void;
  once(event, listener): () => void;
  off(event, listener): void;
  emit(event, payload?): void;
  emitAsync(event, payload?): void;
  removeAllListeners(event?): void;
}

// cozyevent/react
function useCozyEvent(emitter, event, listener): void;
```

| Method | Returns | What it does |
|---|---|---|
| `on(event, listener)` | unsubscribe function | Calls `listener` on every emit of `event`. Registering the same function twice runs it twice. |
| `once(event, listener)` | unsubscribe function | Calls `listener` on the next emit only. It is removed before it runs. |
| `off(event, listener)` | `void` | Removes the most recently added registration of `listener` (from `on` or `once`). Unknown event or listener: nothing happens. |
| `emit(event, payload?)` | `void` | Calls the listeners synchronously, in registration order, with `payload`. |
| `emitAsync(event, payload?)` | `void` | Snapshots the listeners now and calls them in one microtask. |
| `removeAllListeners(event?)` | `void` | Removes the listeners of `event`, or of every event when called without an argument. `''` is a normal event name. |

## Behaviour in detail

- **One argument.** Listeners get exactly one argument, the payload. Extra arguments are dropped, so to send several values pass an object: `emit('move', { x, y })`.
- **Order.** Listeners run in the order they were registered, with `on` and `once` listeners mixed in that order.
- **Snapshots.** An emit calls the listeners that were registered when it started.
  - A listener added during an emit is **not** called in that emit.
  - A listener removed during an emit that has **not run yet still runs** in that emit. Later emits don't call it.
  - A nested `emit` inside a listener uses the listeners registered at that moment.
  - `emitAsync` takes its snapshot when it is called. Listeners removed before the microtask still run, except `once` listeners that have already run; listeners added before it don't run.
- **`this`.** Listeners are called as plain functions: `this` is `undefined` in strict-mode code (`globalThis` in sloppy scripts), never the emitter. Use arrow functions or `bind`.
- **Errors.** There is no try/catch. If a listener throws, the listeners after it are skipped and the error reaches the caller of `emit`. In `emitAsync` the error is uncaught inside the microtask.
- **Any event name.** `'__proto__'`, `'constructor'`, `'toString'`, `'hasOwnProperty'` and `''` all work like any other name.
- **Memory.** When an event loses its last listener, its entry isn't deleted right away. It is marked empty, and deleted when the next event is emptied, unless it got listeners again in between. Each emitter keeps **at most one** empty entry, however many dynamic event names it goes through, so memory doesn't grow without limit. `removeAllListeners(event)` deletes an entry at once, and `removeAllListeners()` drops all storage. (Why? See [delayed cleanup](#why-is-it-so-fast) below.)

## Why is it so fast?

<p align="center">
  <img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/chart-speed.png" alt="emit with 10 different listeners, million ops/s: cozyevent v2 82.2, tseep CSP-safe 21.0, nanoevents 20.5, emitix 19.7, @braintree 18.6, eventemitter3 17.8, node:events 15.3, cozyevent v1 11.2; tseep with eval 96.5 (not CSP-safe)" width="800">
</p>

An `emit` is mostly "look up a list, call each function". The trick is making each of those steps as cheap as the JavaScript engine allows, **without generating code at runtime**. Every technique below was kept only after it won an interleaved A/B benchmark (see [`benchmark/ab.js`](https://github.com/RecursiveVoid/CozyEvent/blob/main/benchmark/ab.js)).

**1. A dedicated call site for each of the first 12 listeners.**
V8 remembers, per call site, which function was called there (its *inline cache*). If one loop calls ten different listeners, that single call site sees ten different functions, becomes *megamorphic*, and V8 stops inlining. CozyEvent calls the first 12 listeners from 12 separate call sites, then continues with a six-wide loop:

```
listener 1  → call site 1   (always sees the same function → monomorphic, inlinable)
listener 2  → call site 2
   …
listener 12 → call site 12
listener 13+ → six-wide loop
```

This is why CozyEvent is about 4x faster than other CSP-safe emitters when every listener is a different function, which is what real apps do. Libraries like tseep get the same effect by generating code with `new Function`, which a strict Content Security Policy blocks. CozyEvent's call sites are ordinary code.

**2. A flat record array.**
Each event's listeners live in one flat array, `[listener, token, listener, token, …]`. There is no wrapper object per registration, so `emit` reads each function straight out of the array.

**3. Zero allocations per emit, snapshots for free.**
Listener arrays are append-only while in use: `on` pushes in place, and a removal replaces the array with a copy (*copy-on-write*). An emit only remembers the array and its length when it starts, and that pair *is* the snapshot. Nothing is copied or allocated on `emit`.

**4. Cheap unsubscribe.**
The unsubscribe function is a bound method with a numeric token, not a new closure capturing the listener. Removing scans from the end of the array, and the copy is a plain `slice` plus a shift, which measured 1.3x to 2x faster than `splice` or `filter`.

**5. Delayed cleanup.**
Deleting an object property and adding it back, which is exactly what `once` + `emit` in a loop does, makes V8 rebuild how it stores that object. CozyEvent keeps the emptied entry as an empty marker instead of deleting it straight away, and cleans it up when the next event empties. That made `once` about **2.8x faster**, while memory stays bounded to one empty entry per emitter.

**6. One microtask per `emitAsync`.**
`emitAsync` schedules a single `queueMicrotask` for the whole snapshot, not one per listener, and no Promise.

**7. Safe storage that is also fast.**
Storage objects share one empty, null-prototype object as their prototype. That makes names like `__proto__` safe with no extra checks, and creating an emitter cheap (1.7x faster than v1).

## Why is it so small?

<p align="center">
  <img src="https://raw.githubusercontent.com/RecursiveVoid/CozyEvent/main/assets/chart-size.png" alt="bundle size of libraries with once, gzip bytes: cozyevent v2 456, emitix 951, eventemitter3 1112, event-emitter 1920, tseep 3514, eventemitter2 5691; cozyevent v1 269 (has bugs)" width="800">
</p>

- **One class, no dependencies, no runtime helpers.** The whole core is one file.
- **Compression-friendly code.** The 12 call sites are written as identical source text (`(0, a[i])(p)` after `i += 2`), so gzip stores the pattern once. That spelling alone saved 52 bytes after gzip.
- **React lives elsewhere.** The hook is a separate 136-byte entry point (`cozyevent/react`), so core users never pay for it.
- **Bytes are measured, not guessed.** Every change was checked with `npm run size`, and among equally fast designs the smallest one won.

Of the emitters measured that support `once`, CozyEvent v2 is the smallest. Only its own v1 is smaller, and v1 had bugs that v2 fixes.

## Benchmarks

Measured on Apple M4 (10 cores), Node v22.14.0 (V8 12.4.254.21-node.22), Darwin 25.5.0 arm64, 2026-09-18. Each library and scenario ran in its own process, 3 rounds in round-robin order, benchmark.js with maxTime 0.5 s. The machine was not idle, so treat differences under about 10% as noise.

Millions of ops/s, median of 3 isolated runs. Higher is better, and the fastest in each row is in bold. "–" means the library has no such feature. "No codegen" leaves out tseep's default build, which generates code with `new Function` and can't run under a strict Content Security Policy.

| scenario | **cozyevent v2** | cozyevent v1.4.2 | tseep | tseep (CSP-safe build) | nanoevents | emitix | @braintree/ event-emitter | eventemitter3 | eventemitter2 | node:events | v2 rank | v2 rank, no codegen |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|:-:|
| emit, 0 listeners | 239 | 216 | 240 | 255 | 161 | 235 | **264** | 160 | 137 | 95.7 | 4 of 13 | 3 of 12 |
| emit, 1 listener | **162** | 95.5 | 161 | 152 | 153 | 152 | 90.6 | 85.0 | 90.3 | 84.8 | 1 of 13 | 1 of 12 |
| emit, 3 listeners | 141 | 84.8 | **163** | 104 | 105 | 101 | 88.8 | 43.2 | 31.9 | 42.2 | 2 of 13 | 1 of 12 |
| emit, 3 distinct listeners | 142 | 38.3 | **154** | 58.8 | 61.8 | 50.6 | 48.8 | 44.8 | 31.5 | 40.6 | 2 of 13 | 1 of 12 |
| emit, 10 listeners | 101 | 49.0 | **111** | 58.7 | 61.7 | 33.0 | 42.3 | 17.0 | 11.2 | 15.4 | 2 of 13 | 1 of 12 |
| emit, 10 distinct listeners | 82.2 | 11.2 | **96.5** | 21.0 | 20.5 | 19.7 | 18.6 | 17.8 | 15.0 | 15.3 | 2 of 13 | 1 of 12 |
| emit, 100 listeners | 8.09 | 6.47 | **21.4** | 7.40 | 7.73 | 4.42 | 6.51 | 1.76 | 1.53 | 1.68 | 2 of 13 | 1 of 12 |
| app bus: 20 events, 1-3 listeners each | 45.3 | 39.2 | 50.8 | 55.4 | **58.1** | 48.8 | 48.0 | 33.9 | 36.1 | 47.4 | 7 of 13 | 6 of 12 |
| on + off (5 other listeners) | **56.5** | 39.8 | 21.6 | 33.0 | 38.4 | 39.1 | 41.6 | 43.6 | 26.4 | 37.8 | 1 of 13 | 1 of 12 |
| once + emit | 48.9 | 12.3 | **136** | 102 | 29.1 | 21.6 | 24.0 | 16.5 | 12.5 | 13.4 | 3 of 13 | 2 of 12 |
| emitAsync, 10 listeners | **13.1** | 12.2 | – | – | – | – | – | – | 1.64 | – | 1 of 3 | 1 of 3 |
| new emitter + on + emit | 82.7 | 46.9 | 10.5 | 13.6 | 43.6 | **83.6** | 65.7 | 59.2 | 60.8 | 17.9 | 2 of 13 | 2 of 12 |

mitt, @protobufjs/eventemitter and event-emitter were measured too; they are in the [full results](https://github.com/RecursiveVoid/CozyEvent/blob/main/benchmark/reports/results.md). "Distinct" rows use a different listener function per registration, and the other emit rows register copies of one function. In `on + off`, v2 calls `off(event, fn)`; with the returned unsubscribe function it measures 47.8M ops/s. Libraries without `once` get a small userland wrapper in the `once` row. eventemitter2's `emitAsync` returns a Promise, which is a different contract.

### Summary

Isolated medians can move 10% or more between runs, so this summary comes from interleaved A/B runs (`node benchmark/ab.js`, 5 rounds, every library once per round in a fresh process, rotating order). Ratios within about 5% are noise.

- **Where v2 is fastest.** Of the libraries that don't generate code, v2 is **first** at `emit` with 3, 10 and 100 listeners, `on` + `off` and `emitAsync`.
  - With 3 and 10 listeners, the next libraries (nanoevents and tseep's CSP-safe build) reach 0.58 to 0.71 of v2's speed with copies of one function, and 0.18 to 0.39 with distinct functions.
  - With 100 listeners, the next is @braintree/event-emitter at 0.86, then tseep's CSP-safe build (0.84), nanoevents (0.82) and v1.4.2 (0.80).
  - For `on` + `off`, the next is @braintree/event-emitter at 0.76.
  - v2 **ties** for first with 1 listener, and on the 20-event app bus (within noise of tseep's CSP-safe build and nanoevents). The single isolated run in the table ranked the app bus lower, but the interleaved rounds did not reproduce that gap.
- **Where v2 is behind.**
  - tseep's default build generates a specialised `emit` with `new Function`. That isn't allowed under a strict CSP, and its bundle is 7x larger. It is 2.6x faster with 100 listeners, 1.04x to 1.06x faster with 3 to 10, about as fast with 1, and 3.3x faster at `once`.
  - For `once`, v2 is second of the libraries that don't generate code. tseep's CSP-safe build is 2.2x faster; the next library, nanoevents, reaches 0.73 of v2.
  - Creating an emitter is second to emitix (1.12x).
- **Compared with v1.4.2.** 1.7x faster with 1 listener, 1.8x to 5.9x with 3 and 10 listeners, 1.25x with 100, 1.15x on the app bus and on `on` + `off`, 3.6x on `once`, 1.14x on `emitAsync` and 1.7x on creating an emitter. With no listeners they are equal within noise.

### How benchmarks are run

- **Isolated processes.** Each (library, scenario) pair runs in its own Node process, so JIT state from one library can't affect another.
- **Realistic listener counts.** 0, 1, 3, 10 and 100 listeners, the same or distinct functions, plus an app-style bus with 20 event names, on + off cycles, once + emit, `emitAsync` and creating an emitter. There are no scenarios with millions of listeners.
- **Checked before timing.** Each scenario verifies how many listeners were called before it is measured, then warms up before [benchmark.js](https://benchmarkjs.com/) records ops/s and ±RME.
- **Libraries.** cozyevent v2 and v1.4.2, tseep (default and CSP-safe builds), eventemitter3, eventemitter2, emitix, @braintree/event-emitter, @protobufjs/eventemitter, event-emitter, `node:events`, mitt and nanoevents. mitt and nanoevents aren't in `devDependencies`; they are included automatically when installed.

Run them yourself:

```sh
npm run build
npm run benchmark        # speed, writes benchmark/reports/results.{json,md}
node benchmark/ab.js     # quick interleaved A/B comparison
npm run size             # raw / gzip / brotli bytes of the built files
node benchmark/size.js   # bundle-size comparison, writes benchmark/reports/size.{json,md}
```

Numbers vary by machine. If yours differ, or you'd like a scenario added, [open a benchmark discussion](https://github.com/RecursiveVoid/CozyEvent/discussions/new?category=benchmark).

## Size comparison

Bytes of a rollup + terser ESM bundle of the same small consumer file for each library (create an emitter, `on`, `emit`, `off`), from `node benchmark/size.js` with Node v22.14.0. The consumer code adds about 26 gzip bytes to every row. Smaller is better.

| # | library | min | gzip | brotli | has `once` |
|---|---|--:|--:|--:|:-:|
| 1 | nanoevents | 249 | 184 | 158 | no |
| 2 | mitt | 339 | 203 | 180 | no |
| 3 | cozyevent v1.4.2 (core class only) | 515 | 269 | 245 | yes |
| 4 | @braintree/event-emitter | 637 | 332 | 282 | no |
| 5 | @protobufjs/eventemitter | 753 | 391 | 335 | no |
| 6 | **cozyevent v2** | **1241** | **456** | **411** | yes |
| 7 | emitix | 2253 | 951 | 853 | yes |
| 8 | eventemitter3 | 2958 | 1112 | 1004 | yes |
| 9 | event-emitter | 4819 | 1920 | 1733 | yes |
| 10 | tseep | 18381 | 3514 | 3214 | yes |
| 11 | eventemitter2 | 18670 | 5691 | 5131 | yes |

nanoevents, mitt, @braintree/event-emitter and @protobufjs/eventemitter are smaller, but have no `once` and no `emitAsync`. v1.4.2's core class is smaller too, but has the bugs listed in the [changelog](https://github.com/RecursiveVoid/CozyEvent/blob/main/CHANGELOG.md); v1's main entry as published (with its React code) was 760 bytes gzip.

The published files themselves, from `npm run size`:

| file | min | gzip | brotli |
|---|--:|--:|--:|
| `dist/index.js` (ESM core) | 1191 | 430 | 378 |
| `dist/index.cjs` (CommonJS core) | 1203 | 434 | 382 |
| `dist/react.js` (ESM hook) | 153 | 136 | 119 |
| `dist/react.cjs` (CommonJS hook) | 155 | 134 | 112 |

## FAQ

**Does it work with a strict Content Security Policy?**
Yes. CozyEvent never uses `eval`, `new Function` or WebAssembly.

**Does it work with server rendering?**
Yes. The core has no DOM or browser dependencies, and the React hook only uses `useEffect`.

**Why not WebAssembly or the GPU, to be even faster?**
Listeners are JavaScript functions. WebAssembly and GPU shaders can't call them directly, so every listener call would cross a boundary that costs more than the whole `emit` does today. The speed comes from giving the JavaScript engine code it can optimise well.

**tseep is faster in some rows. Why not do what it does?**
tseep's default build generates a custom `emit` with `new Function`, which strict-CSP sites block, and its bundle is about 7x larger. CozyEvent gets most of the same benefit with fixed call sites (see [Why is it so fast?](#why-is-it-so-fast)).

**Why don't listeners receive multiple arguments?**
One argument keeps every call site identical and fast, and types simpler. Pass an object for several values.

**Can I catch errors thrown by listeners?**
Wrap your listener in a try/catch, or wrap the `emit` call. CozyEvent doesn't catch errors itself, so they surface right where they happen.

## Migrating from v1

v2 is a breaking release. In short:

- **React:** `CozyEventProvider`, `CozyEventContext`, the instance registry (`registerCozyEventInstance`, `getCozyEventInstanceById`), the global instance and namespaces are gone. Import `useCozyEvent` from `cozyevent/react` and pass the emitter: `useCozyEvent(emitter, 'auth:login', cb)`.
- **Install:** plain `npm install cozyevent`. The `latest-light` tag is no longer needed.
- `on` and `once` now return an unsubscribe function. This doesn't break existing code.
- `off` removes one registration (the most recently added one), and can now remove `once` listeners.
- `removeAllListeners('')` now clears only the `''` event.

See **[MIGRATION.md](https://github.com/RecursiveVoid/CozyEvent/blob/main/MIGRATION.md)** for before/after code covering every change.

## Changelog

See **[CHANGELOG.md](https://github.com/RecursiveVoid/CozyEvent/blob/main/CHANGELOG.md)**.

## License

Copyright (c) 2025 Mehmet Ergin Turk. Licensed under the [MIT license](https://github.com/RecursiveVoid/CozyEvent/blob/main/LICENSE).

X / Twitter: [@papa_alpha_papa](https://x.com/papa_alpha_papa) · Mastodon: [@papa_alpha_papa](https://mastodon.social/@papa_alpha_papa) · Bluesky: [@erginturk.bsky.social](https://bsky.app/profile/erginturk.bsky.social)
