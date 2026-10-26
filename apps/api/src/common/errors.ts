import type { ErrorCode } from "@maia/contracts";

/**
 * Errors the services raise on purpose. Each carries the HTTP status and a stable machine code, so
 * controllers stay free of status-code decisions and the UI never parses a message string.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", 400, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "No se encontró el recurso solicitado") {
    super("NOT_FOUND", 404, message);
  }
}

export class InsufficientDataError extends AppError {
  constructor(message: string) {
    super("INSUFFICIENT_DATA", 422, message);
  }
}

export class AiUnavailableError extends AppError {
  constructor(
    message = "El servicio de IA no está disponible en este momento",
    readonly retryable = true,
  ) {
    super("AI_UNAVAILABLE", 503, message, { retryable });
  }
}

export class AiTimeoutError extends AppError {
  constructor(message = "El servicio de IA tardó demasiado en responder") {
    super("AI_TIMEOUT", 504, message);
  }
}

export class AiGuardrailError extends AppError {
  constructor(message = "La respuesta de la IA no cumplió las reglas de contenido seguro") {
    super("AI_GUARDRAIL_REJECTED", 422, message);
  }
}

export class AiInvalidResponseError extends AppError {
  constructor(message = "La respuesta de la IA no tuvo el formato esperado") {
    super("AI_INVALID_RESPONSE", 502, message);
  }
}

export class StreamAbortedError extends AppError {
  constructor() {
    super("AI_STREAM_ABORTED", 499, "El cliente cerró la conexión antes de terminar");
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
