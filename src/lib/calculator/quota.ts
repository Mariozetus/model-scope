/**
 * Análisis de cuota: traduce las restricciones de un plan a la experiencia
 * real del usuario ("¿cuántos mensajes de calidad me quedan?").
 *
 * ADR 020: la cuota tiene un NIVEL explícito. El binario "limitado /
 * ilimitado" mentía — no hay ningún plan de $100/mes que sea realmente
 * ilimitado, y si hay fallback, hay un límite por definición.
 *
 * ADR 024: el nivel no basta. Cada proveedor mide su cuota de una forma
 * distinta (tiers de acceso, multiplicadores, saldos compartidos) y con
 * periodicidades distintas (horaria, diaria, semanal). Un plan con "Límite
 * alto" medido por tiers de herramientas no es comparable con otro medido
 * por un pool semanal, aunque compartan etiqueta.
 */

import {
  QUOTA_KIND_LABELS,
  QUOTA_LEVEL_DESCRIPTIONS,
  QUOTA_LEVEL_LABELS,
  QUOTA_RESET_LABELS,
  quotaLevelHasNumber,
  resetsPerMonth,
} from "@/lib/domain/constants";
import type {
  QuotaKind,
  QuotaLevel,
  QuotaResetPeriod,
} from "@/lib/domain/types";

export interface QuotaBudget {
  /** Mensajes "de calidad" garantizados antes de degradar. */
  effectiveMessages: number;
  /** Porcentaje de uso de la cuota actual (0..1). */
  quotaHeadroom: number;
  /** Horas hasta el siguiente reset, asumiendo uso uniforme. */
  hoursUntilReset: number;
  /** true si la cuota se agota con este ritmo de uso. */
  degraded: boolean;
  /** Texto listo para mostrar. */
  labelEs: string;
  /** Nivel de cuota del plan. */
  level: QuotaLevel;
  /** true si el nivel tiene número publicable y por tanto es calculable. */
  isCalculable: boolean;
  /** Etiqueta corta del nivel, sin el número. */
  levelLabel: string;
  /** Descripción larga del nivel. */
  levelDescription: string;
  /** Cómo mide el proveedor la cuota. */
  kind: QuotaKind;
  /** Etiqueta de la periodicidad del reset. */
  resetLabel: string;
  /** Periodicidad declarada. */
  resetPeriod: QuotaResetPeriod;
}

/** Entrada del análisis de cuota: un plan y su nivel declarado. */
export interface QuotaPlan {
  quotaLevel?: QuotaLevel;
  quotaKind?: QuotaKind;
  quotaResetPeriod?: QuotaResetPeriod;
  estimatedMessageCap?: number | null;
  resetWindowHours?: number | null;
  fallbackModelOnLimit?: string | null;
}

/**
 * Traduce la cuota del plan a una experiencia real.
 *
 * Ejemplo: "45 msgs cada 5h" con 30 msgs/día
 *   → 30/24 * 5 = 6.25 msgs por ventana ≪ 45 → nunca agota.
 *
 * Cuando el nivel no es numérico (VERY_HIGH, UNLIMITED, UNKNOWN) NO hay
 * capacidad calculable: se dice explícitamente en vez de devolver un
 * infinito que haría creer que el plan nunca se agota.
 *
 * ADR 024: un plan `MULTIPLIER` ("5x Pro usage") o `TIERED` ("Expanded
 * messages") no es convertible a mensajes aunque declare un nivel alto.
 * Solo un `WINDOWED` con número publicado lo es.
 */
export function analyzeQuota(
  plan: QuotaPlan,
  messagesPerDay: number,
): QuotaBudget {
  const level: QuotaLevel = plan.quotaLevel ?? "UNKNOWN";
  const kind: QuotaKind = plan.quotaKind ?? "UNDISCLOSED";
  const resetPeriod: QuotaResetPeriod = plan.quotaResetPeriod ?? "UNKNOWN";
  const cap = plan.estimatedMessageCap;
  const window = plan.resetWindowHours;

  const base = {
    level,
    levelLabel: QUOTA_LEVEL_LABELS[level],
    levelDescription: QUOTA_LEVEL_DESCRIPTIONS[level],
    kind,
    resetLabel: QUOTA_RESET_LABELS[resetPeriod],
    resetPeriod,
  };

  const isMeasurable =
    cap != null &&
    quotaLevelHasNumber(level) &&
    kind === "WINDOWED" &&
    (window != null || resetsPerMonth(resetPeriod) != null);

  // Sin número publicable (o sin una forma de medirla) → no es calculable.
  // Se dice, no se inventa.
  if (!isMeasurable) {
    return {
      effectiveMessages: Number.POSITIVE_INFINITY,
      quotaHeadroom: 1,
      hoursUntilReset: 0,
      degraded: false,
      labelEs: base.levelLabel,
      isCalculable: false,
      ...base,
    };
  }

  const messagesPerWindow = (messagesPerDay / 24) * (window ?? 24);
  const quotaHeadroom = cap > 0 ? Math.min(1, messagesPerWindow / cap) : 0;
  const degraded = quotaHeadroom >= 1;
  const hoursUntilReset = degraded ? 0 : (window ?? 24) * (1 - quotaHeadroom);

  const labelEs = degraded
    ? `Agotas la cuota (${cap} msgs / ${window}h) — degradación a ${plan.fallbackModelOnLimit ?? "modelo reducido"}`
    : `Usas el ${Math.round(quotaHeadroom * 100)}% de la cuota (${cap} msgs / ${window}h)`;

  return {
    effectiveMessages: cap,
    quotaHeadroom,
    hoursUntilReset,
    degraded,
    labelEs,
    isCalculable: true,
    ...base,
  };
}

/**
 * ¿El plan tiene un tope real? Un plan con fallback SIENE tope, aunque el
 * proveedor no publique el número.
 */
export function hasRealLimit(plan: QuotaPlan): boolean {
  if (plan.quotaLevel === "UNLIMITED") return false;
  if (plan.fallbackModelOnLimit) return true;
  return quotaLevelHasNumber(plan.quotaLevel ?? "UNKNOWN");
}

/**
 * Etiqueta corta de cómo mide el proveedor la cuota.
 * Se usa en la ficha, junto al nivel, para que el usuario sepa si está
 * comparando magnitudes equivalentes.
 */
export function quotaKindLabel(kind: QuotaKind): string {
  return QUOTA_KIND_LABELS[kind];
}
