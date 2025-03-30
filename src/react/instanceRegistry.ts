import { CozyEvent } from '../core/CozyEvent';

const instanceRegistry: Record<string, CozyEvent> = {};

/**
 * Registers a CozyEvent instance with a given ID.
 * @param id - The unique identifier for the instance.
 * @param instance - The CozyEvent instance to register.
 */
export const registerCozyEventInstance = (id: string, instance: CozyEvent) => {
  instanceRegistry[id] = instance;
};

/**
 * Retrieves a CozyEvent instance by its ID. If no instance is found, returns undefined.
 * @param id - The unique identifier for the instance.
 * @returns The CozyEvent instance associated with the ID, or undefined if not found.
 */
export const getCozyEventInstanceById = (id: string): CozyEvent | undefined => {
  return instanceRegistry[id];
};
