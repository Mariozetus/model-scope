/**
 * Calculadora "¿Suscripción o Pago por Uso?" — Módulo C del MVP.
 *
 * Compara el coste mensual fijo de una suscripción frente al coste estimado
 * usando API / agregador para el volumen EXACTO que el usuario declara.
 *
 * ADR 018: la SESIÓN es la unidad de trabajo. Cuota y ventana son
 * restricciones ORTOGONALES y el resultado dice cuál de las dos frena al
 * usuario.
 */

import {
  DEFAULT_WORKING_DAYS_PER_MONTH,
  DEFAULT_SESSION_TURNS,
  getWorkProfile,
  quotaLevelHasNumber,
  resetsPerMonth,
  type WorkProfileKey,
} from "@/lib/domain/constants";
import type {
  ApiPricing,
  QuotaKind,
  QuotaLevel,
  QuotaResetPeriod,
  WorkMode,
} from "@/lib/domain/types";
import { monthlyApiCost } from "@/lib/pricing/cost";
import { round2 } from "@/lib/scoring/normalize";
import { assessFit, sessionsPerConversation, tokensPerSession } from "@/lib/domain/equivalents";

export interface CalculatorInput {
  /** Mensajes o consultas al día (5..100). */
  messagesPerDay: number;
  /** Perfil de trabajo: qué hace el usuario y con cuánto material. */
  profile: WorkProfileKey;
  /** Cómo consume el material (pega, repo conectado, todo de golpe). */
  mode?: WorkMode;
  /** Nº de intercambios por sesión de trabajo. */
  sessionTurns?: number;
  /** Días laborables al mes (por defecto 22). */
  workingDaysPerMonth?: number;
}

/** Datos del plan de suscripción que evalúa la calculadora. */
export interface SubscriptionPlanInput {
  monthlyPrice: number;
  annualPrice?: number | null;
  /** Nivel de cuota del plan (ADR 020). */
  quotaLevel?: QuotaLevel;
  /** Nº de mensajes por ventana de reset. null = el proveedor no lo publica. */
  estimatedMessageCap?: number | null;
  /** Horas de la ventana de reset. null = no aplica. */
  resetWindowHours?: number | null;
  /** Periodicidad del reset de la cuota (ADR 024). */
  quotaResetPeriod?: QuotaResetPeriod;
  /** Cómo mide el proveedor la cuota (ADR 024). */
  quotaKind?: QuotaKind;
  fallbackModelOnLimit?: string | null;
  includedTools?: string[];
  freeTier?: boolean;
  freeTierQuotaNote?: string | null;
}

/** Contexto del modelo para el cruce cuota vs ventana. */
export interface ModelContext {
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  name?: string;
}

export type Winner = "subscription" | "usage" | "tie";

/** Qué restricción va a frenar al usuario. */
export type BindingConstraint = "quota" | "context" | "none";

export interface CalculatorResult {
  input: Required<CalculatorInput>;

  interactionsPerMonth: number;
  inputTokensPerInteraction: number;
  outputTokensPerInteraction: number;

  subscription: {
    monthlyCost: number;
    annualMonthlyCost: number | null;
    /** Capacidad mensual traducida desde la cuota por ventana. null = no calculable. */
    messagesPerMonthCapacity: number | null;
    /** true si la cuota es calculable (nivel numérico publicado). */
    quotaLimited: boolean;
    /** true si el plan tiene un tope real, sea conocido o no. */
    hasRealLimit: boolean;
    /** Nivel de cuota del plan. */
    quotaLevel: QuotaLevel;
    /** Cómo mide el proveedor la cuota. */
    quotaKind: QuotaKind;
    /** Periodicidad del reset de la cuota. */
    quotaResetPeriod: QuotaResetPeriod;
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

  /** Sesiones que caben en la ventana del modelo (restricción de contexto). */
  context: {
    sessionsPerConversation: number | null;
    tokensPerSession: number;
    fitLevel: "FITS" | "TIGHT" | "SPLIT_REQUIRED" | "DOES_NOT_FIT";
    fitLabel: string;
    fitDetail: string;
  };

  /** Qué restricción va a frenar al usuario (ADR 018). */
  binding: {
    constraint: BindingConstraint;
    labelEs: string;
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
  modelContext: ModelContext = {},
): CalculatorResult {
  const workingDaysPerMonth =
    input.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS_PER_MONTH;
  const profile = getWorkProfile(input.profile);
  const mode = input.mode ?? "PASTE";
  const sessionTurns = input.sessionTurns ?? DEFAULT_SESSION_TURNS;

  const inputTokens = profile.inputTokens;
  const outputTokens = profile.outputTokens;
  const interactionsPerMonth = Math.round(
    input.messagesPerDay * workingDaysPerMonth,
  );

  // ── VÍA A: SUSCRIPCIÓN ──────────────────────────────────────
  const monthlyCost = plan.monthlyPrice;
  const annualMonthlyCost =
    plan.annualPrice != null ? plan.annualPrice / 12 : null;

  const quotaLevel: QuotaLevel = plan.quotaLevel ?? "UNKNOWN";
  const quotaKind: QuotaKind = plan.quotaKind ?? "UNDISCLOSED";
  const quotaResetPeriod: QuotaResetPeriod = plan.quotaResetPeriod ?? "UNKNOWN";

  let messagesPerMonthCapacity: number | null = null;

  // La capacidad solo es calculable si el proveedor publica un NÚMERO y
  // sabemos cada cuánto se reinicia. Sin el número, da igual saber el
  // periodo: un "5x Pro usage" no son 5 veces más mensajes, son 5 veces
  // más de un saldo que no conocemos.
  //
  // ADR 024: los proveedores miden la cuota de tres formas distintas
  // (tiers, multiplicadores y saldos compartidos) y solo una de ellas
  // (WINDOWED con número publicado) es convertible a mensajes.
  const quotaIsMeasurable =
    plan.estimatedMessageCap != null &&
    quotaLevelHasNumber(quotaLevel) &&
    quotaKind === "WINDOWED";

  if (quotaIsMeasurable && plan.estimatedMessageCap != null) {
    // Un plan con ventana en horas se reinicia cada `resetWindowHours`;
    // si no, se usa la periodicidad declarada.
    const resets =
      plan.resetWindowHours != null && plan.resetWindowHours > 0
        ? (workingDaysPerMonth * 24) / plan.resetWindowHours
        : resetsPerMonth(quotaResetPeriod);

    if (resets != null) {
      messagesPerMonthCapacity = Math.round(
        plan.estimatedMessageCap * resets,
      );
    }
  }

  const quotaLimited = messagesPerMonthCapacity != null;
  // Un plan con fallback tiene tope aunque el número no se publique.
  const hasRealLimit =
    quotaLevel !== "UNLIMITED" &&
    (quotaLimited || Boolean(plan.fallbackModelOnLimit));
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

  // ── RESTRICCIÓN DE CONTEXTO ──────────────────────────────────
  const perSession = tokensPerSession(profile, sessionTurns);
  const sessionsInWindow = sessionsPerConversation(
    modelContext.contextWindow,
    profile,
    sessionTurns,
  );
  const fit = assessFit(
    modelContext.contextWindow,
    profile,
    sessionTurns,
    mode,
  );

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
        `La suscripción es más barata (ahorra $${savingsPerMonth.toFixed(2)}/mes frente al pago por uso).`;
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

  // ── ¿QUÉ RESTRICCIÓN FRENA AL USUARIO? ──────────────────────
  const binding = resolveBindingConstraint({
    quotaLimited,
    overflowMessages,
    interactionsPerMonth,
    fitLevel: fit.level,
    sessionsInWindow,
    monthlyCost,
    usageCost,
  });

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
      profile: input.profile,
      mode,
      sessionTurns,
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
      hasRealLimit,
      quotaLevel,
      quotaKind,
      quotaResetPeriod,
      effectiveCostPerMessage,
      overflowMessages,
      includedTools: plan.includedTools ?? [],
    },
    usage: {
      monthlyCost: round2(usageCost),
      costPerMessage: round2(costPerMessage),
      tokensPerMonth,
    },
    context: {
      sessionsPerConversation: sessionsInWindow,
      tokensPerSession: perSession,
      fitLevel: fit.level,
      fitLabel: fit.labelEs,
      fitDetail: fit.detailEs,
    },
    binding,
    recommendation: { winner, savingsPerMonth, reason },
    messagesPerDollar,
  };
}

/**
 * Decide qué restricción va a frenar al usuario.
 *
 * Es la respuesta directa a «¿se me va a quedar corto?» y no existía antes
 * de ADR 018, porque cuota y ventana se trataban como la misma cosa.
 */
function resolveBindingConstraint(args: {
  quotaLimited: boolean;
  overflowMessages: number;
  interactionsPerMonth: number;
  fitLevel: "FITS" | "TIGHT" | "SPLIT_REQUIRED" | "DOES_NOT_FIT";
  sessionsInWindow: number | null;
  monthlyCost: number;
  usageCost: number;
}): CalculatorResult["binding"] {
  // Bloqueo duro: el material no cabe ni por partes.
  if (args.fitLevel === "DOES_NOT_FIT") {
    return {
      constraint: "context",
      labelEs:
        "Te va a frenar la ventana de contexto: el material no cabe ni repartido en varias conversaciones.",
    };
  }

  // La cuota se agota con el uso declarado → eso es lo que va a frenar.
  if (args.quotaLimited && args.overflowMessages > 0) {
    return {
      constraint: "quota",
      labelEs:
        "Te va a frenar la cuota de mensajes, no la ventana: vas a superar el tope del plan y los mensajes sobrantes degradan de modelo.",
    };
  }

  // La ventana obliga a repartir el trabajo → más sesiones → más cuota.
  if (args.fitLevel === "SPLIT_REQUIRED") {
    return {
      constraint: "context",
      labelEs:
        "Te va a frenar la ventana de contexto: el material no cabe de una sentada, así que necesitarás más sesiones (y por tanto más cuota).",
    };
  }

  return {
    constraint: "none",
    labelEs:
      "Ninguna de las dos restricciones te va a frenar con este volumen de uso.",
  };
}
