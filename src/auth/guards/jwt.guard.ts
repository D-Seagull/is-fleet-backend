import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  // After the token itself checks out, block writes (any non-GET request)
  // from users whose company has been deactivated. Reads still pass through
  // so chat history etc. stays visible. ADMIN accounts are platform-wide —
  // never scoped to a client company's isActive flag — so they're exempt.
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = await super.canActivate(context);
    if (!ok) return false;

    const request = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(request.method)) return true;

    const user = request.user as
      | { role?: string; companyIsActive?: boolean }
      | undefined;
    if (!user || user.role === 'ADMIN') return true;

    if (user.companyIsActive === false) {
      throw new ForbiddenException({
        message: 'errors.companyDeactivated',
        code: 'COMPANY_DEACTIVATED',
      });
    }
    return true;
  }
}
