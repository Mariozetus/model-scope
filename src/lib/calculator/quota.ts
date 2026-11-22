/**
 * Análisis de cuota: traduce las restricciones de un plan a la experiencia
 * real del usuario ("¿cuántos mensajes de calidad me quedan?").
 */

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
}

/**
 * Traduce la cuota del plan a una experiencia real.
 *
 * Ejemplo: "45 msgs cada 5h" con 30 msgs/día
 *   → 30/24 * 5 = 6.25 msgs por ventana ≪ 45 → nunca agota.
 */
export function analyzeQuota(
  plan: {
    estimatedMessageCap?: number | null;
    resetWindowHours?: number | null;
    fallbackModelOnLimit?: string | null;
  },
  messagesPerDay: number,
): QuotaBudget {
  const cap = plan.estimatedMessageCap;
  const window = plan.resetWindowHours;

  // Sin cuota declarada → ilimitado.
  if (cap == null || window == null) {
    return {
      effectiveMessages: Number.POSITIVE_INFINITY,
      quotaHeadroom: 1,
      hoursUntilReset: 0,
      degraded: false,
      labelEs: "Sin límite de mensajes",
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
  };
}
