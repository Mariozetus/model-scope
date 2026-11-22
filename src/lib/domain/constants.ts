/**
 * Constantes del dominio — el "traductor de consumo" y perfiles de uso.
 *
 * Estos números son la base de toda la capa de equivalencias legibles.
 * Centralizarlos aquí permite auditarlos y cambiarlos de un solo sitio.
 */

/** Equivalentes legibles por humanos (glosario del brief). */
export const HUMAN_EQUIVALENTS = {
  /** 1 página de texto estándar. */
  TOKENS_PER_PAGE: 500,
  /** 1 novela corta (200 páginas). */
  TOKENS_PER_SHORT_NOVEL: 100_000,
  /** 1 sesión de chat promedio (input + output). */
  TOKENS_PER_CHAT_SESSION_INPUT: 1_500,
  TOKENS_PER_CHAT_SESSION_OUTPUT: 500,
} as const;

/** Tokens típicos por tipo de intensidad de uso. */
export const INTENSITY_PROFILES = {
  short: {
    label: "Chats cortos",
    description: "Preguntas y respuestas rápidas",
    inputTokens: 800,
    outputTokens: 400,
    pagesEquivalent: 2,
  },
  medium: {
    label: "Textos medios",
    description: "Ensayos, emails largos, explicaciones",
    inputTokens: 4_000,
    outputTokens: 1_500,
    pagesEquivalent: 10,
  },
  long: {
    label: "Documentos / Código largo",
    description: "PDFs, repos completos, informes extensos",
    inputTokens: 30_000,
    outputTokens: 4_000,
    pagesEquivalent: 75,
  },
} as const;

export type IntensityKey = keyof typeof INTENSITY_PROFILES;
export const INTENSITY_KEYS = Object.keys(INTENSITY_PROFILES) as IntensityKey[];

export type UseCaseKey = "general" | "coding" | "data-analysis";

export const USE_CASE_LABELS: Record<UseCaseKey, string> = {
  general: "General",
  coding: "Programación",
  "data-analysis": "Análisis de datos",
};

/** Días laborables por mes por defecto (assumption configurable). */
export const DEFAULT_WORKING_DAYS_PER_MONTH = 22;

/** Rangos de la calculadora. */
export const CALCULATOR_RANGE = {
  messagesPerDay: { min: 5, max: 100, step: 5 },
  workingDaysPerMonth: { min: 15, max: 31, step: 1 },
} as const;

/** Mapeo de intensity → clave de tipo de uso en la calculadora. */
export const INTENSITY_TO_USE_CASE = {
  short: "general",
  medium: "general",
  long: "data-analysis",
} as const;
