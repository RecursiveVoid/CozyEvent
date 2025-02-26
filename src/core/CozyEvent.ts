type EventHandler = (...args: any[]) => void;

class CozyEvent {
  private _events: Record<string, EventHandler | EventHandler[]>;
  private _eventsCount: number;

  // private _eventNames: string[];
  // private _eventHandlers: EventHandler[];

  private emit: (event: string, ...args: any[]) => void;

  constructor(useMicrotask: boolean = false) {
    this._events = Object.create(null);
    this._eventsCount = 0;
    this.emit = useMicrotask ? this._emitAsMicrotask : this._emitSync;
  }

  public on(event: string, handler: EventHandler): void {
    const evt = this._events[event];
    if (!evt) {
      this._events[event] = handler;
      this._eventsCount++;
    } else if (typeof evt === 'function') {
      this._events[event] = [evt, handler];
    } else {
      evt.push(handler);
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
    const evt = this._events[event];
    if (!evt) return;
    if (!handler) {
      delete this._events[event];
      this._eventsCount--;
    } else if (typeof evt === 'function') {
      if (evt === handler) {
        delete this._events[event];
        this._eventsCount--;
      }
    } else {
      this._events[event] = evt.filter((h) => h !== handler);
      if (!this._events[event].length) {
        delete this._events[event];
        this._eventsCount--;
      }
    }
  }

  public removeAllListeners(event?: string): void {
    if (event) {
      if (this._events[event]) {
        delete this._events[event];
        this._eventsCount--;
      }
    } else {
      this._events = Object.create(null);
      this._eventsCount = 0;
    }
  }

  private _emitSync(event: string, ...args: any[]): void {
    const evt = this._events[event];
    if (!evt) return;
    if (typeof evt === 'function') {
      evt(...args);
    } else {
      for (let i = 0, len = evt.length; i < len; i++) {
        evt[i](...args);
      }
    }
  }

  private _emitAsMicrotask(event: string, ...args: any[]): void {
    const evt = this._events[event];
    if (!evt) return;
    queueMicrotask(() => {
      if (typeof evt === 'function') {
        evt(...args);
      } else {
        for (let i = 0, len = evt.length; i < len; i++) {
          evt[i](...args);
        }
      }
    });
  }

  public destroy(): void {
    this.removeAllListeners();
  }
}

export { CozyEvent };
