/**
 * Análisis de cuota: traduce las restricciones de un plan a la experiencia
 * real del usuario ("¿cuántos mensajes de calidad me quedan?").
 *
 * ADR 020: la cuota tiene un NIVEL explícito. El binario "limitado /
 * ilimitado" mentía — no hay ningún plan de $100/mes que sea realmente
 * ilimitado, y si hay fallback, hay un límite por definición.
 */

import {
  QUOTA_LEVEL_DESCRIPTIONS,
  QUOTA_LEVEL_LABELS,
  quotaLevelHasNumber,
} from "@/lib/domain/constants";
import type { QuotaLevel } from "@/lib/domain/types";

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
}

/** Entrada del análisis de cuota: un plan y su nivel declarado. */
export interface QuotaPlan {
  quotaLevel?: QuotaLevel;
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
 */
export function analyzeQuota(
  plan: QuotaPlan,
  messagesPerDay: number,
): QuotaBudget {
  const level: QuotaLevel = plan.quotaLevel ?? "UNKNOWN";
  const cap = plan.estimatedMessageCap;
  const window = plan.resetWindowHours;

  const base = {
    level,
    levelLabel: QUOTA_LEVEL_LABELS[level],
    levelDescription: QUOTA_LEVEL_DESCRIPTIONS[level],
  };

  // Sin número publicable → no es calculable. Se dice, no se inventa.
  if (
    cap == null ||
    window == null ||
    !quotaLevelHasNumber(level)
  ) {
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

  const messagesPerWindow = (messagesPerDay / 24) * window;
  const quotaHeadroom = cap > 0 ? Math.min(1, messagesPerWindow / cap) : 0;
  const degraded = quotaHeadroom >= 1;
  const hoursUntilReset = degraded ? 0 : window * (1 - quotaHeadroom);

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
