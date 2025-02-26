import { EventHandler } from './types/EventHandler';

class CozyEvent {
  private _events: Record<string, EventHandler[]>;

  public emit: (event: string, ...args: any[]) => void;
  public emitAsync: (event: string, ...args: any[]) => void;
  public emitSync: (event: string, ...args: any[]) => void;

  constructor(useMicrotask: boolean = false) {
    this._events = Object.create(null);
    this.emit = useMicrotask ? this._emitAsMicrotask : this._emitSync;
    this.emitAsync = this._emitAsMicrotask;
    this.emitSync = this._emitSync;
  }

  public on(event: string, handler: EventHandler): void {
    if (!this._events[event]) {
      this._events[event] = [handler];
    } else {
      this._events[event].push(handler);
    }
  }

  public once(event: string, handler: EventHandler): void {
    const onceWrapper: EventHandler = (...args) => {
      this.off(event, onceWrapper);
      handler(...args);
    };
    this.on(event, onceWrapper);
  }

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

  public removeAllListeners(event?: string): void {
    if (event) {
      if (this._events[event]) {
        delete this._events[event];
      }
    } else {
      this._events = Object.create(null);
    }
  }
  private _emitSync(event: string, ...args: any[]): void {
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

  private _emitAsMicrotask(event: string, ...args: any[]): void {
    const handlers = this._events[event];
    if (!handlers) return;
    queueMicrotask(() => {
      for (let i = 0; i < handlers.length; i++) {
        handlers[i](...args);
      }
    });
  }

  public destroy(): void {
    this.removeAllListeners();
  }
}

export { CozyEvent };
