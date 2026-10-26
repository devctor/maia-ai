import { Inject, Injectable } from "@nestjs/common";
import {
  INSIGHT_DISCLAIMER,
  MIN_CHECK_INS_FOR_INSIGHT,
  type GenerateInsightData,
  type Insight,
} from "@maia/contracts";
import { AI_PROVIDER, type AiProvider } from "../ai/ai-provider.interface";
import { assertNonDiagnostic } from "../ai/insight-guardrail";
import { parseInsightOutput } from "../ai/insight-output.parser";
import { CheckInsService } from "../check-ins/check-ins.service";
import { InsufficientDataError, NotFoundError } from "../common/errors";
import type { InsightRow } from "../db/schema";
import { InsightsRepository } from "./insights.repository";

/**
 * The business rules of an insight, in one place:
 *
 * 1. There must be enough history to say something that is not a single day.
 * 2. The provider produces raw text; it is parsed into the contract shape and then checked by the
 *    non-diagnostic guard.
 * 3. Only an accepted insight is persisted, together with the check-ins it was built from.
 *
 * The provider is an injected interface, so this class is testable without a network and a new
 * provider means one new implementation of `AiProvider`.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly insightsRepository: InsightsRepository,
    private readonly checkInsService: CheckInsService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /**
   * Shared by the JSON and the SSE endpoint. `onDelta` receives the raw model stream for progressive
   * display; it never receives the accepted insight, because nothing is shown as the final answer
   * before validation succeeds.
   */
  async generate(
    userId: string,
    input: GenerateInsightData,
    options: { signal?: AbortSignal; onDelta?: (delta: string) => void } = {},
  ): Promise<Insight> {
    const checkIns = await this.checkInsService.findRecentForContext(userId);
    if (checkIns.length < MIN_CHECK_INS_FOR_INSIGHT) {
      throw new InsufficientDataError(
        `Se necesitan al menos ${MIN_CHECK_INS_FOR_INSIGHT} registros para generar un insight. ` +
          "Registra un día más y vuelve a intentarlo.",
      );
    }

    const generation = await this.aiProvider.generateInsight(
      { checkIns, includeNotes: input.includeNotes },
      { signal: options.signal, onDelta: options.onDelta },
    );

    // Parse first (shape), guard second (meaning), persist last. A rejected output never reaches the
    // database, so a stored insight is always both well-formed and non-diagnostic.
    const content = parseInsightOutput(generation.text);
    assertNonDiagnostic(content);

    const row = await this.insightsRepository.create({
      userId,
      summary: content.summary,
      patterns: content.patterns,
      topicsToDiscuss: content.topicsToDiscuss,
      // The stored disclaimer is ours, not the model's: a model cannot be trusted to state its own
      // limitations, and this text must not drift with prompt changes.
      disclaimer: INSIGHT_DISCLAIMER,
      provider: generation.provider,
      model: generation.model,
      sourceCheckInIds: checkIns.map((checkIn) => checkIn.id),
    });

    return toInsightDto(row, checkIns.map((checkIn) => checkIn.id));
  }

  async latest(userId: string): Promise<Insight> {
    const row = await this.insightsRepository.findLatest(userId);
    if (!row) {
      throw new NotFoundError("Todavía no hay ningún insight generado");
    }
    const sourceCheckInIds = await this.insightsRepository.findSourceCheckInIds(row.id);
    return toInsightDto(row, sourceCheckInIds);
  }
}

function toInsightDto(row: InsightRow, sourceCheckInIds: string[]): Insight {
  return {
    id: row.id,
    userId: row.userId,
    summary: row.summary,
    patterns: row.patterns,
    topicsToDiscuss: row.topicsToDiscuss,
    disclaimer: row.disclaimer,
    provider: row.provider as Insight["provider"],
    model: row.model,
    sourceCheckInIds,
    createdAt: row.createdAt.toISOString(),
  };
}
