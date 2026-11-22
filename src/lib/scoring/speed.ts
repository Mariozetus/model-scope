/**
 * Clasificación de velocidad en etiquetas cualitativas (Modo Práctico).
 */

export type SpeedLabel = "instantaneo" | "rapido" | "medio" | "reflexivo";

export interface SpeedClassification {
  label: SpeedLabel;
  labelEs: string;
  /** Descripción corta para tooltips. */
  detail: string;
  tps: number | null;
  ttft: number | null;
}

const SPEED_META: Record<SpeedLabel, { labelEs: string; detail: string }> = {
  instantaneo: {
    labelEs: "Instantáneo",
    detail: "Responde antes de que termines de leer la pregunta",
  },
  rapido: {
    labelEs: "Rápido",
    detail: "Fluididad de chat comfortably",
  },
  medio: {
    labelEs: "Velocidad media",
    detail: "Se nota la espera, pero es aceptable",
  },
  reflexivo: {
    labelEs: "Reflexivo / Thinking",
    detail: "Dedica tiempo a razonar antes de responder — mejor en tareas complejas",
  },
};

/**
 * Clasificación compuesta.
 *
 * Un modelo puede ser rápido en tokens/segundo pero tener un TTFT alto
 * (p. ej. modelos "thinking" con prefill largo). El usuario percibe PRIMERO
 * la latencia hasta el primer token, así que si hay TTFT disponible y es
 * alto, dominamos la clasificación con él.
 */
export function classifySpeed(
  tps: number | null,
  ttft: number | null,
): SpeedClassification {
  if (tps == null && ttft == null) {
    return {
      label: "medio",
      labelEs: "Velocidad desconocida",
      detail: "Sin datos de rendimiento medidos",
      tps,
      ttft,
    };
  }

  // Modelos de razonamiento: el prefill largo domina la experiencia.
  if (ttft != null && ttft >= 3) {
    return { label: "reflexivo", ...SPEED_META.reflexivo, tps, ttft };
  }

  const effective = tps ?? 0;
  if (effective >= 120) {
    return { label: "instantaneo", ...SPEED_META.instantaneo, tps, ttft };
  }
  if (effective >= 60) {
    return { label: "rapido", ...SPEED_META.rapido, tps, ttft };
  }
  return { label: "medio", ...SPEED_META.medio, tps, ttft };
}
