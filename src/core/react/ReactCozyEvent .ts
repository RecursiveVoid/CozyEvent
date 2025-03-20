import { useEffect, useCallback } from 'react';
import { CozyEvent } from '../CozyEvent';

type EventCallback<T = unknown> = (args: T) => void;

const cozyEvent = new CozyEvent();

class ReactCozyEvent {
  static useCozyEvent<T>(event: string, callback: EventCallback<T>) {
    useEffect(() => {
      cozyEvent.on(event, callback);
      return () => {
        cozyEvent.off(event, callback);
      };
    }, [event, callback]);
  }

  static useCozyEventOnce<T>(event: string, callback: EventCallback<T>) {
    useEffect(() => {
      cozyEvent.once(event, callback);
    }, [event, callback]);
  }

  static useEmitCozyEvent<T>() {
    return useCallback((event: string, params?: T) => {
      cozyEvent.emit(event, params);
    }, []);
  }

  static useEmitAsyncCozyEvent<T>() {
    return useCallback((event: string, params?: T) => {
      cozyEvent.emitAsync(event, params);
    }, []);
  }

  static useRemoveAllCozyListeners() {
    return useCallback((event?: string) => {
      cozyEvent.removeAllListeners(event);
    }, []);
  }
}

export { ReactCozyEvent };
export default cozyEvent;
