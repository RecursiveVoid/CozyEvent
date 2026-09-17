import { useEffect, useRef } from 'react';
import type { CozyEvent, Listener } from '../index';

/**
 * Subscribes `listener` to `event` on `emitter` for the lifetime of the component.
 *
 * - Subscribes once per `[emitter, event]` pair; an inline arrow `listener` does NOT
 *   cause a resubscription on re-render (the latest listener is kept in a ref).
 * - Unsubscribes on unmount and whenever `emitter` or `event` changes.
 * - SSR-safe (uses `useEffect` only). React 16.8+.
 */
export const useCozyEvent = <
  Events extends Record<string, any>,
  K extends keyof Events & string,
>(emitter: CozyEvent<Events>, event: K, listener: Listener<Events[K]>): void => {
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => emitter.on(event, (payload) => ref.current(payload)), [emitter, event]);
};
