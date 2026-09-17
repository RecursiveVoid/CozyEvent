# Migrating from CozyEvent v1 to v2

v2.0.0 is a breaking release. The core emitter API stays almost the same. The React integration was rewritten as a single hook in its own subpath.

If you only use `CozyEvent` without React, most of your code keeps working. Check [Behavior changes](#behavior-changes-core) anyway.

## Contents

1. [Install: no more `latest-light` tag](#1-install-no-more-latest-light-tag)
2. [React import path changed](#2-react-import-path-changed)
3. [`CozyEventProvider` removed: use a module-level emitter](#3-cozyeventprovider-removed-use-a-module-level-emitter)
4. [`useCozyEvent` signature changed](#4-usecozyevent-signature-changed)
5. [Namespaces removed](#5-namespaces-removed)
6. [Multiple providers / `id` option removed](#6-multiple-providers--id-option-removed)
7. [Instance registry removed](#7-instance-registry-removed)
8. [`CozyEventContext` and the global instance removed](#8-cozyeventcontext-and-the-global-instance-removed)
9. [`on` / `once` now return an unsubscribe function (non-breaking)](#9-on--once-now-return-an-unsubscribe-function-non-breaking)
10. [`once` listeners can be removed with `off`](#10-once-listeners-can-be-removed-with-off)
11. [Behavior changes (core)](#behavior-changes-core)
12. [TypeScript: typed events](#typescript-typed-events)
13. [Checklist](#checklist)

---

## 1. Install: no more `latest-light` tag

v1 had a React-free "light" build under a separate dist-tag. In v2 the main package contains no React code, so there is only one install command.

**Before**

```sh
npm install cozyevent@latest-light
```

**After**

```sh
npm install cozyevent
```

React is now an **optional peer dependency** (`>=16.8.0`). You only need it if you import `cozyevent/react`.

## 2. React import path changed

The main entry `cozyevent` no longer exports anything related to React. The hook is available only from `cozyevent/react`.

**Before**

```ts
import { CozyEvent, useCozyEvent, CozyEventProvider } from 'cozyevent';
```

**After**

```ts
import { CozyEvent } from 'cozyevent';
import { useCozyEvent } from 'cozyevent/react';
```

## 3. `CozyEventProvider` removed: use a module-level emitter

In v2 there is no provider or context. Create an emitter in a module and import it wherever you need it.

**Before**

```tsx
import { CozyEventProvider, useCozyEvent, getCozyEventInstanceById } from 'cozyevent';

const Sender = () => (
  <button onClick={() => getCozyEventInstanceById('default')?.emit('test-event', 'Hello!')}>
    Emit
  </button>
);

const Receiver = () => {
  useCozyEvent('test-event', (message) => alert(message));
  return <div>Listening...</div>;
};

export const App = () => (
  <CozyEventProvider>
    <Sender />
    <Receiver />
  </CozyEventProvider>
);
```

**After**

```tsx
// events.ts
import { CozyEvent } from 'cozyevent';
// List every event you use. The later examples in this guide use these names too.
export const appEvents = new CozyEvent<{
  'test-event': string;
  message: unknown;
  other: number;
  'auth:user-login': unknown;
  'global-event': unknown;
}>();
```

```tsx
// App.tsx
import { useCozyEvent } from 'cozyevent/react';
import { appEvents } from './events';

const Sender = () => (
  <button onClick={() => appEvents.emit('test-event', 'Hello!')}>Emit</button>
);

const Receiver = () => {
  useCozyEvent(appEvents, 'test-event', (message) => alert(message));
  return <div>Listening...</div>;
};

export const App = () => (
  <>
    <Sender />
    <Receiver />
  </>
);
```

If you passed a custom instance (`<CozyEventProvider instance={myEmitter}>`), pass `myEmitter` straight to `useCozyEvent` instead.

If you really need a different emitter for each subtree (for example in tests), put the emitter in your own React context and read it with `useContext` before calling `useCozyEvent(emitter, ...)`. CozyEvent no longer ships a context for this.

## 4. `useCozyEvent` signature changed

| | v1 | v2 |
|---|---|---|
| Signature | `useCozyEvent(eventName, callback, { id?, namespace? })` | `useCozyEvent(emitter, event, listener)` |
| Emitter source | nearest provider, `id` from the registry, or the global instance | the `emitter` argument |
| Return value | the `CozyEvent` instance | `void` |
| Runtime validation | threw on an empty event name or a non-function callback | none (TypeScript checks the types) |
| Resubscribe on re-render with an inline callback | yes (bug) | no, the latest listener is kept in a ref |

**Before**

```tsx
const emitter = useCozyEvent('message', (data) => console.log(data));
emitter.emit('other', 1);
```

**After**

```tsx
import { appEvents } from './events';

useCozyEvent(appEvents, 'message', (data) => console.log(data));
appEvents.emit('other', 1);
```

## 5. Namespaces removed

In v1, `namespace` was joined to the event name as `` `${namespace}:${eventName}` ``. In v2 you put the prefix in the event name yourself. The event name ends up exactly the same, so emitters that already emit `'auth:user-login'` keep working.

**Before**

```tsx
useCozyEvent('user-login', (data) => console.log('Logged in:', data), {
  namespace: 'auth',
});
```

**After**

```tsx
useCozyEvent(appEvents, 'auth:user-login', (data) => console.log('Logged in:', data));
```

## 6. Multiple providers / `id` option removed

**Before**

```tsx
const App = () => (
  <>
    <CozyEventProvider id="auth">
      <AuthModule />
    </CozyEventProvider>
    <CozyEventProvider id="notifications">
      <NotificationModule />
    </CozyEventProvider>
  </>
);

const AuthModule = () => {
  useCozyEvent('login', (user) => console.log('User:', user), { id: 'auth' });
  return <div>Auth</div>;
};
```

**After**

```tsx
// events.ts
import { CozyEvent } from 'cozyevent';
export const authEvents = new CozyEvent<{ login: User }>();
export const notificationEvents = new CozyEvent<{ 'new-message': string }>();
```

```tsx
import { useCozyEvent } from 'cozyevent/react';
import { authEvents } from './events';

const App = () => (
  <>
    <AuthModule />
    <NotificationModule />
  </>
);

const AuthModule = () => {
  useCozyEvent(authEvents, 'login', (user) => console.log('User:', user));
  return <div>Auth</div>;
};
```

## 7. Instance registry removed

`registerCozyEventInstance` and `getCozyEventInstanceById` are gone. Export your emitter from a module instead. ES modules are singletons, so every importer gets the same instance.

**Before**

```ts
import { CozyEvent, registerCozyEventInstance, getCozyEventInstanceById } from 'cozyevent';

registerCozyEventInstance('custom', new CozyEvent());

// somewhere else
getCozyEventInstanceById('custom')?.emit('event', 'Hello!');
```

**After**

```ts
// custom-events.ts
import { CozyEvent } from 'cozyevent';
export const customEvents = new CozyEvent();
```

```ts
// somewhere else
import { customEvents } from './custom-events';
customEvents.emit('event', 'Hello!');
```

If your IDs really are dynamic, keep your own `Map<string, CozyEvent>`:

```ts
const emitters = new Map<string, CozyEvent>();
export const getEmitter = (id: string) => {
  let e = emitters.get(id);
  if (!e) emitters.set(id, (e = new CozyEvent()));
  return e;
};
```

## 8. `CozyEventContext` and the global instance removed

`CozyEventContext` and the implicit global fallback instance (used by `useCozyEvent` when no provider was found; it was never exported) no longer exist.

**Before**

```tsx
import { useContext } from 'react';
import { CozyEventContext } from 'cozyevent';

const emitter = useContext(CozyEventContext);
useCozyEvent('global-event', (data) => console.log(data)); // fell back to the global instance
```

**After**

```tsx
import { appEvents } from './events'; // your own module-level emitter

useCozyEvent(appEvents, 'global-event', (data) => console.log(data));
```

## 9. `on` / `once` now return an unsubscribe function (non-breaking)

In v1, `on` and `once` returned `void`. Existing code keeps working, and you can now remove a listener without keeping a named reference to it.

**Before**

```ts
const handler = (msg: string) => console.log(msg);
emitter.on('chat', handler);
// later
emitter.off('chat', handler);
```

**After** (either style works)

```ts
const unsubscribe = emitter.on('chat', (msg) => console.log(msg));
// later
unsubscribe();
```

Calling the unsubscribe function more than once is safe. It never removes another registration of the same function.

## 10. `once` listeners can be removed with `off`

In v1, `once` wrapped your listener internally, so `off(event, listener)` silently did nothing. In v2 it removes the listener.

**Before** (v1 bug)

```ts
const onReady = () => console.log('ready');
emitter.once('ready', onReady);
emitter.off('ready', onReady); // did NOT remove it
emitter.emit('ready'); // logged "ready"
```

**After**

```ts
const onReady = () => console.log('ready');
emitter.once('ready', onReady);
emitter.off('ready', onReady); // removed
emitter.emit('ready'); // nothing

// or
const cancel = emitter.once('ready', onReady);
cancel();
```

---

## Behavior changes (core)

These changes are unlikely to affect typical code, but check them if you rely on edge cases.

### `off` removes one registration, not all of them

In v1, `off(event, fn)` removed **every** registration of `fn`. In v2 it removes **one**, the most recently added one. This matches `node:events`.

**Before**

```ts
emitter.on('tick', fn);
emitter.on('tick', fn);
emitter.off('tick', fn); // v1: both removed
```

**After**

```ts
emitter.on('tick', fn);
emitter.on('tick', fn);
emitter.off('tick', fn); // v2: one removed, fn still runs once per emit
emitter.off('tick', fn); // now none

// or remove the whole event:
emitter.removeAllListeners('tick');
```

### `removeAllListeners('')` only clears the `''` event

In v1, an empty string was falsy and cleared **all** events. In v2 only `removeAllListeners()` with no argument (or `undefined`) clears everything.

```ts
emitter.removeAllListeners(''); // v1: everything  |  v2: only the '' event
emitter.removeAllListeners(); // both: everything
```

### Any event name is safe

In v1, event names that exist on `Object.prototype` crashed:

```ts
emitter.emit('toString'); // v1: TypeError "forEach is not a function"
emitter.on('constructor', cb); // v1: TypeError "push is not a function"
```

In v2 these, along with `'__proto__'`, `'hasOwnProperty'` and `'valueOf'`, behave like any other event name.

### `emitAsync` snapshots listeners at call time

In v1, `emitAsync` looked up listeners **inside** the microtask. If they had been removed in the meantime, it threw `Cannot read properties of undefined`, and listeners added in the meantime would run. In v2 the listener list is captured when `emitAsync` is called:

```ts
emitter.on('save', handler);
emitter.emitAsync('save', doc);
emitter.off('save', handler);
// v1: throws inside the microtask
// v2: handler still runs once with doc (it was registered when emitAsync was called)
```

### Snapshot semantics during `emit`

- Listeners added during an emit are not called in that emit.
- Listeners removed during an emit that have not run yet still run in that emit.

### `once` is removed before it runs

In v1, a `once` listener was removed **after** it ran, so a listener that threw stayed registered, and a nested emit of the same event called it again. In v2 it is removed before its body runs, and it runs at most once.

### Exactly one payload argument

Listeners get a single `payload` argument, as in v1. Extra arguments passed to `emit` or `emitAsync` are dropped. To send several values, pass an object.

### Internal state

v1 stored listeners in `this._events`. That was never public API, and v2 does not have it. If a subclass read `_events`, keep track of the listeners yourself instead.

v2 reserves four internal names: `_e` (listener storage), `_a` and `_r` (private helpers) and `_T` (a type-only marker that emits no JavaScript). A subclass must not define members with those names. TypeScript reports an error if you redeclare one.

### `this` inside listeners

Unchanged from v1: listeners are called as plain functions, so `this` is `undefined` in strict-mode code (ES modules, classes, TypeScript output) and `globalThis` in sloppy-mode scripts. It is never the emitter. Use arrow functions, or `bind` the listener yourself.

## TypeScript: typed events

This is new and optional. `CozyEvent` takes an event map:

```ts
const auth = new CozyEvent<{ login: User; logout: void }>();

auth.on('login', (user) => user.name); // user: User
auth.emit('logout');
// auth.emit('login', 42); // type error
```

v1 accepted a per-call generic like `on<T>(...)`/`emit<T>(...)`. Those generics are gone. Put the types in the class type parameter instead. `new CozyEvent()` without a type parameter still accepts any event name and payload.

## Checklist

- [ ] `npm install cozyevent` (drop `@latest-light`).
- [ ] Import `useCozyEvent` from `cozyevent/react`.
- [ ] Replace `<CozyEventProvider>` with a module-level `new CozyEvent()`.
- [ ] Change `useCozyEvent(name, cb, opts)` to `useCozyEvent(emitter, name, cb)`, and put `namespace:` into the name.
- [ ] Replace `getCozyEventInstanceById` / `registerCozyEventInstance` with exported emitters.
- [ ] Remove uses of `CozyEventContext`, and stop using the return value of `useCozyEvent`.
- [ ] Check any code that calls `off` expecting it to remove duplicate registrations, or that calls `removeAllListeners('')`.
- [ ] Remove any access to `_events`, and make sure subclasses do not define `_e`, `_a`, `_r` or `_T`.
- [ ] Make sure no listener relies on `this`.
