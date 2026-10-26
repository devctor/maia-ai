import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ErrorResponse } from "@maia/contracts";
import type { Response } from "express";
import { describeError } from "./error-response";

/**
 * The last line of the API: whatever escapes a handler becomes the documented error envelope.
 * Without it every module invents its own error body and the UI has to guess.
 *
 * Two responsibilities, deliberately split:
 * - `describeError` decides what the client may read (see `error-response.ts`);
 * - this class decides what is logged, at which level, and how a value that is not an `Error`
 *   (or a response that was already partially written) is handled.
 *
 * The request id is read from the header rather than from a mutated request object: it is the same
 * value the middleware echoed, and it removes this file's dependency on an augmented Express type.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<{
      method?: string;
      url?: string;
      headers?: Record<string, unknown>;
    }>();

    const requestId = readRequestId(request.headers);
    // `toErrorResponse` is not used directly because the level and the payload of the log depend on
    // whether this failure was deliberate, and that information is part of `describeError`.
    const described = describeError(exception);
    const body: ErrorResponse = {
      statusCode: described.statusCode,
      code: described.code,
      message: described.message,
      ...(described.details ? { details: described.details } : {}),
      requestId,
    };

    const summary = `${request.method ?? "?"} ${request.url ?? "?"} -> ${body.statusCode} ${body.code} (requestId=${requestId})`;

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // The stack goes to the log, never to the client, and `describeThrown` guarantees a readable
      // string even when something threw a plain object instead of an Error.
      this.logger.error(summary, describeThrown(exception));
    } else if (described.expected) {
      // A rejected request is business as usual; logging it at `error` would hide real failures.
      this.logger.warn(`${summary}: ${body.message}`);
    } else {
      this.logger.warn(summary);
    }

    if (response.headersSent) {
      // An SSE response that already emitted frames cannot become a JSON error; ending it is all
      // that is left, and the stream controller writes its own `error` event before reaching here.
      response.end();
      return;
    }
    response.status(body.statusCode).json(body);
  }
}

function readRequestId(headers: Record<string, unknown> | undefined): string {
  const raw = headers?.["x-request-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

/**
 * `Logger.error(message, object)` hands the object to `util.inspect`, which happily walks a thrown
 * value's properties — including a request options bag holding an API key. Throwing something that
 * is not an `Error` is legal JavaScript, so it is normalised to a string before it reaches a log.
 */
function describeThrown(exception: unknown): string {
  if (exception instanceof Error) {
    return exception.stack ?? `${exception.name}: ${exception.message}`;
  }
  try {
    return `Non-Error thrown: ${JSON.stringify(exception)}`;
  } catch {
    return "Non-Error thrown: <unserializable>";
  }
}
