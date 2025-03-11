import { CozyEvent } from '../src/core/CozyEvent';

describe('CozyEvent', () => {
  let emitter: CozyEvent;

  beforeEach(() => {
    emitter = new CozyEvent();
  });

  afterEach(() => {
    emitter.destroy();
    emitter = null;
  });

  test('should register and emit an event', () => {
    const mockFn = jest.fn();
    emitter.on('testEvent', mockFn);
    emitter.emit('testEvent', 'Luke');
    expect(mockFn).toHaveBeenCalledWith('Luke');
  });

  test('should register and emit a million event', () => {
    const oneMillion = 1_000_000;
    let total = 0;
    emitter.on('testEvent', () => {
      total += 1;
    });
    for (let i = 0; i < oneMillion; i++) {
      emitter.emit('testEvent', total);
    }
    expect(total).toEqual(oneMillion);
  });

  test('should remove an event listener', () => {
    const mockFn = jest.fn();
    emitter.on('testEvent', mockFn);
    emitter.off('testEvent', mockFn);
    emitter.emit('testEvent', 'Skywalker');
    expect(mockFn).not.toHaveBeenCalled();
  });

  test('should trigger once and remove the listener', () => {
    const mockFn = jest.fn();
    emitter.once('testEvent', mockFn);
    emitter.emit('testEvent', 'Im your father');
    emitter.emit('testEvent', 'Im your father');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('should remove all listeners', () => {
    const mockFn1 = jest.fn();
    const mockFn2 = jest.fn();
    emitter.on('event1', mockFn1);
    emitter.on('event2', mockFn2);
    emitter.removeAllListeners();
    emitter.emit('event1');
    emitter.emit('event2');
    expect(mockFn1).not.toHaveBeenCalled();
    expect(mockFn2).not.toHaveBeenCalled();
  });

  test('should remove all listeners for the given event', () => {
    const mockFn1 = jest.fn();
    const mockFn2 = jest.fn();
    emitter.on('event1', mockFn1);
    emitter.on('event2', mockFn2);
    emitter.removeAllListeners('event1');
    emitter.emit('event1');
    emitter.emit('event2');
    expect(mockFn1).not.toHaveBeenCalled();
    expect(mockFn2).toHaveBeenCalled();
  });

  test('should emit syncronously', () => {
    const mockFn = jest.fn();
    emitter.on('event1', mockFn);
    emitter.emit('event1', 'synchronous');
    expect(mockFn).toHaveBeenCalledWith('synchronous');
  });

  test('should emit asynchronously when configured', async () => {
    const mockFn = jest.fn();
    emitter.on('asyncEvent', mockFn);
    emitter.emitAsync('asyncEvent', 'Hello');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockFn).toHaveBeenCalledWith('Hello');
  });

  test('should destroy: emitSync should not throw exeption', async () => {
    const mockFn = jest.fn();
    emitter.on('asyncEvent', mockFn);
    emitter.destroy();
    emitter.emit('asyncEvent', 'Oh look at me, look at me');
    expect(mockFn).not.toHaveBeenCalledWith('Oh look at me, look at me');
  });

  test('should destroy: emitAsync should not throw exeption', async () => {
    const mockFn = jest.fn();
    emitter.on('asyncEvent', mockFn);
    emitter.destroy();
    emitter.emitAsync('asyncEvent', 'Imma event!');
    expect(mockFn).not.toHaveBeenCalledWith('Imma event!');
  });
});
