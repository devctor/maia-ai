import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import {
  generateInsightSchema,
  type GenerateInsightData,
  type Insight,
} from "@maia/contracts";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { isAppError } from "../common/errors";
import { UsersService } from "../users/users.service";
import { InsightsService } from "./insights.service";

@Controller("insights")
export class InsightsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly insightsService: InsightsService,
  ) {}

  @Post()
  async generate(
    @Body(new ZodValidationPipe(generateInsightSchema)) body: GenerateInsightData,
    @Req() request: Request,
  ): Promise<Insight> {
    const user = await this.usersService.getDemoUser();
    return this.insightsService.generate(user.id, body, { signal: abortSignalFrom(request) });
  }

  @Get("latest")
  async latest(): Promise<Insight> {
    const user = await this.usersService.getDemoUser();
    return this.insightsService.latest(user.id);
  }

  /**
   * Server-Sent Events.
   *
   * The stream carries two different things and they are not interchangeable:
   * - `token`: raw model text for progressive display. Untrusted, possibly malformed, never shown as
   *   the answer.
   * - `insight`: the validated, guarded, persisted insight. This is the only terminal success event.
   *
   * A failure before the first write becomes a normal HTTP error response; a failure after it is an
   * `error` event. A client that disconnects mid-generation cancels the provider call, so we stop
   * spending quota on an answer nobody will read.
   */
  @Post("stream")
  async stream(
    @Body(new ZodValidationPipe(generateInsightSchema)) body: GenerateInsightData,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.usersService.getDemoUser();
    const controller = new AbortController();
    request.on("close", () => controller.abort());

    try {
      const insight = await this.insightsService.generate(user.id, body, {
        signal: controller.signal,
        onDelta: (delta) => {
          if (!response.writableEnded) {
            writeEvent(response, "token", { delta });
          }
        },
      });

      if (!response.writableEnded) {
        writeEvent(response, "insight", insight);
        response.end();
      }
    } catch (error) {
      if (response.headersSent) {
        if (!response.writableEnded) {
          writeEvent(response, "error", toErrorEvent(error));
          response.end();
        }
        return;
      }
      // Nothing was written yet, so the normal error envelope is the better response: the client
      // gets a status code and every error path in the API stays uniform.
      throw error;
    }
  }
}

function writeEvent(response: Response, event: string, data: unknown): void {
  if (!response.headersSent) {
    response.status(200);
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    // Disable proxy buffering: a buffered SSE stream arrives all at once, which defeats streaming.
    response.setHeader("x-accel-buffering", "no");
    response.flushHeaders();
  }
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function toErrorEvent(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
} {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      requestId: "stream",
    };
  }
  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Ocurrió un error inesperado",
    requestId: "stream",
  };
}

function abortSignalFrom(request: Request): AbortSignal | undefined {
  const controller = new AbortController();
  request.on("close", () => controller.abort());
  return controller.signal;
}
