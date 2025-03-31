import { useEffect, useContext, useMemo, useCallback } from 'react';
import { CozyEventContext } from './context';
import { globalCozyEventInstance } from './CozyEventProvider';
import { getCozyEventInstanceById } from './instanceRegistry';
import { UseCozyEventOptions } from './types';

/**
 * A custom React hook for subscribing to and handling events in the CozyEvent system.
 *
 * @param {string} eventName - The name of the event to listen for. Must be a non-empty string.
 * @param {(data: any) => void} callback - The function to be called when the event is triggered.
 * @param {UseCozyEventOptions} [options] - Optional parameters to scope the event.
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
 * }, { namespace: 'app' });
 * 
 * @example
 * // Usage with namespace and ID
 * useCozyEvent('update', (data) => {
 *   console.log('Update event:', data);
 * }, { namespace: 'app', id: 'unique-id' });
 */
export const useCozyEvent = <T = any> (
  eventName: string,
  callback: (data: any) => void,
  options?: UseCozyEventOptions
) => {
  
  const { namespace, id } = options || {};
  const emitter = id
  ? getCozyEventInstanceById(id)
  : useContext(CozyEventContext) || globalCozyEventInstance;

  // Validate the emitter
  if (!emitter) {
    throw new Error(`No CozyEvent instance found for id: ${id}`);
  }

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
