import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Every request carries an id, echoed in the error envelope and in logs. When a user reports a
 * failure, the id is the only thing needed to find the exact request in the log stream.
 */
export function requestIdMiddleware(
  request: Request & { requestId?: string },
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header("x-request-id");
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
