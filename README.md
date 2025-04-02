![](https://i.imgur.com/lU4VqXb.png)

# CozyEvent — World's fastest, Lightweight Event Emitter also for React

![npm](https://img.shields.io/npm/v/cozyevent)
[![Build Size](https://img.shields.io/bundlephobia/minzip/cozyevent?label=bundle%20size)](https://bundlephobia.com/result?p=cozyevent)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/github/license/RecursiveVoid/CozyEvent)
[![Downloads](https://img.shields.io/npm/dt/cozyevent.svg?style=flat-square)](https://www.npmjs.com/package/cozyevent)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)]()
[![withlove](https://img.shields.io/badge/made_with-love_<3-ff69b4.svg?style=flat-square)]()
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

A **lightweight** ; only **341 Bytes** (bundle size), might be the **worlds fastest**, microtask-based asynchronous and synchronous event emitter for JavaScript/TypeScript. Also for [**REACT**](#cozyevent-react-integration)! Check the [benchmark results below](#benchmark-results)!

### Whats COZY stands for;

COZY stands for Compact, On-point, Zero-overhead, Yet-powerful.

A fine-tailored ecosystem of TypeScript libraries designed for your everyday needs—lightweight, efficient, and built to get the job done. No bloat, just pure performance. 🚀

## Change log

- v.1.4.0: **React Support**; CozyEvent has now react support! (Special thanks to [jeangq24 ](https://github.com/jeangq24))
- v.1.2.0: Performance improvement; **22x faster** than v.1.1.0 (see the [benchmark below](#benchmark-results))
- v1.1.0: Performance improvement; **4x faster** than version v1.0 (see the benchmark bellow)

## Features

- Supports both **synchronous** and **asynchronous (microtask-based)** event emission.
- Allows **multiple listeners** per event.
- Provides **once** event handling.
- Enables **removal** of specific or all event listeners.
- Designed for performance with a **minimal footprint**.

## Installation

You can install CozyEvent via npm or yarn:

```sh
npm install cozyevent
```

or

```sh
yarn add cozyevent
```

## Usage

### Importing CozyEvent

#### ESModule

```typescript
import { CozyEvent } from 'cozyevent';
```

#### CommonJS

```javascript
const { CozyEvent } = require('cozyevent');
```

### Creating an Event Emitter

```typescript
const eventEmitter = new CozyEvent();
```

### Registering Event Handlers

#### `on(event: string, handler: EventHandler): void`

Registers an event listener that triggers every time the event is emitted.

```typescript
eventEmitter.on('message', (msg) => {
  console.log(`Received: ${msg}`);
});
```

#### `once(event: string, handler: EventHandler): void`

Registers an event listener that triggers only once.

```typescript
eventEmitter.once('init', () => {
  console.log('Initialization complete!');
});
```

### Emitting Events

#### `emit(event: string, ...args: any[]): void`

Emits a sync event.

```typescript
eventEmitter.emit('message', 'Hello, World!');
```

#### `emitAsync(event: string, ...args: any[]): void`

Emits an async event emission using microtasks.

```typescript
eventEmitter.emitAsync('data', { id: 1, name: 'John Doe' });
```

### Removing Event Listeners

#### `off(event: string, handler: EventHandler): void`

Removes a specific event listener.

```typescript
const handler = (msg) => console.log(msg);
eventEmitter.on('chat', handler);
eventEmitter.off('chat', handler);
```

#### `removeAllListeners(event?: string): void`

Removes all listeners for a specific event or all events if no event is specified. This method replaces the previous `destroy` method, as it now handles the same functionality.

```typescript
eventEmitter.removeAllListeners('chat');
```

### Extending CozyEvent

You can extend `CozyEvent` in your own class to create a custom event-driven system:

```typescript
class SomeClass extends CozyEvent {
  doSomething() {
    console.log('Doing something...');
    this.emit('done', 'Task completed');
  }
}

const instance = new SomeClass();
instance.on('done', (message) => {
  console.log(`Received: ${message}`);
});

instance.doSomething();
```

### Destroying the Event Emitter (Deprecated)

#### `destroy(): void`

> **Deprecated:** This method has been replaced by `removeAllListeners()`. Use `removeAllListeners()` to achieve the same functionality.

```typescript
// Deprecated
eventEmitter.destroy();

// Recommended
eventEmitter.removeAllListeners();
```

## CozyEvent React Integration

CozyEvent provides seamless React integration through:

- `CozyEventProvider` (Context Provider)
- `useCozyEvent` (Custom Hook)
- Centralized Instance Registry

This allows declarative event management in React applications, supporting multiple instances and automatic event cleanup.

### Installation

```sh
npm install cozyevent
```

or

```sh
yarn add cozyevent
```

---

## Components & Hooks

### `CozyEventProvider`

A React context provider that supplies a `CozyEvent` instance to child components.

#### Props:

- `instance?`: Custom `CozyEvent` instance (defaults to global instance).
- `children`: Child components with event access.
- `id?`: Identifier for managing multiple instances (default: `'default'`).

#### Example:

```tsx
import { CozyEventProvider } from 'cozyevent';

const App = () => (
  <CozyEventProvider>
    <MyComponent />
  </CozyEventProvider>
);
```

---

### `useCozyEvent`

A hook for subscribing to events from the nearest `CozyEventProvider`.

#### Parameters:

- `eventName`: Event name (required).
- `callback`: Function executed when the event is emitted (required).
- `options?`:
  - `namespace?`: Scope event subscription.
  - `id?`: Target a specific `CozyEventProvider`.

#### Returns:

- `CozyEvent` instance.

#### Example:

```tsx
import { useCozyEvent } from 'cozyevent';

const EventListener = () => {
  useCozyEvent('message', (data) => {
    console.log('Received:', data);
  });

  return <div>Listening...</div>;
};
```

---

## Centralized Instance Registry

Manages multiple `CozyEvent` instances globally.

### `registerCozyEventInstance(id: string, instance: CozyEvent)`

Registers an instance.

> **Note:** You don't need to manually register the instance before creating the `CozyEventProvider`. The provider will automatically register the instance with the given `id`.

```tsx
import { registerCozyEventInstance, CozyEvent } from 'cozyevent';

const emitter = new CozyEvent();
registerCozyEventInstance('custom', emitter);
```

### `getCozyEventInstanceById(id: string): CozyEvent | undefined`

Retrieves an instance.

```tsx
import { getCozyEventInstanceById } from 'cozyevent';

const emitter = getCozyEventInstanceById('custom');
emitter?.emit('event', 'Hello!');
```

## Usage Examples

### **Basic Usage**

```tsx
import React from 'react';
import { CozyEventProvider, useCozyEvent } from 'cozyevent';

const EventEmitter = () => {
  const emitEvent = () => {
    getCozyEventInstanceById('default')?.emit('test-event', 'Hello!');
  };
  return <button onClick={emitEvent}>Emit Event</button>;
};

const EventListener = () => {
  useCozyEvent('test-event', (message) => alert(message));
  return <div>Listening for events...</div>;
};

const App = () => (
  <CozyEventProvider>
    <EventEmitter />
    <EventListener />
  </CozyEventProvider>
);

export default App;
```

---

### **Using Namespaces**

```tsx
useCozyEvent('user-login', (data) => console.log('Logged in:', data), {
  namespace: 'auth',
});
```

---

### **Multiple Instances**

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
```

```tsx
const AuthModule = () => {
  useCozyEvent('login', (data) => console.log('User:', data), { id: 'auth' });
  return <div>Auth Module</div>;
};
```

```tsx
const NotificationModule = () => {
  useCozyEvent('new-message', (msg) => console.log('Message:', msg), {
    id: 'notifications',
  });
  return <div>Notifications</div>;
};
```

---

### **Global Instance Fallback**

If `CozyEventProvider` is missing, `useCozyEvent` falls back to the global instance.

```tsx
useCozyEvent('global-event', (data) => console.log('Global event:', data));
```

## Best Practices

✅ **Use meaningful event names** to avoid conflicts.  
✅ **Leverage namespaces** for better organization.  
✅ **Let `useCozyEvent` handle cleanup** (no manual unsubscriptions).  
✅ **Use custom instances** for modularity.  
✅ **Assign `id` to providers** for debugging.  
✅ **Utilize the registry** for easy instance management.

## Benchmark Results

### `Emit:`

The following are the benchmark results for 1,000,000 listeners (from fastest to slowest):

| Library                     | Operation | Rate (ops/sec) | Variability (%) | Runs Sampled |
| --------------------------- | --------- | -------------- | --------------- | ------------ |
| **cozyEvent**               | emit      | 4,095          | ±0.80%          | 94           |
| **tseep**                   | emit      | 3,587          | ±1.85%          | 91           |
| **braintree-event-emitter** | emit      | 3,431          | ±3.43%          | 85           |
| **emitix**                  | emit      | 461            | ±2.41%          | 84           |
| **eventemitter3**           | emit      | 180            | ±1.89%          | 83           |
| **eventemitter2**           | emit      | 150            | ±2.45%          | 76           |
| **node-event-emitter**      | emit      | 120            | ±4.22%          | 70           |
| **protobufjs-eventemitter** | emit      | 119            | ±0.70%          | 77           |
| **event-emitter**           | emit      | 91.98          | ±3.25%          | 68           |

### `On:`

| Library                     |   ops/sec | Variability (%) | Runs Sampled |
| --------------------------- | --------: | --------------: | -----------: |
| **cozyEvent**               | 7,048,823 |         ±23.01% |           44 |
| **tseep**                   | 6,699,486 |         ±22.93% |           58 |
| **eventemitter2**           | 4,759,473 |         ±32.42% |           48 |
| **eventemitter3**           | 2,760,536 |         ±34.21% |           47 |
| **braintree-event-emitter** | 2,493,323 |         ±25.56% |           34 |
| **event-emitter**           | 1,578,055 |         ±29.92% |           35 |
| **protobufjs-eventemitter** | 1,533,468 |         ±62.37% |           18 |
| **emitix**                  |   886,668 |         ±65.42% |           20 |
| **node-event-emitter**      |   116,289 |         ±12.12% |           18 |

### `Once:`

| Library                |   ops/sec | Variability (%) | Runs Sampled |
| ---------------------- | --------: | --------------: | -----------: |
| **tseep**              | 7,025,903 |         ±19.21% |           49 |
| **cozyEvent**          | 3,161,190 |         ±36.82% |           35 |
| **eventemitter2**      | 2,349,562 |         ±28.37% |           42 |
| **eventemitter3**      | 2,247,466 |         ±32.67% |           42 |
| **event-emitter**      |   293,539 |        ±115.29% |           17 |
| **node-event-emitter** |    69,743 |         ±77.57% |           18 |
| **emitix**             |    27,619 |         ±50.74% |            6 |

### `Off:`

| Library                     |     ops/sec | Variability (%) | Runs Sampled |
| --------------------------- | ----------: | --------------: | -----------: |
| **tseep**                   | 241,358,834 |          ±0.43% |           96 |
| **eventemitter3**           | 237,546,830 |          ±0.78% |           90 |
| **emitix**                  |  86,382,491 |          ±1.77% |           93 |
| **protobufjs-eventemitter** |  84,816,381 |          ±0.54% |           99 |
| **cozyEvent**               |  64,156,580 |          ±1.30% |           89 |
| **node-event-emitter**      |  53,750,923 |          ±2.40% |           91 |
| **eventemitter2**           |  47,492,910 |          ±1.99% |           86 |
| **braintree-event-emitter** |  37,476,993 |          ±0.49% |           96 |
| **event-emitter**           |  34,195,978 |          ±0.99% |           96 |

### `RemoveAllListeners`

| Library                |     ops/sec | Variability (%) | Runs Sampled |
| ---------------------- | ----------: | --------------: | -----------: |
| **cozyEvent**          | 174,527,998 |          ±0.86% |           89 |
| **eventemitter3**      | 160,803,376 |          ±2.56% |           91 |
| **eventemitter2**      | 104,917,857 |          ±2.26% |           94 |
| **node-event-emitter** |  26,451,753 |          ±3.37% |           90 |
| **tseep**              |   8,722,096 |          ±2.12% |           93 |

## License

Copyright (c) 2025 Mehmet Ergin Turk

Licensed under the MIT license. See the [LICENSE](LICENSE) file for details.

(Twitter/x: [**@papa_alpha_papa**](https://x.com/papa_alpha_papa)),

(Mastodon: [**@papa_alpha_papa**](https://mastodon.social/@papa_alpha_papa))

(Bluesky: [**@erginturk.bsky.social**](https://bsky.app/profile/erginturk.bsky.social))
