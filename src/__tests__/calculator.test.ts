import { describe, expect, it } from "vitest";
import {
  calculateSubscriptionVsUsage,
  type SubscriptionPlanInput,
} from "@/lib/calculator/subscription-vs-usage";
import { analyzeQuota, hasRealLimit } from "@/lib/calculator/quota";
import { costOfInteraction, monthlyApiCost } from "@/lib/pricing/cost";
import {
  assessFit,
  buildContextBudget,
  describeMaterialCapacity,
  sessionsPerConversation,
  tokensPerSession,
  translateContextWindow,
} from "@/lib/domain/equivalents";
import { getWorkProfile, resetsPerMonth } from "@/lib/domain/constants";
import type { ApiPricing } from "@/lib/domain/types";

/**
 * Plan con cuota MEDIBLE: tope por ventana de 5 h con número publicado.
 *
 * ADR 024: solo un plan `WINDOWED` con número es convertible a mensajes.
 * Los planes que el proveedor mide por tiers o multiplicadores no lo son,
 * aunque declaren un nivel alto.
 */
const CLAUDE_PRO: SubscriptionPlanInput = {
  monthlyPrice: 20,
  annualPrice: 200,
  quotaLevel: "MEDIUM",
  quotaKind: "WINDOWED",
  quotaResetPeriod: "HOURLY",
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
  });
});

describe("analyzeQuota", () => {
  it("detecta que la cuota no se agota con uso moderado", () => {
    // 45 msgs / 5h → 9.4 msgs por ventana con 45 al día. Muy por debajo.
    const quota = analyzeQuota(CLAUDE_PRO, 45);
    expect(quota.degraded).toBe(false);
    expect(quota.quotaHeadroom).toBeLessThan(1);
  });

  it("detecta degradación cuando el ritmo supera la cuota", () => {
    const quota = analyzeQuota(CLAUDE_PRO, 300);
    expect(quota.degraded).toBe(true);
  });

  it("no inventa una capacidad cuando el nivel no es numérico", () => {
    // ADR 020: "VERY_HIGH" no es un número, así que la capacidad NO es
    // calculable. Antes esto devolvía Infinity y la app decía "Sin límite".
    const quota = analyzeQuota(
      {
        quotaLevel: "VERY_HIGH",
        estimatedMessageCap: null,
        resetWindowHours: null,
        fallbackModelOnLimit: "GPT-6.2 Sol",
      },
      100,
    );
    expect(quota.isCalculable).toBe(false);
    expect(quota.level).toBe("VERY_HIGH");
    expect(quota.labelEs).toBe("Límite muy alto");
  });

  it("marca como no calculable un plan sin nivel ni número", () => {
    const quota = analyzeQuota({}, 100);
    expect(quota.isCalculable).toBe(false);
    expect(quota.level).toBe("UNKNOWN");
  });

  it("detecta que un plan con fallback tiene tope real", () => {
    expect(
      hasRealLimit({
        quotaLevel: "VERY_HIGH",
        estimatedMessageCap: null,
        fallbackModelOnLimit: "GPT-6.2 Sol",
      }),
    ).toBe(true);
    expect(
      hasRealLimit({
        quotaLevel: "UNLIMITED",
        estimatedMessageCap: null,
      }),
    ).toBe(false);
  });
});

describe("forma de medir la cuota (ADR 024)", () => {
  it("un plan medido por tiers no es convertible a mensajes", () => {
    // ChatGPT Plus: el chat de texto es ilimitado y lo que se limita son
    // las herramientas ("Expanded messages"). No hay número de mensajes.
    const quota = analyzeQuota(
      {
        quotaLevel: "HIGH",
        quotaKind: "TIERED",
        quotaResetPeriod: "UNKNOWN",
        estimatedMessageCap: null,
        fallbackModelOnLimit: "GPT-6.1 Sol",
      },
      100,
    );
    expect(quota.isCalculable).toBe(false);
    expect(quota.kind).toBe("TIERED");
  });

  it("un plan medido por multiplicador no es convertible a mensajes", () => {
    // Claude Max: "5x Pro usage". 5 veces más de un saldo que no conocemos
    // NO son 5 veces más mensajes.
    const quota = analyzeQuota(
      {
        quotaLevel: "VERY_HIGH",
        quotaKind: "MULTIPLIER",
        quotaResetPeriod: "UNKNOWN",
        estimatedMessageCap: null,
      },
      100,
    );
    expect(quota.isCalculable).toBe(false);
    expect(quota.kind).toBe("MULTIPLIER");
  });

  it("un plan con saldo compartido no es convertible a mensajes", () => {
    // xAI: un único saldo de uso entre Grok y Cursor, con reset semanal.
    const quota = analyzeQuota(
      {
        quotaLevel: "HIGH",
        quotaKind: "SHARED_POOL",
        quotaResetPeriod: "WEEKLY",
        estimatedMessageCap: null,
      },
      100,
    );
    expect(quota.isCalculable).toBe(false);
    expect(quota.resetPeriod).toBe("WEEKLY");
    expect(quota.resetLabel).toContain("semana");
  });

  it("un plan con número pero sin forma de medirlo tampoco cuenta", () => {
    // El número solo sirve si además sabemos cómo lo mide el proveedor.
    const quota = analyzeQuota(
      {
        quotaLevel: "HIGH",
        quotaKind: "TIERED",
        estimatedMessageCap: 45,
        resetWindowHours: 5,
      },
      100,
    );
    expect(quota.isCalculable).toBe(false);
  });

  it("la capacidad mensual es nula para un plan no medible", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 100, profile: "quick-question" },
      {
        monthlyPrice: 100,
        quotaLevel: "VERY_HIGH",
        quotaKind: "MULTIPLIER",
        quotaResetPeriod: "UNKNOWN",
        estimatedMessageCap: null,
        resetWindowHours: null,
        fallbackModelOnLimit: "GPT-6.2 Sol",
      },
      SONNET_PRICING,
    );
    expect(result.subscription.messagesPerMonthCapacity).toBeNull();
    expect(result.subscription.quotaLimited).toBe(false);
    // Pero el plan SÍ tiene tope: hay fallback.
    expect(result.subscription.hasRealLimit).toBe(true);
    expect(result.subscription.quotaKind).toBe("MULTIPLIER");
  });
});

describe("periodicidad del reset", () => {
  it("un pool semanal da menos reinicios al mes que uno horario", () => {
    // ADR 024: la periodicidad es lo que convierte "un tope por ventana"
    // en "mensajes al mes". Con el mismo tope nominal, un plan horario da
    // ~25x más mensajes que uno semanal.
    expect(resetsPerMonth("HOURLY")).toBe(720);
    expect(resetsPerMonth("DAILY")).toBe(30);
    expect(resetsPerMonth("WEEKLY")).toBeCloseTo(30 / 7, 6);
    expect(resetsPerMonth("MONTHLY")).toBe(1);
    expect(resetsPerMonth("UNKNOWN")).toBeNull();
  });

  it("la capacidad usa la periodicidad cuando no hay ventana en horas", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "quick-question" },
      {
        monthlyPrice: 20,
        quotaLevel: "HIGH",
        quotaKind: "WINDOWED",
        quotaResetPeriod: "DAILY",
        estimatedMessageCap: 50,
        resetWindowHours: null,
      },
      SONNET_PRICING,
    );
    // 50 msgs × 30 reinicios diarios = 1500 al mes
    expect(result.subscription.messagesPerMonthCapacity).toBe(1500);
    expect(result.subscription.quotaResetPeriod).toBe("DAILY");
  });
});

describe("calculateSubscriptionVsUsage", () => {
  it("gana el pago por uso con uso moderado", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 20, profile: "quick-question" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(result.recommendation.winner).toBe("usage");
    expect(result.usage.monthlyCost).toBeLessThan(20);
    expect(result.recommendation.savingsPerMonth).toBeGreaterThan(0);
  });

  it("gana la suscripción con uso intensivo", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 400, profile: "quick-question" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(result.usage.monthlyCost).toBeGreaterThan(20);
    expect(result.recommendation.winner).toBe("subscription");
  });

  it("un perfil más caro consume más tokens y cuesta más", () => {
    // ADR 021: el eje único de perfiles sustituye a los dos multiplicadores.
    const cheap = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "quick-question" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    const expensive = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "repo-work" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(expensive.inputTokensPerInteraction).toBeGreaterThan(
      cheap.inputTokensPerInteraction,
    );
    expect(expensive.usage.monthlyCost).toBeGreaterThan(cheap.usage.monthlyCost);
  });

  it("traduce la cuota por ventana a capacidad mensual", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "quick-question" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    // 22 días * 24h / 5h = 105.6 resets al mes * 45 = 4752
    expect(result.subscription.messagesPerMonthCapacity).toBe(4752);
    expect(result.subscription.quotaLimited).toBe(true);
    expect(result.subscription.overflowMessages).toBe(0);
  });

  it("la capacidad mensual no es calculable sin nivel numérico", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 100, profile: "quick-question" },
      {
        monthlyPrice: 100,
        quotaLevel: "VERY_HIGH",
        estimatedMessageCap: null,
        resetWindowHours: null,
        fallbackModelOnLimit: "GPT-6.2 Sol",
      },
      SONNET_PRICING,
    );
    expect(result.subscription.messagesPerMonthCapacity).toBeNull();
    expect(result.subscription.quotaLimited).toBe(false);
    // Pero el plan SÍ tiene tope: hay fallback.
    expect(result.subscription.hasRealLimit).toBe(true);
  });

  it("el cálculo mensual de la API es coherente con el coste unitario", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "quick-question" },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    const tolerance = 0.005 * result.interactionsPerMonth + 0.01;
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
        profile: "quick-question",
        workingDaysPerMonth: 30,
      },
      CLAUDE_PRO,
      SONNET_PRICING,
    );
    expect(result.interactionsPerMonth).toBe(300);
  });

  // ── Veredicto de restricción (ADR 018) ──

  it("señala la cuota como restricción cuando se supera", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 200, profile: "quick-question" },
      {
        monthlyPrice: 20,
        quotaLevel: "LIMITED",
        quotaKind: "WINDOWED",
        quotaResetPeriod: "HOURLY",
        estimatedMessageCap: 10,
        resetWindowHours: 1,
        fallbackModelOnLimit: "Modelo mini",
      },
      SONNET_PRICING,
      { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
    );
    // 10 msgs/hora × (22×24) = 5.280 de capacidad vs 200×22 = 4.400 de uso
    // → cabe, así que hay que subir el uso para desbordar.
    expect(result.subscription.overflowMessages).toBe(0);

    const overflow = calculateSubscriptionVsUsage(
      { messagesPerDay: 400, profile: "quick-question" },
      {
        monthlyPrice: 20,
        quotaLevel: "LIMITED",
        quotaKind: "WINDOWED",
        quotaResetPeriod: "HOURLY",
        estimatedMessageCap: 10,
        resetWindowHours: 1,
        fallbackModelOnLimit: "Modelo mini",
      },
      SONNET_PRICING,
      { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
    );
    // 8.800 de uso vs 5.280 de capacidad → desborda
    expect(overflow.subscription.overflowMessages).toBeGreaterThan(0);
    expect(overflow.binding.constraint).toBe("quota");
    expect(overflow.binding.labelEs).toContain("cuota");
  });

  it("señala la ventana como restricción cuando el material no cabe", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 20, profile: "repo-work" },
      CLAUDE_PRO,
      SONNET_PRICING,
      { contextWindow: 8_000, maxOutputTokens: 4_000 },
    );
    expect(result.context.fitLevel).toBe("DOES_NOT_FIT");
    expect(result.binding.constraint).toBe("context");
  });

  it("no señala ninguna restricción cuando todo encaja", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "quick-question" },
      CLAUDE_PRO,
      SONNET_PRICING,
      { contextWindow: 1_050_000, maxOutputTokens: 128_000 },
    );
    expect(result.binding.constraint).toBe("none");
  });

  it("calcula las sesiones que caben en la ventana", () => {
    const result = calculateSubscriptionVsUsage(
      { messagesPerDay: 10, profile: "code-review", sessionTurns: 20 },
      CLAUDE_PRO,
      SONNET_PRICING,
      { contextWindow: 1_050_000, maxOutputTokens: 128_000 },
    );
    // Sesión = 4000 in + 20 turnos × 1500 out = 34.000 tokens
    expect(result.context.tokensPerSession).toBe(34_000);
    expect(result.context.sessionsPerConversation).toBe(30);
  });
});

describe("presupuesto de contexto (ADR 019)", () => {
  it("la entrada y la salida comparten presupuesto", () => {
    const budget = buildContextBudget(1_050_000, 128_000);
    expect(budget.totalTokens).toBe(1_050_000);
    // NO es 1.050.000 + 128.000: la respuesta se come parte de la ventana.
    expect(budget.usableInputTokens).toBe(922_000);
    expect(budget.maxOutputTokens).toBe(128_000);
  });

  it("sin tope de salida, el input usa todo el presupuesto", () => {
    const budget = buildContextBudget(200_000, null);
    expect(budget.usableInputTokens).toBe(200_000);
  });

  it("gestiona contexto desconocido", () => {
    const budget = buildContextBudget(null, null);
    expect(budget.totalTokens).toBeNull();
    expect(budget.usableInputTokens).toBeNull();
  });
});

describe("sesiones (ADR 018)", () => {
  it("el contexto acumula: la entrada se paga una vez", () => {
    const profile = getWorkProfile("code-review");
    // 4000 + 20×1500 = 34.000, NO 20×(4000+1500)=110.000.
    expect(tokensPerSession(profile, 20)).toBe(34_000);
  });

  it("calcula cuántas sesiones caben en la ventana", () => {
    const profile = getWorkProfile("quick-question");
    // 400 + 20×300 = 6400 tokens por sesión → 1.000.000/6400 = 156
    expect(sessionsPerConversation(1_000_000, profile, 20)).toBe(156);
  });

  it("devuelve null si no hay ventana", () => {
    const profile = getWorkProfile("quick-question");
    expect(sessionsPerConversation(null, profile, 20)).toBeNull();
  });
});

describe("assessFit", () => {
  it("distingue 'no cabe de una sentada' de 'no cabe ni por partes'", () => {
    const profile = getWorkProfile("repo-work");
    // 80.000 tokens de entrada, 32.768 de ventana → no cabe de ninguna manera
    const impossible = assessFit(32_768, profile, 20, "ALL_AT_ONCE");
    expect(impossible.level).toBe("DOES_NOT_FIT");

    // Pero sí se puede repartir en varias conversaciones.
    const split = assessFit(32_768, profile, 20, "PASTE");
    expect(split.level).toBe("SPLIT_REQUIRED");
  });

  it("con el repo conectado la ventana deja de ser el límite", () => {
    const profile = getWorkProfile("repo-work");
    const result = assessFit(32_768, profile, 20, "CONNECTED");
    expect(result.level).toBe("FITS");
    expect(result.detailEs).toContain("cuota");
  });

  it("marca el encaje justo cuando solo cabe una sesión", () => {
    const profile = getWorkProfile("repo-work");
    // Sesión = 80.000 + 20×8000 = 240.000 tokens; ventana de 250.000 → 1 sesión
    const result = assessFit(250_000, profile, 20, "PASTE");
    expect(result.level).toBe("TIGHT");
  });
});

describe("translateContextWindow", () => {
  it("traduce tokens a páginas", () => {
    expect(translateContextWindow(200_000).pages).toBe(400);
  });

  it("traduce tokens a novelas cortas", () => {
    expect(translateContextWindow(100_000).novels).toBeCloseTo(1, 5);
  });

  it("traduce tokens a líneas de código", () => {
    // 200.000 tokens / 5 tokens por línea = 40.000 líneas
    expect(translateContextWindow(200_000).codeLines).toBe(40_000);
  });

  it("gestiona contexto desconocido", () => {
    const result = translateContextWindow(null);
    expect(result.pages).toBe(0);
    expect(result.labelEs).toContain("desconocida");
  });
});

describe("describeMaterialCapacity", () => {
  it("dice 'cabe un proyecto entero' con ventana grande", () => {
    const result = describeMaterialCapacity(1_050_000);
    expect(result?.label).toBe("Cabe un proyecto entero");
  });

  it("avisa de ventana corta", () => {
    // 512 tokens: solo cabe material diminuto.
    const result = describeMaterialCapacity(512);
    expect(result?.label).toBe("Ventana corta");
  });

  it("distingue repositorio de fichero grande", () => {
    expect(describeMaterialCapacity(8_000)?.label).toBe("Cabe un repositorio");
    expect(describeMaterialCapacity(2_000)?.label).toBe("Cabe un fichero grande");
  });

  it("devuelve null sin ventana", () => {
    expect(describeMaterialCapacity(null)).toBeNull();
  });
});

describe("monthlyApiCost", () => {
  it("es lineal con el número de interacciones", () => {
    const one = monthlyApiCost(SONNET_PRICING, 1, 1000, 1000);
    const ten = monthlyApiCost(SONNET_PRICING, 10, 1000, 1000);
    expect(ten).toBeCloseTo(one * 10, 6);
  });
});
