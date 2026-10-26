import { describe, expect, it } from "vitest";
import { AiGuardrailError } from "../common/errors";
import { assertNonDiagnostic, DIAGNOSTIC_PATTERNS } from "./insight-guardrail";

const benign = {
  summary: "Los registros muestran variaciones en el sueño y la energía.",
  patterns: ["El sueño cambió entre dos registros.", "La energía se mantuvo estable."],
  topicsToDiscuss: ["Hablar de la rutina de descanso.", "Preparar preguntas para la consulta."],
};

describe("assertNonDiagnostic", () => {
  it("rejects diagnostic language", () => {
    expect(() =>
      assertNonDiagnostic({ ...benign, summary: "El diagnóstico indica que padeces Migraine." }),
    ).toThrow(AiGuardrailError);
  });

  it("rejects medication advice", () => {
    expect(() =>
      assertNonDiagnostic({
        ...benign,
        topicsToDiscuss: ["Deberías tomar una pastilla todos los días."],
      }),
    ).toThrow(AiGuardrailError);
  });

  it("accepts benign descriptive content", () => {
    expect(() => assertNonDiagnostic(benign)).not.toThrow();
  });

  it("matches diagnostic phrases without regard to case or accents", () => {
    expect(() =>
      assertNonDiagnostic({ ...benign, summary: "DIAGNOSTICO: Padecescefalea." }),
    ).toThrow(AiGuardrailError);
    expect(DIAGNOSTIC_PATTERNS.length).toBeGreaterThan(0);
  });
});
