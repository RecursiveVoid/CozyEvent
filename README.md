![](https://i.imgur.com/lU4VqXb.png)

# CozyEvent

**A tiny, fast, typed event emitter.**

![npm](https://img.shields.io/npm/v/cozyevent)
[![Build Size](https://img.shields.io/bundlephobia/minzip/cozyevent?label=bundle%20size)](https://bundlephobia.com/result?p=cozyevent)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/github/license/RecursiveVoid/CozyEvent)
[![Downloads](https://img.shields.io/npm/dt/cozyevent.svg?style=flat-square)](https://www.npmjs.com/package/cozyevent)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)]()
[![withlove](https://img.shields.io/badge/made_with-love_<3-ff69b4.svg?style=flat-square)]()
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

A typed sync and async (microtask) event emitter for JavaScript and TypeScript. The core is 448 bytes min+gzip (ESM build; 452 for CommonJS), has zero dependencies, and adds an optional one-hook React binding. See the [size](#size-comparison) and [benchmark](#benchmarks) tables.

```ts
import { CozyEvent } from 'cozyevent';

const events = new CozyEvent<{ ping: number }>();
const off = events.on('ping', (n) => console.log('ping', n));
events.emit('ping', 1);
off();
```

### What COZY stands for

COZY stands for Compact, On-point, Zero-overhead, Yet-powerful.

A fine-tailored ecosystem of TypeScript libraries designed for your everyday needs: lightweight, efficient, and built to get the job done. No bloat, just pure performance. 🚀

## Contents

- [Why CozyEvent](#why-cozyevent)
- [Install](#install)
- [Quick start](#quick-start)
- [Typed events](#typed-events)
- [API reference](#api-reference)
- [Extending CozyEvent](#extending-cozyevent)
- [React](#react)
- [Size comparison](#size-comparison)
- [Benchmarks](#benchmarks)
- [Migrating from v1](#migrating-from-v1)
- [Changelog](#changelog)
- [License](#license)

## Why CozyEvent

- **Tiny.** The core is a single class with no dependencies: 448 bytes min+gzip. Of the libraries we measured that support `once`, only the (buggy) v1 core produces a smaller bundle; see [Size comparison](#size-comparison).
- **Fast, without code generation.** No `eval` or `new Function`, so it works under a strict Content Security Policy. In our benchmarks it is the fastest library that does not generate code for `emit` with 1 (tied), 3 and 10 listeners, for an app-style bus with 20 event names, for `on` + `off`, and for `emitAsync`. Only tseep's default build, which generates code with `new Function`, is faster at `emit` with 3 to 10 listeners (and about as fast with 1). Compared with v1.4.2 it is 1.6x to 5.9x faster at `emit` with 1 to 10 listeners. It is not the fastest at everything: `emit` with 100 listeners, `once` and creating emitters are slower than the best libraries. See [Benchmarks](#benchmarks).
- **Typed.** Describe your events once with `CozyEvent<{ login: User }>`. After that, event names, payloads and listeners are all type-checked.
- **Zero dependencies.** The core package contains no React code and does not import React. React support is a separate subpath, and React is an optional peer dependency.
- **Safe with any event name.** `'__proto__'`, `'constructor'`, `'toString'`, `'hasOwnProperty'` and `''` all work like any other event name.
- **Predictable.** `on` and `once` return an unsubscribe function. `once` listeners can also be removed with `off`. Snapshot semantics are documented, and so is what happens when a listener throws.

## Install

```sh
npm install cozyevent
```

```sh
yarn add cozyevent
```

```sh
pnpm add cozyevent
```

There is one package and one tag. Core users never download or need React.

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

## Typed events

Pass an event map as the type parameter. Each key is an event name and its value is the payload type. Use `void` for events that have no payload.

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

Without a type parameter, `CozyEvent` accepts any string event name and `any` payload.

The `Listener` type is exported too:

```ts
import type { Listener } from 'cozyevent';

const onLogin: Listener<User> = (user) => console.log(user.id);
```

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
```

### `on(event, listener): () => void`

Registers a listener that runs every time `event` is emitted and returns a function that removes it.

```ts
const unsubscribe = emitter.on('message', (text) => console.log(text));
unsubscribe(); // removes this registration
unsubscribe(); // does nothing
```

- If you add the same function twice, it is registered twice and runs twice for each emit.
- Listeners run in the order they were registered, with `on` and `once` listeners mixed in that order.
- Calling the returned function again does nothing, and so does calling it after `off` or `removeAllListeners` already removed the listener. It never removes a different registration of the same function.

### `once(event, listener): () => void`

Registers a listener that runs at most once and returns a function that removes it.

```ts
const onInit = () => console.log('Initialized');
const cancel = emitter.once('init', onInit);

// Either of these removes it before it runs:
cancel();
emitter.off('init', onInit); // pass the original listener
```

- The listener is removed **before** it runs. If it emits the same event again, it is not called a second time, and it stays removed even if it throws.
- It never runs more than once, even when it was captured by several `emitAsync` calls.

### `off(event, listener): void`

Removes **one** registration of `listener`, the one added most recently. This works for listeners added with either `on` or `once`. If the event or the listener is unknown, nothing happens.

```ts
const handler = (text: string) => console.log(text);
emitter.on('chat', handler);
emitter.off('chat', handler);
```

### `emit(event, payload?): void`

Calls every listener for `event` synchronously with `payload`.

```ts
emitter.emit('message', 'Hello, World!');
```

- Listeners get **exactly one argument**. Extra arguments are dropped. To send several values, pass an object: `emit('move', { x, y })`.
- Emitting an event that has no listeners does nothing.
- **Snapshot semantics:** `emit` uses the listener list as it was when `emit` was called.
  - A listener added during an emit is **not** called in that emit.
  - A listener removed during an emit that has **not run yet still runs** in that emit. Later emits do not call it.
  - A nested `emit` inside a listener uses the listeners registered at the moment of the nested call.
- **`this`:** listeners are called as plain functions, so `this` is `undefined` in strict-mode code (`globalThis` in sloppy-mode scripts), never the emitter. Use arrow functions, or `bind` the listener yourself.
- **Errors:** there is no try/catch. If a listener throws, the listeners after it are skipped and the error is thrown to the caller of `emit`.

### `emitAsync(event, payload?): void`

Works like `emit`, but the listeners run in a single microtask (`queueMicrotask`).

```ts
emitter.emitAsync('data', { id: 1, name: 'John Doe' });
console.log('this logs first');
```

- The listener list and the payload reference are captured **when `emitAsync` is called**:
  - Listeners removed before the microtask runs still run, except `once` listeners that have already run.
  - Listeners added before the microtask runs do not run.
- If the event has no listeners when you call it, no microtask is scheduled.
- It never throws because listeners were removed in the meantime.
- If a listener throws, the error is uncaught inside the microtask, and the remaining listeners of that call are skipped.

### `removeAllListeners(event?): void`

Removes every listener for `event`. With no argument, it removes every listener for every event.

```ts
emitter.removeAllListeners('chat'); // only 'chat'
emitter.removeAllListeners(''); // only the '' event
emitter.removeAllListeners(); // everything
```

Once an event has no listeners left, its entry is deleted from the internal map. Dynamic event names therefore do not cause memory to grow without limit.

## Extending CozyEvent

`CozyEvent` can be subclassed, with or without a constructor of its own.

```ts
import { CozyEvent } from 'cozyevent';

type TaskEvents = {
  progress: number;
  done: string;
};

class Task extends CozyEvent<TaskEvents> {
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

> CozyEvent reserves four internal names: `_e`, which holds the listeners, the helper methods `_a` and `_r`, and `_T`, a type-only marker (no JavaScript) that lets TypeScript infer the event map of a subclass. Do not define, read or write any of them in a subclass; TypeScript reports an error if a subclass redeclares one. Overriding public methods such as `off` is fine: `once` and the unsubscribe functions do not go through them.

## React

React support is a single hook in the `cozyevent/react` subpath:

```ts
import { useCozyEvent } from 'cozyevent/react';

useCozyEvent(emitter, event, listener): void
```

- React is an **optional peer dependency** (`>=16.8.0`). Only install it if you use `cozyevent/react`.
- The core (`cozyevent`) **never imports React**, and `cozyevent/react` has no runtime import of the core.
- There is no provider, context or registry. Create an emitter at module level (or anywhere you like) and pass it to the hook.

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

  return (
    <ul>
      {messages.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  );
}
```

```tsx
// AddToCart.tsx
import { appEvents } from './events';

export function AddToCart({ id }: { id: string }) {
  return (
    <button onClick={() => appEvents.emit('cart:add', { id, qty: 1 })}>
      Add to cart
    </button>
  );
}
```

How the hook works:

- It subscribes in `useEffect`, keyed on `[emitter, event]`, and unsubscribes on unmount.
- If `emitter` or `event` changes, it unsubscribes from the old one and subscribes to the new one.
- The latest `listener` is kept in a ref. Every emit calls the current listener, so an inline arrow function does not trigger a resubscribe.
- It does not use `useLayoutEffect`, so it is safe with server rendering. It works under `StrictMode`, leaving exactly one live subscription.

## Size comparison

All sizes are in bytes: minified, gzip (zlib level 9) and brotli (Node default, quality 11). Smaller is better.

| # | library | min | gzip | brotli | has `once` |
|---|---|--:|--:|--:|:-:|
| 1 | nanoevents | 249 | 184 | 158 | no |
| 2 | mitt | 339 | 203 | 180 | no |
| 3 | cozyevent v1.4.2 (core class only) | 515 | 269 | 245 | yes |
| 4 | @braintree/event-emitter | 637 | 332 | 282 | no |
| 5 | @protobufjs/eventemitter | 753 | 391 | 335 | no |
| 6 | **cozyevent v2** | **976** | **474** | **416** | yes |
| 7 | emitix | 2253 | 951 | 853 | yes |
| 8 | eventemitter3 | 2958 | 1112 | 1004 | yes |
| 9 | event-emitter | 4819 | 1920 | 1733 | yes |
| 10 | tseep | 18381 | 3514 | 3214 | yes |
| 11 | eventemitter2 | 18670 | 5691 | 5131 | yes |

Bytes of a rollup + terser ESM bundle of the same small consumer file for each library (create an emitter, `on`, `emit`, `off`), produced by `node benchmark/size.js` with Node v22.14.0. The consumer code itself adds about 26 gzip bytes to every row. nanoevents, mitt, @braintree/event-emitter and @protobufjs/eventemitter are smaller but have no `once` and no `emitAsync`. v1.4.2's core class is smaller too, but it has the bugs listed in the [changelog](CHANGELOG.md); v1's main entry as published (with its React code) was 760 bytes gzip. v2 spends its extra bytes on bug fixes, unsubscribe functions and a faster `emit` (see [Benchmarks](#benchmarks)). mitt and nanoevents are not in `devDependencies`; the size and speed scripts include them only when they are installed. Full results: [`benchmark/reports/size.md`](benchmark/reports/size.md).

The published files themselves, from `npm run size`:

| file | min | gzip | brotli |
|---|--:|--:|--:|
| `dist/index.js` (ESM core) | 926 | 448 | 386 |
| `dist/index.cjs` (CommonJS core) | 938 | 452 | 390 |
| `dist/react.js` (ESM hook) | 153 | 136 | 119 |
| `dist/react.cjs` (CommonJS hook) | 155 | 134 | 112 |

## Benchmarks

Measured on Apple M4 (10 cores), Node v22.14.0 (V8 12.4.254.21-node.22), Darwin 25.5.0 arm64, 2026-09-17. Each library and scenario ran in its own process, 3 rounds in round-robin order, benchmark.js with maxTime 0.5s. The machine was not idle, so treat differences under about 10% as noise.

Millions of ops/s, median of 3 isolated runs. Higher is better; the fastest in each row is in bold. "–" means the library has no such feature. The rank columns count all 13 libraries measured (mitt, @protobufjs/eventemitter and event-emitter are in [`results.md`](benchmark/reports/results.md) but not in this table); "no codegen" leaves out tseep's default build, which generates code with `new Function` and cannot run under a strict Content Security Policy.

| scenario | **cozyevent v2** | cozyevent v1.4.2 | tseep | tseep (CSP-safe build) | nanoevents | emitix | @braintree/ event-emitter | eventemitter3 | eventemitter2 | node:events | v2 rank | v2 rank, no codegen |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|:-:|:-:|
| emit, 0 listeners | 240 | **261** | 255 | 249 | 179 | 258 | 255 | 165 | 146 | 113 | 7 of 13 | 6 of 12 |
| emit, 1 listener | 169 | 104 | **177** | 165 | 165 | 169 | 102 | 102 | 98.3 | 108 | 2 of 13 | 1 of 12 |
| emit, 3 listeners | 156 | 98.6 | **172** | 116 | 115 | 104 | 96.2 | 49.7 | 34.7 | 45.6 | 2 of 13 | 1 of 12 |
| emit, 3 distinct listeners | 160 | 55.7 | **173** | 64.9 | 66.5 | 56.5 | 53.6 | 45.4 | 35.6 | 45.9 | 2 of 13 | 1 of 12 |
| emit, 10 listeners | 92.7 | 58.0 | **119** | 64.4 | 63.3 | 49.7 | 48.3 | 18.7 | 16.2 | 16.9 | 2 of 13 | 1 of 12 |
| emit, 10 distinct listeners | 91.6 | 15.4 | **98.6** | 19.7 | 22.5 | 17.7 | 13.8 | 17.2 | 13.8 | 17.4 | 2 of 13 | 1 of 12 |
| emit, 100 listeners | 8.21 | 8.62 | **23.1** | 8.41 | 9.00 | 6.35 | 9.44 | 2.11 | 2.01 | 2.04 | 6 of 13 | 5 of 12 |
| app bus: 20 events, 1-3 listeners each | **59.3** | 52.2 | 58.5 | 58.5 | 57.1 | 47.2 | 37.7 | 35.1 | 37.1 | 49.4 | 1 of 13 | 1 of 12 |
| on + off (5 other listeners) | **57.8** | 48.4 | 21.3 | 32.0 | 40.3 | 32.8 | 40.9 | 30.9 | 19.4 | 42.6 | 1 of 13 | 1 of 12 |
| once + emit | 16.9 | 11.1 | **133** | 96.0 | 39.0 | 20.2 | 21.3 | 14.6 | 10.8 | 16.4 | 8 of 13 | 7 of 12 |
| emitAsync, 10 listeners | **15.0** | 14.0 | – | – | – | – | – | – | 1.84 | – | 1 of 3 | 1 of 3 |
| new emitter + on + emit | 90.8 | 55.7 | 12.2 | 16.3 | 46.0 | **101** | 66.1 | 73.3 | 68.4 | 20.2 | 2 of 13 | 2 of 12 |

The ±RME of every run and the full per-scenario rankings are in [`benchmark/reports/results.md`](benchmark/reports/results.md). "Distinct" rows use a different listener function per registration; the other emit rows register copies of one function. In `on + off`, cozyevent v2 calls `off(event, fn)`; with the returned unsubscribe function instead it measures 55.8M ops/s. nanoevents, mitt, @braintree/event-emitter and @protobufjs/eventemitter have no `once`, so their `once` row uses a small userland wrapper. eventemitter2's `emitAsync` returns a Promise, which is a different contract.

In short:

- **Where v2 is fastest:** among libraries that do not generate code, v2 is first for `emit` with 1 listener (tied with emitix, tseep's CSP-safe build and nanoevents), 3 and 10 listeners (1.3x to 4.1x ahead of the next one; the gap is largest with distinct listener functions), and it is first overall for the 20-event app bus (narrowly: tseep and nanoevents are within 4%), `on` + `off` and `emitAsync`.
- **Where v2 is behind:** tseep's default build generates a specialised `emit` with `new Function` (not allowed under a strict Content Security Policy, and a 7x larger bundle), so it is faster at `emit` with 3 to 100 listeners, about as fast with 1, and about 8x faster at `once`. `once` is mid-table, `emit` with 100 listeners is slightly behind @braintree/event-emitter, nanoevents, v1 and tseep's CSP-safe build, and creating an emitter is second to emitix. With no listeners, the top seven libraries are within noise of each other.
- **Compared with v1.4.2:** 1.6x faster with 1 listener, 1.6x to 5.9x faster with 3 and 10 listeners, 1.1x on the app bus, 1.2x on `on` + `off`, 1.5x on `once` and 1.6x on creating an emitter. `emitAsync` is within noise (1.07x), and so is `emit` with 0 or 100 listeners, where v1 measured slightly higher (0.92x and 0.95x).

### How benchmarks are run

- **Isolated processes:** each (library, scenario) pair runs in its own child Node process, one after another, with the same Node flags. JIT state from one library cannot affect another.
- **Realistic listener counts:** scenarios use 0, 1, 3, 10 and 100 listeners, with the same or distinct listener functions, plus an app-style bus with 20 event names. They also cover on+off cycles, once+emit, `emitAsync` with 10 listeners and creating an emitter. There are no scenarios with millions of listeners.
- **Warmup included.** Each case warms up before [benchmark.js](https://benchmarkjs.com/) records ops/sec and ±RME.
- **Compared:** cozyevent v2, cozyevent v1.4.2, tseep (default and CSP-safe builds), eventemitter3, eventemitter2, emitix, @braintree/event-emitter, @protobufjs/eventemitter, event-emitter, `node:events`, mitt and nanoevents. mitt and nanoevents are not in `devDependencies`; they are picked up automatically when installed.
- Raw results are in `benchmark/reports/results.json` and `benchmark/reports/results.md`.

Run the benchmarks yourself:

```sh
npm run build
npm run benchmark   # speed, writes benchmark/reports/results.{json,md}
npm run size        # raw / gzip-9 / brotli bytes of the built dist files
node benchmark/size.js   # bundle-size comparison, writes benchmark/reports/size.{json,md}
```

Numbers vary by machine. If you get different results, or want a scenario added, [open a benchmark discussion](https://github.com/RecursiveVoid/CozyEvent/discussions/new?category=benchmark).

## Migrating from v1

v2 is a breaking release. In short:

- **React:** `CozyEventProvider`, `CozyEventContext`, the instance registry (`registerCozyEventInstance`, `getCozyEventInstanceById`), the global instance and namespaces are gone. Import `useCozyEvent` from `cozyevent/react` and pass the emitter: `useCozyEvent(emitter, 'auth:login', cb)`.
- **Install:** use plain `npm install cozyevent`. The `latest-light` tag is no longer needed.
- `on` and `once` now return an unsubscribe function. This does not break existing code.
- `off` removes one registration (the most recently added one), and it can now remove `once` listeners.
- `removeAllListeners('')` now clears only the `''` event.

See **[MIGRATION.md](MIGRATION.md)** for before/after code covering every change.

## Changelog

See **[CHANGELOG.md](CHANGELOG.md)**.

## License

Copyright (c) 2025 Mehmet Ergin Turk

Licensed under the MIT license. See the [LICENSE](LICENSE) file for details.

(Twitter/x: [**@papa_alpha_papa**](https://x.com/papa_alpha_papa)),

(Mastodon: [**@papa_alpha_papa**](https://mastodon.social/@papa_alpha_papa))

(Bluesky: [**@erginturk.bsky.social**](https://bsky.app/profile/erginturk.bsky.social))
