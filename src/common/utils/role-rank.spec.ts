import { canManageUser } from './role-rank';

// DRIVER < MANAGER < TEAMLEAD < ADMIN; ADMIN targets only by ADMIN; never self.
describe('canManageUser', () => {
  const ROLES = ['DRIVER', 'MANAGER', 'TEAMLEAD', 'ADMIN'] as const;
  const expected: Record<string, Record<string, boolean>> = {
    DRIVER: { DRIVER: false, MANAGER: false, TEAMLEAD: false, ADMIN: false },
    MANAGER: { DRIVER: true, MANAGER: false, TEAMLEAD: false, ADMIN: false },
    TEAMLEAD: { DRIVER: true, MANAGER: true, TEAMLEAD: false, ADMIN: false },
    ADMIN: { DRIVER: true, MANAGER: true, TEAMLEAD: true, ADMIN: true },
  };

  for (const req of ROLES) {
    for (const target of ROLES) {
      it(`${req} → ${target}: ${expected[req][target] ? 'allowed' : 'refused'}`, () => {
        expect(
          canManageUser({ id: 'a', role: req }, { id: 'b', role: target }),
        ).toBe(expected[req][target]);
      });
    }
  }

  it('never yourself, not even as ADMIN', () => {
    expect(
      canManageUser({ id: 'a', role: 'ADMIN' }, { id: 'a', role: 'ADMIN' }),
    ).toBe(false);
  });

  it('an unknown role is refused both ways', () => {
    expect(canManageUser({ id: 'a', role: 'GUEST' }, { id: 'b', role: 'DRIVER' })).toBe(false);
    expect(canManageUser({ id: 'a', role: 'ADMIN' }, { id: 'b', role: 'GUEST' })).toBe(false);
  });
});
