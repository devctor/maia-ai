import { HttpException, HttpStatus } from "@nestjs/common";
import { ERROR_CODES, type ErrorCode, type ErrorResponse } from "@maia/contracts";
import { ZodError } from "zod";
import { isAppError } from "./errors";

/**
 * The single translation from "something was thrown" to "this is what the client reads".
 *
 * Two callers need it: the HTTP filter and the SSE endpoint, which cannot use a filter once the
 * first byte is written. Keeping one function means both report the same code for the same failure;
 * before this existed, `GET /insights/latest` answered `NOT_FOUND` while the same error inside the
 * stream answered `INTERNAL_ERROR`.
 *
 * The disclosure rule, which every branch below obeys:
 *
 * - a 4xx message was written for the client, so it is sent as-is;
 * - a 5xx message is an internal detail (a SQL fragment, a connection string, a provider payload),
 *   so the client gets a stable generic message and the detail stays in the log;
 * - the unexpected branch never reads the thrown value at all.
 */
export interface DescribedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  /** Whether the value is a recognised, deliberate failure (AppError, Zod, HttpException). */
  expected: boolean;
}

const GENERIC_MESSAGE = "Ocurrió un error inesperado";
const GENERIC_VALIDATION_MESSAGE = "Los datos enviados no son válidos";

export function describeError(exception: unknown): DescribedError {
  if (isAppError(exception)) {
    return {
      statusCode: exception.statusCode,
      code: exception.code,
      // AppError subclasses are ours: their message is written for a person, and `details` is
      // limited to field paths and retry signals. Both are safe to disclose.
      message: exception.message,
      details: exception.details,
      expected: true,
    };
  }

  if (exception instanceof ZodError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: GENERIC_VALIDATION_MESSAGE,
      details: { issues: flattenZodError(exception) },
      expected: true,
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const expected = isExpectedStatus(statusCode);
    return {
      statusCode,
      code:
        statusCode === HttpStatus.NOT_FOUND ? ERROR_CODES.NOT_FOUND : ERROR_CODES.INTERNAL_ERROR,
      message: expected ? messageOf(exception) : GENERIC_MESSAGE,
      expected,
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: GENERIC_MESSAGE,
    expected: false,
  };
}

/** Builds the wire envelope. `requestId` is the correlation id the client can quote in a report. */
export function toErrorResponse(exception: unknown, requestId: string): ErrorResponse {
  const { statusCode, code, message, details } = describeError(exception);
  return {
    statusCode,
    code,
    message,
    ...(details ? { details } : {}),
    requestId,
  };
}

/**
 * 4xx is a client mistake the server already understands, so its message is a real answer. 5xx means
 * the server is broken, and whatever the exception says about that is for the log.
 */
function isExpectedStatus(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

/**
 * An `HttpException` can carry a string, or a body shaped like Nest's default
 * `{ statusCode, message, error }`. `message` is sometimes an array of strings (class-validator).
 */
function messageOf(exception: HttpException): string {
  const payload = exception.getResponse();
  if (typeof payload === "string") {
    return payload;
  }
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(message)) {
    return message.map((item) => String(item)).join("; ");
  }
  return exception.message;
}

function flattenZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}
