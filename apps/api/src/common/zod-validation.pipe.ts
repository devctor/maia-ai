import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, z } from "zod";
import { ValidationError } from "./errors";

/**
 * Validation belongs at the boundary, executed on the payload that actually arrived.
 *
 * DTO classes plus `class-validator` would duplicate the rules that `@maia/contracts` already owns,
 * which is exactly the drift that package exists to prevent. A controller declares the schema once:
 *
 *     @Body(new ZodValidationPipe(createCheckInSchema)) body: CreateCheckInData
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new ValidationError("Los datos enviados no son válidos", {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
