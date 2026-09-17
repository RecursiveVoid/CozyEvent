/** @jest-environment jsdom */
// Compile-time checks: ts-jest type-checks this file, so an unused @ts-expect-error fails the suite.
import { render, act } from '@testing-library/react';
import { CozyEvent } from 'cozyevent';
import type { Listener } from 'cozyevent';
import { useCozyEvent } from 'cozyevent/react';

type User = { name: string };
type Events = { login: User; logout: void; count: number };

describe('useCozyEvent typing', () => {
  it('infers payload types from the emitter event map and rejects mismatches', () => {
    const e = new CozyEvent<Events>();
    class Bus extends CozyEvent<Events> {}
    const bus = new Bus();
    const names: string[] = [];
    function C() {
      useCozyEvent(e, 'login', (u) => names.push(u.name));
      useCozyEvent(e, 'count', (n) => names.push(n.toFixed(0)));
      useCozyEvent(e, 'logout', () => names.push('bye'));
      const typed: Listener<User> = (u) => names.push(u.name.toUpperCase());
      useCozyEvent(e, 'login', typed);
      if (Math.random() > 2) {
        // @ts-expect-error unknown event name
        useCozyEvent(e, 'nope', () => {});
        // @ts-expect-error payload type mismatch (count is number)
        useCozyEvent(e, 'count', (s: string) => s.trim());
        // @ts-expect-error listener for login does not accept number
        useCozyEvent(e, 'login', (n: number) => n);
        // subclassed emitters keep their event map (inferred through the type-only _T marker)
        // @ts-expect-error payload type mismatch on a subclass (count is number)
        useCozyEvent(bus, 'count', (s: string) => s.trim());
        useCozyEvent(bus, 'login', (u) => names.push(u.name));
      }
      return null;
    }
    render(<C />);
    act(() => e.emit('login', { name: 'ada' }));
    act(() => e.emit('count', 2));
    act(() => e.emit('logout'));
    expect(names).toEqual(['ada', 'ADA', '2', 'bye']);
  });

  it('works with an untyped (default) emitter', () => {
    const e = new CozyEvent();
    const got: unknown[] = [];
    function C() {
      useCozyEvent(e, 'anything', (p) => got.push(p));
      return null;
    }
    render(<C />);
    act(() => e.emit('anything', 1));
    expect(got).toEqual([1]);
  });
});
