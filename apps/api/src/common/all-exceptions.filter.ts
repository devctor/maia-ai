import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ERROR_CODES, type ErrorCode, type ErrorResponse } from "@maia/contracts";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, isAppError } from "./errors";

/**
 * One place turns anything thrown into the documented error envelope. Without this every module
 * invents its own error body and the UI has to guess.
 *
 * The rule: the client sees a stable `code` and a useful `message`; unexpected failures never leak
 * stack traces, SQL or provider payloads.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { requestId?: string }>();

    const { statusCode, code, message, details } = this.describe(exception, request.requestId);
    const body: ErrorResponse = {
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      requestId: request.requestId ?? "unknown",
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${statusCode} ${code}: ${message}`);
    }

    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(statusCode).json(body);
  }

  private describe(
    exception: unknown,
    requestId?: string,
  ): {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  } {
    if (isAppError(exception)) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Los datos enviados no son válidos",
        details: { issues: flattenZodError(exception) },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return {
        statusCode: status,
        code: status === HttpStatus.NOT_FOUND ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL_ERROR,
        message:
          typeof payload === "string"
            ? payload
            : ((payload as { message?: string }).message ?? exception.message),
      };
    }

    this.logger.error(`Unhandled exception (requestId=${requestId ?? "unknown"})`, exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Ocurrió un error inesperado",
    };
  }
}

function flattenZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export { AppError };
