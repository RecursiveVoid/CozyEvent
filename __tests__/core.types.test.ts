/**
 * Compile-time type tests. ts-jest type-checks this file; it is also checked standalone with
 *   npx tsc --noEmit --strict --target ES2022 --moduleResolution bundler --module esnext \
 *     --types jest __tests__/core.types.test.ts
 * Every `@ts-expect-error` must be a real error, otherwise tsc fails with "Unused '@ts-expect-error'".
 */
import { CozyEvent } from '../src/index';
import type { Listener } from '../src/index';

type User = { id: number; name: string };
type Events = { login: User; logout: void; count: number; '': string };

// Helper: exact type equality
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(_?: T) => {};

function typeChecks() {
  const e = new CozyEvent<Events>();

  // correct usage compiles
  const un: () => void = e.on('login', (u) => {
    assertType<Equal<typeof u, User>>();
  });
  un();
  e.once('count', (n) => {
    assertType<Equal<typeof n, number>>();
  });
  e.emit('login', { id: 1, name: 'a' });
  e.emit('logout');
  e.emit('logout', undefined);
  e.emitAsync('count', 3);
  e.off('login', (_u: User) => {});
  e.removeAllListeners('login');
  e.removeAllListeners();
  e.on('', (s) => assertType<Equal<typeof s, string>>());
  assertType<Equal<ReturnType<typeof e.once>, () => void>>();
  assertType<Equal<ReturnType<typeof e.emit>, void>>();
  assertType<Equal<ReturnType<typeof e.off>, void>>();

  // wrong payload types
  // @ts-expect-error payload must be User
  e.emit('login', 42);
  // @ts-expect-error payload must be number
  e.emitAsync('count', 'x');
  // @ts-expect-error listener param type mismatch
  e.on('login', (_n: number) => {});
  // @ts-expect-error listener param type mismatch (once)
  e.once('count', (_s: string) => {});
  // @ts-expect-error listener param type mismatch (off)
  e.off('count', (_s: string) => {});

  // unknown events
  // @ts-expect-error unknown event
  e.on('nope', () => {});
  // @ts-expect-error unknown event
  e.emit('nope');
  // @ts-expect-error unknown event
  e.removeAllListeners('nope');
  // @ts-expect-error non-string event
  e.emit(1);

  // internals are private
  // @ts-expect-error private storage
  e._e;
  // @ts-expect-error private helper
  e._a;
  // @ts-expect-error private remover
  e._r;
  // @ts-expect-error protected type-only marker
  e._T;

  // untyped emitter accepts any string event and payload
  const any = new CozyEvent();
  any.on('whatever', (p) => p);
  any.emit('whatever', { x: 1 });
  any.emit('__proto__');

  // Listener type
  const l: Listener<number> = (n) => assertType<Equal<typeof n, number>>();
  e.on('count', l);
  // @ts-expect-error Listener<string> not assignable for number event
  e.on('count', null as unknown as Listener<string>);

  // subclassing with typed events
  class Store extends CozyEvent<{ change: { key: string } }> {
    set(key: string) {
      this.emit('change', { key });
      // @ts-expect-error wrong payload inside subclass
      this.emit('change', { nope: 1 });
    }
  }
  const s = new Store();
  s.on('change', (c) => assertType<Equal<typeof c, { key: string }>>());
  const base: CozyEvent<{ change: { key: string } }> = s;
  base.emit('change', { key: 'k' });
}

test('type checks compile (see file)', () => {
  expect(typeof typeChecks).toBe('function');
});
