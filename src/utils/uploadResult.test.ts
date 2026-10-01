import { describe, expect, it } from 'vitest';
import { requireConfirmedRouteUpload } from './uploadResult';

describe('the authoritative upload result', () => {
  it('accepts the exact route and assignment confirmed by the API', () => {
    expect(requireConfirmedRouteUpload({ route_id: 'route-1', assignment_confirmed: true }))
      .toEqual({ route_id: 'route-1', assignment_confirmed: true });
  });

  it.each([
    null,
    {},
    { route_id: '', assignment_confirmed: true },
    { route_id: 'route-1' },
    { route_id: 'route-1', assignment_confirmed: false },
  ])('refuses an ambiguous result instead of guessing or writing from the browser: %j', value => {
    expect(() => requireConfirmedRouteUpload(value)).toThrow(/could not be confirmed|could not be verified/);
  });
});
