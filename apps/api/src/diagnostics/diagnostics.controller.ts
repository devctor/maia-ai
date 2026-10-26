import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import type { AppConfig } from "../config/env";
import { APP_CONFIG } from "../db/database.module";

/**
 * Throwing routes that exist so the error envelope can be proven from a real response.
 *
 * The filter's most valuable guarantees — an unexpected failure never leaks its message, stack, SQL
 * or provider payload — are only observable through an HTTP response. No production route fails on
 * demand, and a test-only branch inside a real route would make that route lie about its behavior.
 *
 * So the controller is always mounted but answers `404` unless `DIAGNOSTICS_ENABLED` is true. Tests
 * turn it on; a deployment leaves it off. The guard reads typed config instead of `NODE_ENV` so it
 * is one explicit switch rather than an inference.
 */
@Controller("diagnostics")
export class DiagnosticsController {
  constructor(@Inject(APP_CONFIG) private readonly appConfig: AppConfig) {}

  /** An `HttpException` carrying an internal message and a metadata payload, as a driver would. */
  @Get("http-exception")
  httpException(): never {
    this.assertEnabled();
    throw new HttpException(
      {
        message: "postgresql://maia:super-secret@db:5432/maia_care",
        error: "Internal Server Error",
        details: { sql: "select * from users where email = $1" },
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /** An `HttpException` in the 4xx range, whose message is meant to reach the client. */
  @Get("http-exception-client")
  httpExceptionClient(): never {
    this.assertEnabled();
    throw new HttpException({ message: "El recurso pidió algo imposible" }, HttpStatus.CONFLICT);
  }

  /** A non-`Error` throw, the shape most likely to explode inside a logger. */
  @Get("non-error")
  nonError(): never {
    this.assertEnabled();
    throw { apiKey: "gemini-key-should-never-be-logged" };
  }

  /** A plain `Error`, so the catch-all path is observable with a real stack. */
  @Get("plain-error")
  plainError(): never {
    this.assertEnabled();
    throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
  }

  private assertEnabled(): void {
    if (!this.appConfig.diagnosticsEnabled) {
      throw new NotFoundException();
    }
  }
}
