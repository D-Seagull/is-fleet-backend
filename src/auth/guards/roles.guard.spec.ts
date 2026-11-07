import { Reflector } from '@nestjs/core';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

@Roles('ADMIN')
class ClassLevel {
  plain() {}
  @Roles('MANAGER')
  override() {}
}
class NoRoles {
  open() {}
}

function ctx(cls: any, method: string, role?: string) {
  return {
    getHandler: () => cls.prototype[method],
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as any;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('enforces a class-level @Roles (support inbox is ADMIN only)', () => {
    expect(guard.canActivate(ctx(ClassLevel, 'plain', 'DRIVER'))).toBe(false);
    expect(guard.canActivate(ctx(ClassLevel, 'plain', 'MANAGER'))).toBe(false);
    expect(guard.canActivate(ctx(ClassLevel, 'plain', 'ADMIN'))).toBe(true);
  });

  it('lets a method-level @Roles override the class', () => {
    expect(guard.canActivate(ctx(ClassLevel, 'override', 'MANAGER'))).toBe(true);
    expect(guard.canActivate(ctx(ClassLevel, 'override', 'ADMIN'))).toBe(false);
  });

  it('allows routes without @Roles', () => {
    expect(guard.canActivate(ctx(NoRoles, 'open', 'DRIVER'))).toBe(true);
  });

  it('refuses when there is no user', () => {
    expect(guard.canActivate(ctx(ClassLevel, 'plain'))).toBe(false);
  });
});
