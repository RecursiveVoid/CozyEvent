import { FC, useMemo, useEffect } from 'react';
import { CozyEvent } from '../core/CozyEvent';
import { CozyEventContext } from './context';
import { CozyEventProviderProps } from './types';
import { registerCozyEventInstance, unregisterCozyEventInstance } from './instanceRegistry';


/**
 * CozyEventProvider is a React context provider that supplies a CozyEvent instance
 * to its child components. It ensures that the provided instance is valid and accessible
 * throughout the component tree.
 *
 * @param {CozyEvent} [instance=globalCozyEventInstance] - An optional instance of CozyEvent. 
 * If not provided, a global instance is used by default.
 * @param {React.ReactNode} children - The child components that will have access to the CozyEvent instance.
 * @returns {JSX.Element} A React context provider wrapping the children with the CozyEvent instance.
 * @throws {Error} If the provided instance is not a valid CozyEvent instance.
 */
export const globalCozyEventInstance = new CozyEvent(); 
export const CozyEventProvider: FC<CozyEventProviderProps> = ({
  instance = globalCozyEventInstance,
  children,
  id = 'default'
}) => {
  
  if (!(instance instanceof CozyEvent)) {
    throw new Error('Invalid CozyEvent instance provided to CozyEventProvider');
  }

   
   useEffect(() => {
    registerCozyEventInstance(id, instance);
    return () => {
      unregisterCozyEventInstance(id);
    };
  }, [id, instance]);
  
  
  const contextValue = useMemo(() => instance, [instance]);

  return (
    <CozyEventContext.Provider value={contextValue}>
      {children}
    </CozyEventContext.Provider>
  );
};