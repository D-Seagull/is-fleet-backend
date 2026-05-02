import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AdminInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Skip for WebSocket and RPC contexts — they have no HTTP request object
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.role === 'ADMIN') {
      request.user.companyId = null;
    }

    return next.handle();
  }
}
