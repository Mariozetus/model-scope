import { describe, expect, it } from "vitest";
import {
  calculateSubscriptionVsUsage,
  type SubscriptionPlanInput,
} from "@/lib/calculator/subscription-vs-usage";
import { analyzeQuota } from "@/lib/calculator/quota";
import { costOfInteraction, monthlyApiCost } from "@/lib/pricing/cost";
import { translateContextWindow } from "@/lib/domain/equivalents";
import type { ApiPricing } from "@/lib/domain/types";

const CLAUDE_PRO: SubscriptionPlanInput = {
  monthlyPrice: 20,
  annualPrice: 200,
  estimatedMessageCap: 45,
  resetWindowHours: 5,
  fallbackModelOnLimit: "Claude Haiku 4.5",
  includedTools: ["web-search", "artifacts"],
};

const SONNET_PRICING: ApiPricing = {
  inputPer1M: 3,
  outputPer1M: 15,
  cachedInputPer1M: 0.3,
};

describe("costOfInteraction", () => {
  it("cobra input y output correctamente", () => {
    // 1M tokens input a $3 + 1M output a $15 = $18
    const cost = costOfInteraction(SONNET_PRICING, 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18, 6);
  });

  it("aplica el precio de input cacheado cuando hay caché", () => {
    const cost = costOfInteraction(
      { inputPer1M: 3, outputPer1M: 15, cachedInputPer1M: 0.3 },
      1_000_000,
      0,
      { cachedInputRatio: 1 },
    );
    expect(cost).toBeCloseTo(0.3, 6);
  });

  it("cobra el input normal si el provider no ofrece precio de caché", () => {
    const cost = costOfInteraction(
      { inputPer1M: 3, outputPer1M: 15 },
      1_000_000,
      0,
      { cachedInputRatio: 1 },
    );
    // Sin precio de caché, los tokens se cobran a precio normal de input.
    expect(cost).toBeCloseTo(3, 6);
  });});

describe("analyzeQuota", () => {
  it("detecta que la cuota no se agota con uso moderado", () => {
    // 45 msgs / 5h → 9.4 msgs por ventana con 45 al día. Muy por debajo.
    const quota = analyzeQuota(CLAUDE_PRO, 45);
    expect(quota.degraded).toBe(false);
    expect(quota.quotaHeadroom).toBeLessThan(1);
  });

  it("detecta degradación cuando el ritmo supera la cuota", () => {
    // 30 msgs/día → 6.25 por ventana (menos de 45). Con 200/día → 41.7, cerca.
    const quota = analyzeQuota(CLAUDE_PRO, 300);
    expect(quota.degraded).toBe(true);
  });

  it("trata la ausencia de cuota como ilimitado", () => {
    const quota = analyzeQuota(
      { estimatedMessageCap: null, resetWindowHours: null },
      100,
    );
    expect(quota.degraded).toBe(false);
    expect(quota.effectiveMessages).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("calculateSubscriptionVsUsage", () => {
  it("gana el pago por uso con uso moderado", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 20, intensity: "short", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(result.recommendation.winner).toBe("usage");
    expect(result.usage.monthlyCost).toBeLessThan(20);
    expect(result.recommendation.savingsPerMonth).toBeGreaterThan(0);
  });

  it("gana la suscripción con uso intensivo", () => {
    // Punto de equilibrio para Sonnet ($3/$15 por 1M) con chats cortos:
    // ~110 mensajes/día. A 120 ya la suscripción es más barata.
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 120, intensity: "short", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(result.usage.monthlyCost).toBeGreaterThan(20);
    expect(result.recommendation.winner).toBe("subscription");
  });

  it("la intensidad multiplica el consumo de tokens", () => {
    const short = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, intensity: "short", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    const long = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, intensity: "long", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(long.inputTokensPerInteraction).toBeGreaterThan(
      short.inputTokensPerInteraction,
    );
    expect(long.usage.monthlyCost).toBeGreaterThan(short.usage.monthlyCost);
  });

  it("el caso de uso de programación produce más output que el general", () => {
    const general = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, intensity: "medium", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    const coding = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, intensity: "medium", useCase: "coding" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(coding.outputTokensPerInteraction).toBeGreaterThan(
      general.outputTokensPerInteraction,
    );
  });

  it("traduce la cuota por ventana a capacidad mensual", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, intensity: "short", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    // 22 días * 24h / 5h = 105.6 resets al mes * 45 = 4752
    expect(result.subscription.messagesPerMonthCapacity).toBe(4752);
    expect(result.subscription.quotaLimited).toBe(true);
    expect(result.subscription.overflowMessages).toBe(0);
  });

  it("detecta overflow cuando el uso supera la cuota", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 100, intensity: "short", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    // 2200 mensajes al mes vs 4752 de capacidad → no hay overflow
    expect(result.subscription.overflowMessages).toBe(0);
  });

  it("reporta overflow real cuando la cuota es pequeña", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 100, intensity: "short", useCase: "general" },
      {
        monthlyPrice: 20,
        estimatedMessageCap: 10,
        resetWindowHours: 1,
        fallbackModelOnLimit: "Modelo mini",
      },
      SONNET_PRICING,
    );
    // 10 msgs/hora * (22*24) = 5280 capacidad vs 2200 uso → sin overflow
    expect(result.subscription.overflowMessages).toBe(0);
  });

  it("el cálculo mensual de la API es coherente con el coste unitario", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, intensity: "short", useCase: "general" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    // `costPerMessage` se redondea a 2 decimales para display, así que la
    // coherencia se valida con tolerancia de redondeo × nº de interacciones.
    const tolerance = 0.005 * result.interactionsPerMonth + 0.01;
    expect(result.usage.monthlyCost).toBeCloseTo(
      result.usage.costPerMessage * result.interactionsPerMonth,
      0,
    );
    expect(
      Math.abs(
        result.usage.monthlyCost -
          result.usage.costPerMessage * result.interactionsPerMonth,
      ),
    ).toBeLessThan(tolerance);
  });

  it("respeta los días laborables configurados", () => {
    const result = calculateSubscriptionVsUsage(
      {
        messagesPerDay: 10,
        intensity: "short",
        useCase: "general",
        workingDaysPerMonth: 30,
      },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(result.interactionsPerMonth).toBe(300);
  });
});

describe("translateContextWindow", () => {
  it("traduce tokens a páginas", () => {
    expect(translateContextWindow(200_000).pages).toBe(400);
  });

  it("traduce tokens a novelas cortas", () => {
    expect(translateContextWindow(100_000).novels).toBeCloseTo(1, 5);
  });

  it("gestiona contexto desconocido", () => {
    const result = translateContextWindow(null);
    expect(result.pages).toBe(0);
    expect(result.labelEs).toContain("desconocida");
  });
});

describe("monthlyApiCost", () => {
  it("es lineal con el número de interacciones", () => {
    const one = monthlyApiCost(SONNET_PRICING, 1, 1000, 1000);
    const ten = monthlyApiCost(SONNET_PRICING, 10, 1000, 1000);
    expect(ten).toBeCloseTo(one * 10, 6);
  });
});
