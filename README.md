![](https://i.imgur.com/knSgxwM.png)

# CozyEvent — Fast, Lightweight Event Emitter

![npm](https://img.shields.io/npm/v/cozyevent) ![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen) ![License](https://img.shields.io/github/license/RecursiveVoid/CozyEvent)

A **lightweight**, **blazing fast**, microtask-based asynchronous and synchronous event emitter for JavaScript/TypeScript.

## Change log

- v1.1.0: Performance improvement; 4x faster than version v1.0

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

Removes all listeners for a specific event or all events if no event is specified.

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

### Destroying the Event Emitter

#### `destroy(): void`

Removes all listeners and cleans up the event emitter.

```typescript
eventEmitter.destroy();
```

## License

Copyright (c) 2025 Mehmet Ergin Turk

Licensed under the MIT license. See the [LICENSE](LICENSE) file for details.

(Twitter/x: [**@papa_alpha_papa**](https://x.com/papa_alpha_papa)),

(Mastodon: [**@papa_alpha_papa**](https://mastodon.social/@papa_alpha_papa))

(Bluesky: [**@erginturk.bsky.social**](https://bsky.app/profile/erginturk.bsky.social))

## Author

Developed with ❤️ by M.Ergin Turk
