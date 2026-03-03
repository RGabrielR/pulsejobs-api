import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AuthUser } from '../interfaces/auth-user.interface';
import { logError, logInfo } from '../logging/structured-logger';

type TracedRequest = Request & {
  requestId?: string;
  user?: AuthUser;
};

@Injectable()
export class RequestTracingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const tracedRequest = req as TracedRequest;
    const incomingRequestId = this.getIncomingRequestId(req);
    const requestId = incomingRequestId ?? randomUUID();
    const startedAt = Date.now();

    tracedRequest.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const userId = tracedRequest.user?.userId ?? null;

      const payload = {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        latencyMs: durationMs,
        userId,
        userAgent: req.get('user-agent') ?? null,
        ip: req.ip ?? null,
      };

      if (res.statusCode >= 500) {
        logError('http_request', payload);
        return;
      }

      logInfo('http_request', payload);
    });

    next();
  }

  private getIncomingRequestId(req: Request): string | null {
    const header = req.headers['x-request-id'];

    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }

    if (Array.isArray(header) && header.length > 0) {
      const first = header[0]?.trim();
      if (first) {
        return first;
      }
    }

    return null;
  }
}
