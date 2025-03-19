/**
 * A lightweight event emitter class for handling event-driven programming.
 * Supports synchronous and asynchronous event emission, along with event management methods.
 */
type Callback<T = unknown> = (args: T) => void;

class CozyEvent {
  private _events: Record<string, Callback<any>[]> = {};

  /**
   * Registers an event listener that will be called every time the event is emitted.
   *
   * @param event - The name of the event.
   * @param callback - The function to be executed when the event is emitted.
   */
  public on<T>(event: string, callback: Callback<T>): void {
    (this._events[event] ??= []).push(callback);
  }

  /**
   * Registers an event listener that will be called only once when the event is emitted.
   *
   * @param event - The name of the event.
   * @param callback - The function to be executed once when the event is emitted.
   */
  public once<T>(event: string, callback: Callback<T>): void {
    const onceCallback: Callback<T> = (args: T) => {
      callback(args);
      this.off(event, onceCallback); // Automatically remove the listener after it runs once
    };
    this.on(event, onceCallback); // Register the once listener
  }

  /**
   * Removes a specific event listener.
   *
   * @param event - The name of the event.
   * @param callback - The function to remove from the event listeners.
   */
  public off<T>(event: string, callback: Callback<T>): void {
    if (!this._events[event]) return;

    this._events[event] = this._events[event].filter((cb) => cb !== callback);

    if (this._events[event].length === 0) {
      delete this._events[event];
    }
  }

  /**
   * Emits an event synchronously, executing all registered listeners with the provided parameters.
   *
   * @param event - The name of the event to emit.
   * @param params - Optional parameters to pass to the listeners.
   */
  public emit<T>(event: string, params?: T): void {
    this._events[event]?.forEach((callback) => callback(params));
  }

  /**
   * Emits an event asynchronously using the microtask queue.
   *
   * @param event - The name of the event to emit.
   * @param params - Optional parameters to pass to the listeners.
   */
  public emitAsync<T>(event: string, params?: T): void {
    if (!this._events[event]) return;
    queueMicrotask(() => {
      this._events[event].forEach((callback) => callback(params));
    });
  }

  /**
   * Removes all event listeners. Optionally, removes only the listeners for a specific event.
   *
   * @param event - (Optional) The name of the event to remove listeners for.
   */
  public removeAllListeners(event?: string): void {
    event ? delete this._events[event] : this._events = {};
  }
}

export { CozyEvent };
