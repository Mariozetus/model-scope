/**
 * Calculadora "¿Suscripción o Pago por Uso?" — Módulo C del MVP.
 *
 * Compara el coste mensual fijo de una suscripción frente al coste estimado
 * usando API / agregador para el volumen EXACTO que el usuario declara.
 */

import {
  DEFAULT_WORKING_DAYS_PER_MONTH,
  INTENSITY_PROFILES,
  type IntensityKey,
  type UseCaseKey,
} from "@/lib/domain/constants";
import type { ApiPricing } from "@/lib/domain/types";
import { monthlyApiCost } from "@/lib/pricing/cost";
import { round2 } from "@/lib/scoring/normalize";

/** Multiplicadores de tokens según el caso de uso principal. */
export const USE_CASE_MULTIPLIERS: Record<
  UseCaseKey,
  { input: number; output: number; label: string }
> = {
  // Más contexto (repos, docs) + más salida (código).
  general: { input: 1.0, output: 1.0, label: "General" },
  coding: { input: 1.3, output: 1.8, label: "Programación" },
  // Mucho input (CSV, tablas), salida corta.
  "data-analysis": { input: 2.0, output: 0.6, label: "Análisis de datos" },
};

/** Perfil de consumo según los sliders de la calculadora. */
export interface CalculatorInput {
  /** Mensajes o consultas al día (5..100). */
  messagesPerDay: number;
  intensity: IntensityKey;
  useCase: UseCaseKey;
  /** Días laborables al mes (por defecto 22). */
  workingDaysPerMonth?: number;
}

/** Datos del plan de suscripción que evalúa la calculadora. */
export interface SubscriptionPlanInput {
  monthlyPrice: number;
  annualPrice?: number | null;
  /** Nº de mensajes por ventana de reset. null = ilimitado. */
  estimatedMessageCap?: number | null;
  /** Horas de la ventana de reset. null = ilimitado. */
  resetWindowHours?: number | null;
  fallbackModelOnLimit?: string | null;
  includedTools?: string[];
  freeTier?: boolean;
  freeTierQuotaNote?: string | null;
}

export type Winner = "subscription" | "usage" | "tie";

export interface CalculatorResult {
  input: Required<CalculatorInput>;

  interactionsPerMonth: number;
  inputTokensPerInteraction: number;
  outputTokensPerInteraction: number;

  subscription: {
    monthlyCost: number;
    annualMonthlyCost: number | null;
    /** Capacidad mensual traducida desde la cuota por ventana. null = ilimitado. */
    messagesPerMonthCapacity: number | null;
    quotaLimited: boolean;
    /** Coste por mensaje si la cuota es el factor limitante. */
    effectiveCostPerMessage: number | null;
    /** Mensajes que se degradarían a modelo fallback. */
    overflowMessages: number;
    includedTools: string[];
  };

  usage: {
    monthlyCost: number;
    costPerMessage: number;
    tokensPerMonth: number;
  };

  recommendation: {
    winner: Winner;
    savingsPerMonth: number;
    reason: string;
  };

  /** "Mensajes reales" obtenidos con el mismo dinero bajo cada vía. */
  messagesPerDollar: { subscription: number; usage: number };
}

export function calculateSubscriptionVsUsage(
  input: CalculatorInput,
  plan: SubscriptionPlanInput,
  apiPricing: ApiPricing,
): CalculatorResult {
  const workingDaysPerMonth =
    input.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS_PER_MONTH;
  const profile = INTENSITY_PROFILES[input.intensity];
  const mult = USE_CASE_MULTIPLIERS[input.useCase];

  const inputTokens = Math.round(profile.inputTokens * mult.input);
  const outputTokens = Math.round(profile.outputTokens * mult.output);
  const interactionsPerMonth = Math.round(
    input.messagesPerDay * workingDaysPerMonth,
  );

  // ── VÍA A: SUSCRIPCIÓN ──────────────────────────────────────
  const monthlyCost = plan.monthlyPrice;
  const annualMonthlyCost =
    plan.annualPrice != null ? plan.annualPrice / 12 : null;

  let messagesPerMonthCapacity: number | null = null;
  if (
    plan.estimatedMessageCap != null &&
    plan.resetWindowHours != null
  ) {
    const resetsPerMonth = (workingDaysPerMonth * 24) / plan.resetWindowHours;
    messagesPerMonthCapacity = Math.round(
      plan.estimatedMessageCap * resetsPerMonth,
    );
  }

  const quotaLimited = messagesPerMonthCapacity != null;
  const overflowMessages = quotaLimited
    ? Math.max(0, interactionsPerMonth - messagesPerMonthCapacity!)
    : 0;

  const effectiveCostPerMessage =
    quotaLimited && messagesPerMonthCapacity! > 0
      ? monthlyCost / messagesPerMonthCapacity!
      : null;

  // ── VÍA B: USO (API / AGREGADOR) ─────────────────────────────
  const usageCost = monthlyApiCost(
    apiPricing,
    interactionsPerMonth,
    inputTokens,
    outputTokens,
  );
  const costPerMessage =
    interactionsPerMonth > 0 ? usageCost / interactionsPerMonth : 0;
  const tokensPerMonth = interactionsPerMonth * (inputTokens + outputTokens);

  // ── COMPARACIÓN ─────────────────────────────────────────────
  // La suscripción solo "gana" si cubre el uso real sin degradar.
  // El overflow no cuesta dinero al usuario, pero degrada la calidad:
  // por eso penaliza el razonamiento, no el precio.
  const subscriptionCoversUsage = !quotaLimited || overflowMessages === 0;
  const fallback = plan.fallbackModelOnLimit ?? "un modelo reducido";

  let winner: Winner;
  let savingsPerMonth: number;
  let reason: string;

  if (interactionsPerMonth === 0) {
    winner = "tie";
    savingsPerMonth = 0;
    reason = "Configura un volumen de uso para comparar ambas vías.";
  } else if (monthlyCost < usageCost) {
    winner = "subscription";
    savingsPerMonth = round2(usageCost - monthlyCost);
    if (!subscriptionCoversUsage) {
      reason =
        `La suscripción es más barata (ahorra $${savingsPerMonth.toFixed(2)}/mes), ` +
        `pero ${overflowMessages} de tus ${interactionsPerMonth} mensajes ` +
        `caerían en ${fallback}.`;
    } else if (quotaLimited) {
      reason =
        `La suscripción cubre tus ${interactionsPerMonth} mensajes/mes ` +
        `sin degradar a ${fallback} y te ahorra $${savingsPerMonth.toFixed(2)} frente al pago por uso.`;
    } else {
      reason =
        `La suscripción es ilimitada y te ahorra $${savingsPerMonth.toFixed(2)} frente al pago por uso.`;
    }
  } else if (monthlyCost > usageCost) {
    winner = "usage";
    savingsPerMonth = round2(monthlyCost - usageCost);
    if (!subscriptionCoversUsage) {
      reason =
        `Doble victoria del pago por uso: la cuota se agota ` +
        `(${overflowMessages} mensajes hacia ${fallback}) y además es más barato ` +
        `($${savingsPerMonth.toFixed(2)}/mes de ahorro).`;
    } else {
      reason =
        `El pago por uso es más barato por mensaje ` +
        `($${costPerMessage.toFixed(4)} vs $${(monthlyCost / interactionsPerMonth).toFixed(4)} ` +
        `de la suscripción): ahorras $${savingsPerMonth.toFixed(2)}/mes.`;
    }
  } else {
    winner = "tie";
    savingsPerMonth = 0;
    reason =
      `Empate técnico: ambas vías cuestan $${monthlyCost.toFixed(2)}/mes. ` +
      `La suscripción te da además ${plan.includedTools?.length ?? 0} herramientas incluidas.`;
  }

  const messagesPerDollar = {
    subscription:
      monthlyCost > 0
        ? quotaLimited
          ? messagesPerMonthCapacity! / monthlyCost
          : Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY,
    usage: usageCost > 0 ? interactionsPerMonth / usageCost : Number.POSITIVE_INFINITY,
  };

  return {
    input: {
      messagesPerDay: input.messagesPerDay,
      intensity: input.intensity,
      useCase: input.useCase,
      workingDaysPerMonth,
    },
    interactionsPerMonth,
    inputTokensPerInteraction: inputTokens,
    outputTokensPerInteraction: outputTokens,
    subscription: {
      monthlyCost,
      annualMonthlyCost,
      messagesPerMonthCapacity,
      quotaLimited,
      effectiveCostPerMessage,
      overflowMessages,
      includedTools: plan.includedTools ?? [],
    },
    usage: {
      monthlyCost: round2(usageCost),
      costPerMessage: round2(costPerMessage),
      tokensPerMonth,
    },
    recommendation: { winner, savingsPerMonth, reason },
    messagesPerDollar,
  };
}
