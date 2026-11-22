/**
 * Constantes del dominio — el "traductor de consumo" y perfiles de uso.
 *
 * Estos números son la base de toda la capa de equivalencias legibles.
 * Centralizarlos aquí permite auditarlos y cambiarlos de un solo sitio.
 */

import type { QuotaLevel, WorkProfile } from "@/lib/domain/types";

/** Equivalentes legibles por humanos (glosario del brief). */
export const HUMAN_EQUIVALENTS = {
  /** 1 página de texto estándar. */
  TOKENS_PER_PAGE: 500,
  /** 1 novela corta (200 páginas). */
  TOKENS_PER_SHORT_NOVEL: 100_000,
  /**
   * 1 línea de código ≈ 5 tokens. Estimación conservadora para TypeScript y
   * Python (los languages más verbosos rondan 8-12 tokens/línea).
   */
  TOKENS_PER_CODE_LINE: 5,
  /** 1 fichero de código de tamaño medio. */
  LINES_PER_CODE_FILE: 120,
  /** 1 sesión de chat promedio (input + output). */
  TOKENS_PER_CHAT_SESSION_INPUT: 1_500,
  TOKENS_PER_CHAT_SESSION_OUTPUT: 500,
} as const;

/**
 * Perfiles de trabajo — el ÚNICO eje de consumo.
 *
 * Antes había dos ejes multiplicativos (tamaño × caso de uso) que se
 * contradecían entre sí: "chat corto + programación" costaba más tokens de
 * entrada que "chat corto + general", y "chat corto + análisis de datos"
 * duplicaba la entrada mientras reducía la salida a la mitad. Nadie entendía
 * esas cifras.
 *
 * Ahora el contenido del caso de uso vive DENTRO del perfil: "programación"
 * está en "Revisión de código", "análisis de documentos" en "Documento". Se
 * conserva la información y se elimina la contradicción.
 *
 * La `reference` es lo que hace que las cifras signifiquen algo: un ejemplo
 * real que el usuario reconoce, sin necesidad de saber qué es un token.
 */
export const WORK_PROFILES: readonly WorkProfile[] = [
  {
    key: "quick-question",
    label: "Pregunta rápida",
    reference: "«¿Cómo centro un div?» — una duda de 3 líneas",
    inputTokens: 400,
    outputTokens: 300,
    description:
      "Preguntas y respuestas rápidas: un error de compilación, una duda de sintaxis, «explícame esto».",
  },
  {
    key: "code-review",
    label: "Revisión de código",
    reference: "un PR de ~500 líneas que revisar o corregir",
    inputTokens: 4_000,
    outputTokens: 1_500,
    description:
      "Escribir, revisar o depurar código: un fichero, una función, un pull request.",
  },
  {
    key: "repo-work",
    label: "Repo o documento",
    reference: "el proyecto entero — decenas de miles de líneas",
    inputTokens: 80_000,
    outputTokens: 8_000,
    description:
      "Trabajo sobre material grande: un repositorio completo, un PDF largo, un informe extenso.",
  },
] as const;

export type WorkProfileKey = (typeof WORK_PROFILES)[number]["key"];

export const WORK_PROFILE_KEYS = WORK_PROFILES.map((p) => p.key) as WorkProfileKey[];

export function getWorkProfile(key: WorkProfileKey): WorkProfile {
  return WORK_PROFILES.find((p) => p.key === key) ?? WORK_PROFILES[0];
}

/**
 * Nº de intercambios que tiene una sesión de trabajo.
 *
 * Es un parámetro del USUARIO, no del modelo: la ventana es fija, el tamaño
 * de la sesión depende de cómo trabaja cada uno. Por eso vive en la
 * calculadora y no en la ficha.
 */
export const DEFAULT_SESSION_TURNS = 20;

/** Rango del control de tamaño de sesión (Modo Técnico). */
export const SESSION_TURNS_RANGE = { min: 5, max: 60, step: 5 } as const;

/**
 * Etiquetas legibles de los niveles de cuota.
 * El proveedor dice "very high"; el usuario entiende "muchos".
 */
export const QUOTA_LEVEL_LABELS: Record<QuotaLevel, string> = {
  UNLIMITED: "Sin límite de mensajes",
  VERY_HIGH: "Límite muy alto",
  HIGH: "Límite alto",
  MEDIUM: "Límite medio",
  LIMITED: "Límite bajo",
  UNKNOWN: "Límite no publicado por el proveedor",
};

/**
 * Descripción larga del nivel, para el detalle de la ficha.
 */
export const QUOTA_LEVEL_DESCRIPTIONS: Record<QuotaLevel, string> = {
  UNLIMITED: "El proveedor no publica un tope de mensajes.",
  VERY_HIGH: "Cientos de mensajes por ventana. El proveedor no publica el número exacto.",
  HIGH: "Decenas de mensajes por cada ventana de unas horas.",
  MEDIUM: "Entre 40 y 80 mensajes por cada ventana de unas horas.",
  LIMITED: "Menos de 40 mensajes por cada ventana de unas horas.",
  UNKNOWN: "El proveedor no publica ni el nivel ni el número de mensajes.",
};

/**
 * ¿El nivel de cuota tiene un número publicable?
 * Solo entonces la capacidad mensual es calculable.
 */
export function quotaLevelHasNumber(level: QuotaLevel): boolean {
  return level === "LIMITED" || level === "MEDIUM" || level === "HIGH" || level === "VERY_HIGH";
}

/** Días laborables al mes por defecto (assumption configurable). */
export const DEFAULT_WORKING_DAYS_PER_MONTH = 22;

/** Rangos de la calculadora. */
export const CALCULATOR_RANGE = {
  messagesPerDay: { min: 5, max: 100, step: 5 },
  workingDaysPerMonth: { min: 15, max: 31, step: 1 },
} as const;
