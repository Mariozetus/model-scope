/**
 * Traductor de capacidad: convierte tokens y precios en métricas cotidianas.
 */

import { HUMAN_EQUIVALENTS } from "./constants";

export interface CapacityTranslation {
  pages: number;
  novels: number;
  labelEs: string;
  /** Texto compacto para tablas densas. */
  shortLabel: string;
}

/**
 * "Capaz de leer ~400 páginas de golpe"
 * 200k tokens / 500 tokens por página = 400 páginas
 */
export function translateContextWindow(
  contextTokens: number | null | undefined,
): CapacityTranslation {
  if (!contextTokens || contextTokens <= 0) {
    return {
      pages: 0,
      novels: 0,
      labelEs: "Capacidad de contexto desconocida",
      shortLabel: "Contexto desconocido",
    };
  }

  const pages = Math.floor(contextTokens / HUMAN_EQUIVALENTS.TOKENS_PER_PAGE);
  const novels = contextTokens / HUMAN_EQUIVALENTS.TOKENS_PER_SHORT_NOVEL;

  const formattedPages = pages.toLocaleString("es-ES");
  const labelEs =
    novels >= 1
      ? `Capaz de leer ~${formattedPages} páginas de golpe (${novels.toFixed(1)} novelas cortas)`
      : `Capaz de leer ~${formattedPages} páginas de golpe`;

  return {
    pages,
    novels,
    labelEs,
    shortLabel: `~${formattedPages} páginas`,
  };
}

/** Tokens de una sesión de chat promedio (input + output). */
export const AVG_SESSION_TOKENS =
  HUMAN_EQUIVALENTS.TOKENS_PER_CHAT_SESSION_INPUT +
  HUMAN_EQUIVALENTS.TOKENS_PER_CHAT_SESSION_OUTPUT;

/**
 * "Mensajes reales" que caben en una ventana de contexto.
 * 200k tokens / 2k tokens por sesión ≈ 100 sesiones de chat.
 */
export function messagesPerContextWindow(
  contextTokens: number | null | undefined,
  avgSessionTokens: number = AVG_SESSION_TOKENS,
): number | null {
  if (!contextTokens || contextTokens <= 0) return null;
  return Math.floor(contextTokens / avgSessionTokens);
}

/**
 * Convierte tokens de un mes en un equivalente legible.
 * "Tu uso equivale a leer X páginas al mes".
 */
export function tokensToPages(tokens: number): number {
  return Math.floor(tokens / HUMAN_EQUIVALENTS.TOKENS_PER_PAGE);
}

/**
 * Convierte tokens de output en tiempo aproximado de lectura en voz alta
 * (~150 palabras/min ≈ 200 tokens/min).
 */
export function outputTokensToReadMinutes(outputTokens: number): number {
  return Math.round(outputTokens / 200);
}
