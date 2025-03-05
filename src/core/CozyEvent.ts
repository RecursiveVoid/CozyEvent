import { EventHandler } from './types/EventHandler';

/**
 * A simple event emitter class that allows you to register event listeners, emit events, and manage listeners.
 * It supports both synchronous and asynchronous event handling.
 *
 * @example
 * const eventEmitter = new CozyEvent();
 * eventEmitter.on('test', (message) => console.log(message));
 * eventEmitter.emit('test', 'Hello, world!');
 */
class CozyEvent {
  private _events: Record<string, EventHandler[]>;

  /**
   * Creates a new CozyEvent instance with the option to choose asynchronous event handling.
   *
   */
  constructor() {
    this._events = Object.create(null);
  }

  /**
   * Registers an event handler that will be called every time the event is emitted.
   *
   * @param event - The name of the event.
   * @param handler - The callback function to be executed when the event is emitted.
   *
   * @example
   * eventEmitter.on('test', (message) => console.log(message));
   * eventEmitter.emit('test', 'Hello, world!');
   */
  public on(event: string, handler: EventHandler): void {
    if (!this._events[event]) {
      this._events[event] = [handler];
    } else {
      this._events[event].push(handler);
    }
  }

  /**
   * Registers a one-time event handler that will be triggered only the first time the event is emitted.
   * After the event handler is called, it will be removed automatically.
   *
   * @param event - The name of the event.
   * @param handler - The callback function to be executed when the event is emitted.
   *
   * @example
   * eventEmitter.once('test', (message) => console.log(message));
   * eventEmitter.emit('test', 'This will be logged.');
   * eventEmitter.emit('test', 'This will not be logged.');
   */
  public once(event: string, handler: EventHandler): void {
    const onceWrapper: EventHandler = (...args) => {
      this.off(event, onceWrapper);
      handler(...args);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Removes a previously registered event handler. If no handler is provided, all handlers for the event are removed.
   *
   * @param event - The name of the event.
   * @param handler - The callback function to be removed (optional).
   * If omitted, all handlers for the event will be removed.
   *
   * @example
   * eventEmitter.off('test', handler); // Removes a specific handler
   * eventEmitter.off('test'); // Removes all handlers for 'test' event
   */
  public off(event: string, handler?: EventHandler): void {
    const handlers = this._events[event];
    if (!handlers) return;
    if (!handler) {
      delete this._events[event];
      return;
    }

    const filtered = handlers.filter((h) => h !== handler);
    if (filtered.length) {
      this._events[event] = filtered;
    } else {
      delete this._events[event];
    }
  }

  /**
   * Removes all event listeners. Optionally, listeners for a specific event can be removed.
   *
   * @param event - The name of the event to remove listeners for (optional).
   * If omitted, all listeners for all events will be removed.
   *
   * @example
   * eventEmitter.removeAllListeners(); // Removes all listeners
   * eventEmitter.removeAllListeners('test'); // Removes listeners for the 'test' event
   */
  public removeAllListeners(event?: string): void {
    if (event) {
      if (this._events[event]) {
        delete this._events[event];
      }
    } else {
      this._events = Object.create(null);
    }
  }

  /**
   * Emits an event synchronously, calling all registered handlers with the provided arguments.
   *
   * @param event - The name of the event.
   * @param args - Arguments to pass to the event handlers.
   *
   * @example
   * eventEmitter.emit('test', 'Hello, world!');
   */
  public emit(event: string, ...args: any[]): void {
    const handlers = this._events[event];
    if (!handlers) return;
    let i = 0;
    const len = handlers.length;
    for (; i + 3 < len; i += 4) {
      handlers[i](...args);
      handlers[i + 1](...args);
      handlers[i + 2](...args);
      handlers[i + 3](...args);
    }
    for (; i < len; i++) {
      handlers[i](...args);
    }
  }

  /**
   * Emits an event asynchronously using microtasks (next tick).
   *
   * @param event - The name of the event.
   * @param args - Arguments to pass to the event handlers.
   *
   * @example
   * eventEmitter.emitAsync('test', 'Hello, world!');
   */
  public emitAsync(event: string, ...args: any[]): void {
    const handlers = this._events[event];
    if (!handlers) return;
    queueMicrotask(() => {
      for (let i = 0; i < handlers.length; i++) {
        handlers[i](...args);
      }
    });
  }

  public observe<T extends object>(obj: T, callback: () => void): T {
    return this._createReactive(obj, callback, false);
  }

  public observeAsync<T extends object>(obj: T, callback: () => void): T {
    return this._createReactive(obj, callback, true);
  }

  private _createReactive<T extends object>(
    target: T,
    callback: () => void,
    async: boolean
  ): T {
    const self = this;

    function __triggerCallback() {
      if (async) {
        queueMicrotask(callback);
      } else {
        callback();
      }
    }

    function __wrapObject(obj: any): any {
      return new Proxy(obj, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === 'object' && value !== null) {
            return __wrapObject(value);
          }
          return value;
        },
        set(target, prop, value) {
          const oldValue = target[prop];
          if (oldValue !== value) {
            target[prop] = value;
            __triggerCallback();
            self.emit(`observe:${prop.toString()}`, value);
          }
          return true;
        },
      });
    }
    return __wrapObject(target);
  }

  /**
   * Destroys the event emitter and removes all event listeners.
   * This method can be called when you no longer need the event emitter.
   *
   * @example
   * eventEmitter.destroy();
   */
  public destroy(): void {
    this.removeAllListeners();
  }
}

export { CozyEvent };
