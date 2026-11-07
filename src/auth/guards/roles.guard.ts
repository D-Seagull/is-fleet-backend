import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Method-level @Roles wins; otherwise fall back to a class-level @Roles
    // (reading only the handler silently let class-level roles through).
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(
      'roles',
      [context.getHandler(), context.getClass()],
    );
    if (!roles) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return !!user && roles.includes(user.role as string);
  }
}
