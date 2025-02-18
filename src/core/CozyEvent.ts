import { EventHandler } from './types/EventHandler';

class CozyEvent {
  private _events: Map<string, EventHandler[]>;

  constructor(useMicrotask: boolean = false) {
    this._events = new Map();
    this.emit = useMicrotask ? this._emitAsMicrotask : this._emit;
  }

  public on(event: string, handler: EventHandler): void {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event)!.push(handler);
  }

  public once(event: string, handler: EventHandler): void {
    const onceWrapper: EventHandler = (...args) => {
      this.off(event, onceWrapper);
      handler(...args);
    };
    this.on(event, onceWrapper);
  }

  public off(event: string, handler: EventHandler): void {
    if (this._events.has(event)) {
      this._events.set(
        event,
        this._events.get(event)!.filter((h) => h !== handler)
      );
    }
  }

  public removeAllListeners(event?: string): void {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
      this._events = null;
    }
  }

  public emit(event: string, ...args: any[]): void {}

  private _emit(event: string, ...args: any[]): void {
    if (this._events.has(event)) {
      this._events.get(event)!.forEach((handler) => handler(...args));
    }
  }

  public emitAsync(event: string, ...args: any[]): void {
    this._emitAsMicrotask(event, ...args)
  }

  private _emitAsMicrotask(event: string, ...args: any[]): void {
    if (this._events.has(event)) {
      queueMicrotask(() => {
        this._events.get(event)!.forEach((handler) => handler(...args));
      });
    }
  }

  public destroy() {
    this.removeAllListeners();
  }
}

export { CozyEvent };
