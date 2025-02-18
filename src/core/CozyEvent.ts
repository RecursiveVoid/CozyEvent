// @filename: CozyEvent.ts

/**
 * @import  { EventHandler } from './types/EventHandler'
 */

 import { EventHandler } from './types/EventHandler';

 /**
  * CozyEvent - A simple event emitter class that supports synchronous and microtask-based event emission.
  */
 class CozyEvent {
   /**
    * Stores event handlers mapped by event names.
    * @private
    * @type {Map<string, EventHandler[]>}
    */
   private _events: Map<string, EventHandler[]>;
 
   /**
    * Creates an instance of CozyEvent.
    * @param {boolean} [useMicrotask=false] - Whether to use microtasks for event emission.
    */
   constructor(useMicrotask: boolean = false) {
     this._events = new Map();
     this.emit = useMicrotask ? this._emitAsMicrotask : this._emitSync;
   }
 
   /**
    * Registers an event handler for the specified event.
    * @param {string} event - The event name.
    * @param {EventHandler} handler - The event handler function.
    */
   public on(event: string, handler: EventHandler): void {
     if (!this._events.has(event)) {
       this._events.set(event, []);
     }
     this._events.get(event)!.push(handler);
   }
 
   /**
    * Registers a one-time event handler for the specified event.
    * @param {string} event - The event name.
    * @param {EventHandler} handler - The event handler function.
    */
   public once(event: string, handler: EventHandler): void {
     const onceWrapper: EventHandler = (...args) => {
       this.off(event, onceWrapper);
       handler(...args);
     };
     this.on(event, onceWrapper);
   }
 
   /**
    * Removes a specific event handler for the specified event.
    * @param {string} event - The event name.
    * @param {EventHandler} handler - The event handler function to remove.
    */
   public off(event: string, handler: EventHandler): void {
     if (this._events.has(event)) {
       this._events.set(
         event,
         this._events.get(event)!.filter((h) => h !== handler)
       );
     }
   }
 
   /**
    * Removes all event listeners for the specified event or all events if no event is specified.
    * @param {string} [event] - The event name (optional). If omitted, all listeners are removed.
    */
   public removeAllListeners(event?: string): void {
     if (event) {
       this._events.delete(event);
     } else {
       this._events.clear();
     }
   }
 
   /**
    * Emits an event synchronously.
    * This method is overridden based on the constructor's `useMicrotask` argument.
    * @param {string} event - The event name.
    * @param {...any[]} args - Arguments to pass to event handlers.
    */
   public emit(event: string, ...args: any[]): void {}
 
   /**
    * Emits an event synchronously.
    * @private
    * @param {string} event - The event name.
    * @param {...any[]} args - Arguments to pass to event handlers.
    */
   private _emitSync(event: string, ...args: any[]): void {
     if (this._events.has(event)) {
       this._events.get(event)!.forEach((handler) => handler(...args));
     }
   }
 
   /**
    * Emits an event asynchronously using microtasks.
    * @param {string} event - The event name.
    * @param {...any[]} args - Arguments to pass to event handlers.
    */
   public emitAsync(event: string, ...args: any[]): void {
     this._emitAsMicrotask(event, ...args);
   }

  /**
    * Emits an event synchronously.
    * @param {string} event - The event name.
    * @param {...any[]} args - Arguments to pass to event handlers.
    */
    public emitSync(event: string, ...args: any[]): void {
      this._emitSync(event, ...args);
    }
 
   /**
    * Emits an event asynchronously using microtasks.
    * @private
    * @param {string} event - The event name.
    * @param {...any[]} args - Arguments to pass to event handlers.
    */
   private _emitAsMicrotask(event: string, ...args: any[]): void {
     if (this._events.has(event)) {
       queueMicrotask(() => {
         this._events.get(event)!.forEach((handler) => handler(...args));
       });
     }
   }
 
   /**
    * Destroys the event emitter by removing all event listeners.
    */
   public destroy(): void {
     this.removeAllListeners();
     this._events = null;
   }
 }
 
 export { CozyEvent };
 