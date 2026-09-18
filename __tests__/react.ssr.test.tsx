/** @jest-environment node */
/// <reference path="../test-types/react-dom-server.d.ts" />
import { renderToString } from 'react-dom/server';
import { CozyEvent } from 'cozyevent';
import { useCozyEvent } from 'cozyevent/react';

describe('useCozyEvent server rendering', () => {
  it('renderToString does not subscribe (no leaked listeners on the server)', () => {
    const e = new CozyEvent<{ ping: number }>();
    const on = jest.spyOn(e, 'on');
    const fn = jest.fn();
    function C() {
      useCozyEvent(e, 'ping', fn);
      return <p>hi</p>;
    }
    for (let i = 0; i < 50; i++) expect(renderToString(<C />)).toBe('<p>hi</p>');
    expect(on).not.toHaveBeenCalled();
    e.emit('ping', 1);
    expect(fn).not.toHaveBeenCalled();
  });
});
