import { useEffect, useContext, useMemo, useCallback } from 'react';
import { CozyEventContext } from './context';
import { globalCozyEventInstance } from './CozyEventProvider';

/**
 * A custom React hook for subscribing to events using the CozyEvent system.
 */
/**
 * A custom React hook for subscribing to and handling events in the CozyEvent system.
 *
 * @param {string} eventName - The name of the event to listen for. Must be a non-empty string.
 * @param {(data: any) => void} callback - The function to be called when the event is triggered.
 *                                         Receives the event data as its argument.
 * @param {string} [namespace] - An optional namespace to scope the event. If provided, the full event name
 *                                will be constructed as `namespace:eventName`.
 * 
 * @returns {CozyEventEmitter} - The event emitter instance used for managing events.
 *
 * @throws {Error} If `eventName` is not a valid non-empty string.
 * @throws {Error} If `callback` is not a valid function.
 *
 * @example
 * // Usage example
 * useCozyEvent('user:login', (data) => {
 *   console.log('User logged in:', data);
 * });
 *
 * @example
 * // Usage with namespace
 * useCozyEvent('update', (data) => {
 *   console.log('Update event:', data);
 * }, 'app');
 */
export const useCozyEvent = (
  eventName: string,
  callback: (data: any) => void,
  namespace?: string
) => {
  const emitter = useContext(CozyEventContext) || globalCozyEventInstance;

  // Validate eventName
  if (typeof eventName !== 'string' || eventName.trim() === '') {
    throw new Error('Invalid eventName provided to useCozyEvent. It must be a non-empty string.');
  }

  // Validate callback
  if (typeof callback !== 'function') {
    throw new Error('Invalid callback provided to useCozyEvent. It must be a function.');
  }

  // Memorize the full event name
  const fullEventName = useMemo(
    () => (namespace ? `${namespace}:${eventName}` : eventName),
    [namespace, eventName]
  );

  // Memorize the callback to avoid unnecessary re-registrations
  const stableCallback = useCallback(callback, [callback]);

  useEffect(() => {
    emitter.on(fullEventName, stableCallback);
    return () => {
      emitter.off(fullEventName, stableCallback);
    };
  }, [emitter, fullEventName, stableCallback]);

  return emitter;
};
