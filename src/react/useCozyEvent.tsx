import { useEffect, useContext } from 'react';
import { CozyEventContext } from './context';
import { globalCozyEventInstance } from './CozyEventProvider'; 


/**
 * A custom React hook for subscribing to events using the CozyEvent system.
 *
 * @param eventName - The name of the event to listen for. Must be a non-empty string.
 * @param callback - The function to execute when the event is emitted. Must be a valid function.
 * @param namespace - (Optional) A namespace to prepend to the event name, separated by a colon (`:`).
 *
 * @returns The event emitter instance being used.
 *
 * @throws {Error} If `eventName` is not a valid non-empty string.
 * @throws {Error} If `callback` is not a valid function.
 *
 * @example
 * ```tsx
 * useCozyEvent('user:login', (data) => {
 *   console.log('User logged in:', data);
 * });
 * ```
 *
 * @remarks
 * This hook automatically registers the event listener when the component mounts
 * and cleans it up when the component unmounts or when dependencies change.
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
  };

  // Validate callback
  if (typeof callback !== 'function') {
    throw new Error('Invalid callback provided to useCozyEvent. It must be a function.');
  };


  const fullEventName = namespace ? `${namespace}:${eventName}` : eventName;

  useEffect(() => {
    emitter.on(fullEventName, callback);
    return () => {
      emitter.off(fullEventName, callback);
    };
  }, [emitter, fullEventName, callback]);

  return emitter;
};