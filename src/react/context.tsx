import { createContext } from 'react';
import { CozyEvent } from '../core/CozyEvent';

/**
 * React context for providing a CozyEvent instance to components.
 * 
 * This context allows components to access a CozyEvent instance, enabling
 * event-driven communication within the application. If no instance is provided,
 * the context will default to `null`.
 * 
 * @see CozyEventProvider - The provider component that supplies the context value.
 * @see useCozyEvent - A hook for consuming the context and subscribing to events.
 */
export const CozyEventContext = createContext<CozyEvent | null>(null);

