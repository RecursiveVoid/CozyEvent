import { useContext } from 'react';
import { render, screen, act } from '@testing-library/react';
import { CozyEventProvider } from '../src/react/CozyEventProvider';
import { useCozyEvent } from '../src/react/useCozyEvent';
import { CozyEvent } from '../src/core/CozyEvent';
import { CozyEventContext } from '../src/react/context';
import { globalCozyEventInstance } from '../src/react/CozyEventProvider';
import '@testing-library/jest-dom';

// Mock console.warn
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});
afterAll(() => {
  console.warn = originalWarn;
});

describe('CozyEventProvider', () => {
  // Tests that the CozyEventProvider provides a default instance of the CozyEvent class through the context.
  it('provides a default instance of CozyEvent', () => {
    let emitterInstance: CozyEvent;

    const TestComponent = () => {
      emitterInstance = useContext(CozyEventContext)!;
      return <div>Test</div>;
    };

    render(
      <CozyEventProvider instance={new CozyEvent()}>
        <TestComponent />
      </CozyEventProvider>
    );

    expect(emitterInstance).toBeInstanceOf(CozyEvent);
  });

  // Tests that the CozyEventProvider can be initialized with a custom instance of CozyEvent.
  it('allows injecting a custom instance', () => {
    const customEmitter = new CozyEvent();

    const TestComponent = () => {
      const emitter = useContext(CozyEventContext);
      return <div>{emitter === customEmitter ? 'Match' : 'No match'}</div>;
    };

    render(
      <CozyEventProvider instance={customEmitter}>
        <TestComponent />
      </CozyEventProvider>
    );

    expect(screen.getByText('Match')).toBeInTheDocument();
  });
 
  // Tests that the CozyEventProvider throws an error when a non-CozyEvent object is provided as the instance.
  it('throws an error if an invalid instance is provided', () => {
    const invalidInstance = {} as CozyEvent;

    expect(() => {
      render(
        <CozyEventProvider instance={invalidInstance}>
          <div>Test</div>
        </CozyEventProvider>
      );
    }).toThrow('Invalid CozyEvent instance provided to CozyEventProvider');
  });


  // Tests that the CozyEventProvider throws an error for various invalid instance types like null, plain objects, and numbers.
  it('throws error for non-CozyEvent instances', () => {
    const invalidInstances = [null, {}, 123]; 
    
    invalidInstances.forEach((instance) => {
      expect(() => 
        render(
          <CozyEventProvider instance={instance as any}>
            <div>Test</div>
          </CozyEventProvider>
        )
      ).toThrow('Invalid CozyEvent instance provided to CozyEventProvider');
    });
  });


  // Tests that if no specific instance is provided to CozyEventProvider, it defaults to using the global CozyEvent instance.
  it('uses global instance when no instance is provided', () => {
  const TestComponentDefault = () => {
    const emitter = useContext(CozyEventContext)!;
    return <div>{emitter === globalCozyEventInstance ? 'Global' : 'Custom'}</div>;
  };

  render(
    <CozyEventProvider> {/* Sin "instance" */}
      <TestComponentDefault />
    </CozyEventProvider>
  );

  expect(screen.getByText('Global')).toBeInTheDocument();
});
  
});

describe('useCozyEvent', () => {

  // Tests that the useCozyEvent hook correctly subscribes a callback to an event and unsubscribes it when the component unmounts.
  it('subscribes and unsubscribes events correctly', () => {
    const mockCallback = jest.fn();
    const emitter = new CozyEvent();

    const TestComponent = () => {
      useCozyEvent('test-event', mockCallback);
      return <div>Test</div>;
    };

    const { unmount } = render(
      <CozyEventProvider instance={emitter}>
        <TestComponent />
      </CozyEventProvider>
    );

    // Verify subscription
    act(() => {
      emitter.emit('test-event', 'payload');
    });
    expect(mockCallback).toHaveBeenCalledWith('payload');

    // Verify cleanup
    unmount();
    emitter.emit('test-event', 'payload2');
    expect(mockCallback).toHaveBeenCalledTimes(1); // Should not be called again
  });


  // Tests that when the callback function passed to useCozyEvent changes, the hook updates the event listener.
  it('updates the listener when the callback changes', () => {
    const emitter = new CozyEvent();
    const spyOn = jest.spyOn(emitter, 'on');
    const spyOff = jest.spyOn(emitter, 'off');

    const { rerender } = render(
      <CozyEventProvider instance={emitter}>
        <TestComponent callback={() => { }} />
      </CozyEventProvider>
    );

    const newCallback = jest.fn();
    rerender(
      <CozyEventProvider instance={emitter}>
        <TestComponent callback={newCallback} />
      </CozyEventProvider>
    );

    expect(spyOff).toHaveBeenCalledTimes(1);
    expect(spyOn).toHaveBeenCalledTimes(2);
  });


  // Tests that the useCozyEvent hook correctly handles changes to the event name, unsubscribing from the old event and subscribing to the new one. 
  it('handles dynamic event names correctly', () => {
    const emitter = new CozyEvent();
    const mockCallback = jest.fn();
    const spyOn = jest.spyOn(emitter, 'on');
    const spyOff = jest.spyOn(emitter, 'off');

    const TestComponent = ({ eventName }: { eventName: string }) => {
      useCozyEvent(eventName, mockCallback);
      return <div>Dynamic Test</div>;
    };

    const { rerender } = render(
      <CozyEventProvider instance={emitter}>
        <TestComponent eventName="event-1" />
      </CozyEventProvider>
    );

    rerender(
      <CozyEventProvider instance={emitter}>
        <TestComponent eventName="event-2" />
      </CozyEventProvider>
    );

    expect(spyOff).toHaveBeenCalledTimes(1);
    expect(spyOn).toHaveBeenCalledTimes(2);
  });
  

  // Tests that when the useCozyEvent hook is used outside of a CozyEventProvider, it correctly uses the global CozyEvent instance.
  it('uses global CozyEvent instance when no provider is present', () => {
      const mockCallback = jest.fn();
  
      const TestComponentGlobal = () => {
        useCozyEvent('global-test', mockCallback);
        return <div>Global Test</div>;
      };
  
      render(<TestComponentGlobal />);
  
      act(() => {
        // Use the same instance that useCozyEvent uses internally
        globalCozyEventInstance.emit('global-test', 'global-data');
      });
  
      expect(mockCallback).toHaveBeenCalledWith('global-data');
  });


  // Tests that the useCozyEvent hook throws an error when an empty string is provided as the event name.
  it('handles empty string eventName', () => {
    const TestComponentEmpty = () => {
      useCozyEvent('', jest.fn());
      return <div>Test</div>;
    };

    expect(() => {
      render(
        <CozyEventProvider instance={new CozyEvent()}>
          <TestComponentEmpty />
        </CozyEventProvider>
      );
    }).toThrow('Invalid eventName provided to useCozyEvent. It must be a non-empty string.');
  });


  // Tests that the useCozyEvent hook throws an error when an event name containing only whitespace is provided.
  it('handles whitespace-only eventName', () => {
    const TestComponentWhitespace = () => {
      useCozyEvent('   ', jest.fn());
      return <div>Test</div>;
    };

    expect(() => {
      render(
        <CozyEventProvider instance={new CozyEvent()}>
          <TestComponentWhitespace />
        </CozyEventProvider>
      );
    }).toThrow('Invalid eventName provided to useCozyEvent. It must be a non-empty string.');
  });


  // Tests that the callback function registered with useCozyEvent is called correctly for multiple emissions of the same event.
  it('handles multiple event emissions', () => {
    const mockCallback = jest.fn();
    const emitterMulti = new CozyEvent();

    const TestComponentMulti = () => {
      useCozyEvent('multi-event', mockCallback);
      return <div>Multi Test</div>;
    };

    render(
      <CozyEventProvider instance={emitterMulti}>
        <TestComponentMulti />
      </CozyEventProvider>
    );

    act(() => {
      emitterMulti.emit('multi-event', 'data1');
      emitterMulti.emit('multi-event', 'data2');
      emitterMulti.emit('multi-event', 'data3');
    });

    expect(mockCallback).toHaveBeenCalledTimes(3);
    expect(mockCallback).toHaveBeenNthCalledWith(1, 'data1');
    expect(mockCallback).toHaveBeenNthCalledWith(2, 'data2');
    expect(mockCallback).toHaveBeenNthCalledWith(3, 'data3');
  });


  // Tests that the useCozyEvent hook throws an error when undefined is provided as the callback function.
  it('handles undefined callback correctly', () => {
    const TestComponentUndefined = () => {
      useCozyEvent('test-event', undefined as any);
      return <div>Test</div>;
    };

    expect(() => {
      render(
        <CozyEventProvider instance={new CozyEvent()}>
          <TestComponentUndefined />
        </CozyEventProvider>
      );
    }).toThrow('Invalid callback provided to useCozyEvent. It must be a function.');
  });


   // Tests that the useCozyEvent hook correctly manages subscriptions and unsubscriptions during rapid re-renders of the component.
  it('handles rapid component updates correctly', () => {
    const emitterRapid = new CozyEvent();
    const mockCallback = jest.fn();

    const TestComponentRapid = ({ id }: { id: number }) => {
      useCozyEvent(`event-${id}`, mockCallback);
      return <div>Rapid Test {id}</div>;
    };

    const { rerender } = render(
      <CozyEventProvider instance={emitterRapid}>
        <TestComponentRapid id={1} />
      </CozyEventProvider>
    );

    // Rapid rerenders
    for (let i = 2; i <= 5; i++) {
      rerender(
        <CozyEventProvider instance={emitterRapid}>
          <TestComponentRapid id={i} />
        </CozyEventProvider>
      );
    }

    act(() => {
      emitterRapid.emit('event-5', 'final-data');
    });

    expect(mockCallback).toHaveBeenCalledWith('final-data');
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });


  // Tests that the useCozyEvent hook throws an error when a non-function value (like null) is provided as the callback.
  it('throws an error if callback is not a function', () => {
    const TestComponentInvalidCallback = () => {
      useCozyEvent('test-event', null);
      return <div>Test</div>;
    };

    expect(() => {
      render(
        <CozyEventProvider instance={new CozyEvent()}>
          <TestComponentInvalidCallback />
        </CozyEventProvider>
      );
    }).toThrow('Invalid callback provided to useCozyEvent. It must be a function.');
  });


  // Tests that the useCozyEvent hook throws an error if the eventName prop changes to an invalid value (like null).
  it('throws an error if eventName changes to an invalid value', () => {
    const emitter = new CozyEvent();

    const TestComponentDynamic = ({ eventName }: { eventName: string | null }) => {
      useCozyEvent(eventName as string, jest.fn());
      return <div>Dynamic Test</div>;
    };

    const { rerender } = render(
      <CozyEventProvider instance={emitter}>
        <TestComponentDynamic eventName="valid-event" />
      </CozyEventProvider>
    );

    expect(() => {
      rerender(
        <CozyEventProvider instance={emitter}>
          <TestComponentDynamic eventName={null} />
        </CozyEventProvider>
      );
    }).toThrow('Invalid eventName provided to useCozyEvent. It must be a non-empty string.');
  });


  // Tests that the useCozyEvent hook correctly applies the provided namespace to the event name when subscribing.
  it('correctly applies namespace to event names', () => {
    const emitter = new CozyEvent();
    const mockCallback = jest.fn();
    const spyOn = jest.spyOn(emitter, 'on');
  
    const TestComponent = () => {
      useCozyEvent('event', mockCallback, 'ns');
      return <div>Test</div>;
    };
  
    render(
      <CozyEventProvider instance={emitter}>
        <TestComponent />
      </CozyEventProvider>
    );
  
    expect(spyOn).toHaveBeenCalledWith('ns:event', mockCallback);
  });


  // Tests that the useCozyEvent hook returns the CozyEvent instance provided by the nearest CozyEventProvider.
  it('returns the emitter instance from provider', () => {
    const customEmitter = new CozyEvent();
    let hookEmitter;
  
    const TestComponent = () => {
      hookEmitter = useCozyEvent('test', jest.fn());
      return <div>Test</div>;
    };
  
    render(
      <CozyEventProvider instance={customEmitter}>
        <TestComponent />
      </CozyEventProvider>
    );
  
    expect(hookEmitter).toBe(customEmitter);
  });
  

  // Tests that when no CozyEventProvider is present, the useCozyEvent hook returns the global CozyEvent instance.
  it('returns global instance when no provider', () => {
    let hookEmitter;
  
    const TestComponent = () => {
      hookEmitter = useCozyEvent('test', jest.fn());
      return <div>Test</div>;
    };
  
    render(<TestComponent />);
  
    expect(hookEmitter).toBe(globalCozyEventInstance);
  });
});

// Helper component for testing
const TestComponent = ({ callback }: { callback: (data: any) => void }) => {
  useCozyEvent('dynamic-event', callback);
  return <div>Dynamic Test</div>;
};
