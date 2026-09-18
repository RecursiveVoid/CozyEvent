/** @jest-environment jsdom */
import { StrictMode, useState } from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { CozyEvent } from 'cozyevent';
import { useCozyEvent } from 'cozyevent/react';

type Events = { ping: number; other: string; 'hello world': { name: string } };

// Public-API spies only: `on` counts subscriptions, `remove` counts calls of the unsubscribe
// functions that `on` returned, `off` counts direct off calls (the hook never needs them).
// Live listener counts are observed by emitting and counting listener calls.
const spyOnEmitter = (e: CozyEvent<any>) => {
  const remove = jest.fn();
  const orig = e.on;
  const on = jest.spyOn(e, 'on').mockImplementation(function (this: CozyEvent<any>, ev: string, l: any) {
    const un = orig.call(this, ev, l);
    return () => {
      remove();
      un();
    };
  } as any);
  return { on, remove, off: jest.spyOn(e, 'off') };
};

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('useCozyEvent (cozyevent/react)', () => {
  it('subscribes on mount and receives the payload', () => {
    const e = new CozyEvent<Events>();
    const got: number[] = [];
    function C() {
      useCozyEvent(e, 'ping', (n) => got.push(n));
      return null;
    }
    render(<C />);
    act(() => e.emit('ping', 7));
    act(() => e.emit('ping', 8));
    expect(got).toEqual([7, 8]);
  });

  it('works with emitAsync', async () => {
    const e = new CozyEvent<Events>();
    const got: number[] = [];
    function C() {
      useCozyEvent(e, 'ping', (n) => got.push(n));
      return null;
    }
    render(<C />);
    await act(async () => {
      e.emitAsync('ping', 1);
      expect(got).toEqual([]);
      await Promise.resolve();
    });
    expect(got).toEqual([1]);
  });

  it('receives undefined when emitted without payload and ignores other events', () => {
    const e = new CozyEvent<Events>();
    const fn = jest.fn();
    function C() {
      useCozyEvent(e, 'ping', fn);
      return null;
    }
    render(<C />);
    act(() => e.emit('other', 'x'));
    expect(fn).not.toHaveBeenCalled();
    act(() => e.emit('ping'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(undefined);
  });

  it('inline arrow listener re-rendered many times subscribes exactly once', () => {
    const e = new CozyEvent<Events>();
    const spies = spyOnEmitter(e);
    const calls: number[] = [];
    function C({ tick }: { tick: number }) {
      useCozyEvent(e, 'ping', (n) => calls.push(n + tick * 0));
      return <span>{tick}</span>;
    }
    const { rerender } = render(<C tick={0} />);
    for (let i = 1; i <= 100; i++) rerender(<C tick={i} />);
    expect(spies.on).toHaveBeenCalledTimes(1);
    expect(spies.remove).not.toHaveBeenCalled();
    act(() => e.emit('ping', 5));
    expect(calls).toEqual([5]); // exactly one live listener
  });

  it('state-driven re-renders (setState inside the listener) do not resubscribe', () => {
    const e = new CozyEvent<Events>();
    const spies = spyOnEmitter(e);
    let renders = 0;
    function C() {
      const [n, setN] = useState(0);
      renders++;
      useCozyEvent(e, 'ping', (p) => setN(n + p));
      return <span data-testid="v">{n}</span>;
    }
    const { getByTestId } = render(<C />);
    for (let i = 0; i < 10; i++) act(() => e.emit('ping', 1));
    // Uses `n` from the closure: only correct if the latest listener is always used.
    expect(getByTestId('v').textContent).toBe('10');
    expect(renders).toBeGreaterThan(10);
    expect(spies.on).toHaveBeenCalledTimes(1);
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it('uses the latest listener closure after rerender (no stale closure)', () => {
    const e = new CozyEvent<Events>();
    const seen: string[] = [];
    function C({ label }: { label: string }) {
      useCozyEvent(e, 'ping', (n) => seen.push(`${label}:${n}`));
      return null;
    }
    const { rerender } = render(<C label="a" />);
    act(() => e.emit('ping', 1));
    rerender(<C label="b" />);
    act(() => e.emit('ping', 2));
    rerender(<C label="c" />);
    rerender(<C label="d" />);
    act(() => e.emit('ping', 3));
    expect(seen).toEqual(['a:1', 'b:2', 'd:3']);
  });

  it('switching to a different listener function (not inline) uses the new one without resubscribing', () => {
    const e = new CozyEvent<Events>();
    const spies = spyOnEmitter(e);
    const f1 = jest.fn();
    const f2 = jest.fn();
    function C({ fn }: { fn: (n: number) => void }) {
      useCozyEvent(e, 'ping', fn);
      return null;
    }
    const { rerender } = render(<C fn={f1} />);
    rerender(<C fn={f2} />);
    act(() => e.emit('ping', 1));
    expect(f1).not.toHaveBeenCalled();
    expect(f2).toHaveBeenCalledWith(1);
    expect(spies.on).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', async () => {
    const e = new CozyEvent<Events>();
    const spies = spyOnEmitter(e);
    const fn = jest.fn();
    function C() {
      useCozyEvent(e, 'ping', fn);
      return null;
    }
    const { unmount } = render(<C />);
    act(() => e.emit('ping', 0));
    expect(fn).toHaveBeenCalledTimes(1);
    unmount();
    expect(spies.remove).toHaveBeenCalledTimes(1);
    expect(spies.off).not.toHaveBeenCalled();
    e.emit('ping', 1);
    e.emitAsync('ping', 2);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unmount removes only its own registration, not another subscriber using the same emitter/event', () => {
    const e = new CozyEvent<Events>();
    const outside = jest.fn();
    e.on('ping', outside);
    const inside = jest.fn();
    function C() {
      useCozyEvent(e, 'ping', inside);
      return null;
    }
    const { unmount } = render(<C />);
    unmount();
    e.emit('ping', 1);
    expect(outside).toHaveBeenCalledTimes(1);
    expect(inside).not.toHaveBeenCalled();
  });

  it('resubscribes when the event prop changes and removes the old subscription', () => {
    const e = new CozyEvent<Events>();
    const spies = spyOnEmitter(e);
    const got: Array<[string, unknown]> = [];
    function C({ ev }: { ev: 'ping' | 'other' }) {
      useCozyEvent(e, ev, (p: unknown) => got.push([ev, p]));
      return null;
    }
    const { rerender, unmount } = render(<C ev="ping" />);
    rerender(<C ev="other" />);
    expect(spies.on).toHaveBeenCalledTimes(2);
    expect(spies.remove).toHaveBeenCalledTimes(1);
    act(() => e.emit('ping', 1));
    act(() => e.emit('other', 'x'));
    expect(got).toEqual([['other', 'x']]); // ping: 0 live, other: exactly 1
    // and back again
    rerender(<C ev="ping" />);
    act(() => e.emit('other', 'y'));
    act(() => e.emit('ping', 2));
    expect(got).toEqual([
      ['other', 'x'],
      ['ping', 2],
    ]);
    unmount();
    e.emit('ping', 3);
    e.emit('other', 'z');
    expect(got).toHaveLength(2);
  });

  it('resubscribes when the emitter prop changes and removes the old subscription', () => {
    const e1 = new CozyEvent<Events>();
    const e2 = new CozyEvent<Events>();
    const s1 = spyOnEmitter(e1);
    const s2 = spyOnEmitter(e2);
    const fn = jest.fn();
    function C({ em }: { em: CozyEvent<Events> }) {
      useCozyEvent(em, 'ping', fn);
      return null;
    }
    const { rerender, unmount } = render(<C em={e1} />);
    rerender(<C em={e2} />);
    expect(s1.on).toHaveBeenCalledTimes(1);
    expect(s1.remove).toHaveBeenCalledTimes(1);
    expect(s2.on).toHaveBeenCalledTimes(1);
    act(() => e1.emit('ping', 1));
    expect(fn).not.toHaveBeenCalled();
    act(() => e2.emit('ping', 2));
    expect(fn.mock.calls).toEqual([[2]]);
    unmount();
    expect(s2.remove).toHaveBeenCalledTimes(1);
    e1.emit('ping', 3);
    e2.emit('ping', 4);
    expect(fn.mock.calls).toEqual([[2]]);
  });

  it('React.StrictMode double effects leave exactly one live listener', () => {
    const e = new CozyEvent<Events>();
    const fn = jest.fn();
    function C({ t }: { t: number }) {
      useCozyEvent(e, 'ping', (n) => fn(n, t));
      return null;
    }
    const { rerender, unmount } = render(
      <StrictMode>
        <C t={0} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <C t={1} />
      </StrictMode>,
    );
    act(() => e.emit('ping', 9));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(9, 1);
    unmount();
    e.emit('ping', 10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('1000 components mounting and unmounting leave zero listeners', () => {
    const e = new CozyEvent<Events>();
    let hits = 0;
    function Item() {
      useCozyEvent(e, 'ping', () => {
        hits++;
      });
      return null;
    }
    function List({ n }: { n: number }) {
      return (
        <>
          {Array.from({ length: n }, (_, i) => (
            <Item key={i} />
          ))}
        </>
      );
    }
    const { rerender, unmount } = render(<List n={1000} />);
    act(() => e.emit('ping', 0));
    expect(hits).toBe(1000);
    rerender(<List n={500} />);
    hits = 0;
    act(() => e.emit('ping', 0));
    expect(hits).toBe(500);
    rerender(<List n={1000} />);
    hits = 0;
    act(() => e.emit('ping', 0));
    expect(hits).toBe(1000);
    unmount();
    hits = 0;
    e.emit('ping', 0);
    expect(hits).toBe(0);
  });

  it('a component unmounted by a listener during emit does not break the emit', () => {
    const e = new CozyEvent<Events>();
    const order: string[] = [];
    function A() {
      useCozyEvent(e, 'ping', () => order.push('A'));
      return null;
    }
    function B() {
      useCozyEvent(e, 'ping', () => order.push('B'));
      return null;
    }
    function Parent() {
      const [show, setShow] = useState(true);
      useCozyEvent(e, 'other', () => setShow(false));
      return show ? (
        <>
          <A />
          <B />
        </>
      ) : null;
    }
    render(<Parent />);
    act(() => e.emit('ping', 1));
    act(() => e.emit('other', 'hide'));
    act(() => e.emit('ping', 2));
    expect(order).toEqual(['A', 'B']); // no ping listener left
  });

  it('supports event names that collide with Object.prototype and spaces', () => {
    const e = new CozyEvent<Record<string, string>>();
    const fn = jest.fn();
    function C({ ev }: { ev: string }) {
      useCozyEvent(e, ev, fn);
      return null;
    }
    const { rerender, unmount } = render(<C ev="constructor" />);
    act(() => e.emit('constructor', 'a'));
    rerender(<C ev="__proto__" />);
    act(() => e.emit('__proto__', 'b'));
    rerender(<C ev="hello world" />);
    act(() => e.emit('hello world', 'c'));
    expect(fn.mock.calls).toEqual([['a'], ['b'], ['c']]);
    unmount();
    for (const ev of ['constructor', '__proto__', 'hello world']) e.emit(ev, 'after');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('works with a subclass emitter', () => {
    class Bus extends CozyEvent<Events> {
      ping(n: number) {
        this.emit('ping', n);
      }
    }
    const bus = new Bus();
    const fn = jest.fn();
    function C() {
      useCozyEvent(bus, 'ping', fn);
      return null;
    }
    const { unmount } = render(<C />);
    act(() => bus.ping(3));
    expect(fn.mock.calls).toEqual([[3]]);
    unmount();
    bus.ping(4);
    expect(fn.mock.calls).toEqual([[3]]);
  });

  it('the cozyevent/react entry exports only the hook', async () => {
    const mod = await import('cozyevent/react');
    expect(Object.keys(mod).sort()).toEqual(['useCozyEvent']);
    const core = await import('cozyevent');
    expect(Object.keys(core).sort()).toEqual(['CozyEvent']);
  });
});
