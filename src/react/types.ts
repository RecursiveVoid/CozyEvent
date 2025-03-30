import { CozyEvent } from '../core/CozyEvent';
/**
 * Props for the `CozyEventProvider` component.
 */
export interface CozyEventProviderProps {
  /**
  * An optional instance of `CozyEvent` to be used as the event emitter.
  * If not provided, a global instance will be used by default.
  */
  instance?: CozyEvent;
  /**
  * The child components or elements to be rendered within the provider.
  */
  children: React.ReactNode;
}