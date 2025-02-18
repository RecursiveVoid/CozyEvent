/**
 * Represents an event handler function that can accept any number of arguments.
 *
 * @callback EventHandler
 * @param {...any} args - The arguments passed to the event handler.
 */
 export type EventHandler = (...args: any[]) => void;
