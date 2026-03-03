import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { logError } from '../logging/structured-logger';

type RequestWithContext = Request & {
  requestId?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const message =
      typeof errorResponse === 'string'
        ? errorResponse
        : (errorResponse as { message?: string | string[] }).message ?? 'Unexpected error';
    const requestId = request.requestId ?? null;

    logError('http_exception', {
      requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode,
      message,
      stack: exception instanceof Error ? exception.stack : null,
    });

    response.status(statusCode).json({
      success: false,
      error: {
        code: statusCode,
        message,
      },
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
