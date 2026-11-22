/**
 * Traductor de capacidad: convierte tokens y precios en métricas cotidianas.
 *
 * Principio (ADR 017): los tokens NUNCA son la unidad de una capacidad.
 * Cuando aparecen, son la unidad de medida de un precio.
 *
 * La capacidad se expresa en el mundo del usuario:
 *  · código    → líneas de código, ficheros
 *  · lectura   → páginas, novelas cortas
 *  · trabajo   → sesiones (bloques de intercambios sobre un tema)
 */

import {
  HUMAN_EQUIVALENTS,
  WORK_PROFILES,
  type WorkProfileKey,
} from "@/lib/domain/constants";
import type { WorkProfile, WorkMode } from "@/lib/domain/types";

export interface CapacityTranslation {
  pages: number;
  novels: number;
  /** Líneas de código que caben en la ventana. */
  codeLines: number;
  /** Ficheros de código de tamaño medio que caben. */
  codeFiles: number;
  labelEs: string;
  /** Texto compacto para tablas densas. */
  shortLabel: string;
  /** Texto compacto centrado en código (para modelos de programación). */
  shortLabelCode: string;
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
      codeLines: 0,
      codeFiles: 0,
      labelEs: "Capacidad de contexto desconocida",
      shortLabel: "Contexto desconocido",
      shortLabelCode: "Contexto desconocido",
    };
  }

  const pages = Math.floor(contextTokens / HUMAN_EQUIVALENTS.TOKENS_PER_PAGE);
  const novels = contextTokens / HUMAN_EQUIVALENTS.TOKENS_PER_SHORT_NOVEL;
  const codeLines = Math.floor(
    contextTokens / HUMAN_EQUIVALENTS.TOKENS_PER_CODE_LINE,
  );
  const codeFiles = Math.floor(
    codeLines / HUMAN_EQUIVALENTS.LINES_PER_CODE_FILE,
  );

  const formattedPages = pages.toLocaleString("es-ES");
  const formattedLines = codeLines.toLocaleString("es-ES");

  const labelEs =
    novels >= 1
      ? `Capaz de leer ~${formattedPages} páginas de golpe (${novels.toFixed(1)} novelas cortas)`
      : `Capaz de leer ~${formattedPages} páginas de golpe`;

  return {
    pages,
    novels,
    codeLines,
    codeFiles,
    labelEs,
    shortLabel: `~${formattedPages} páginas`,
    shortLabelCode: `~${formattedLines} líneas`,
  };
}

// ─────────────────────────────────────────────────────────────
// CAPACIDAD COMO PRESUPUESTO (ADR 019)
// ─────────────────────────────────────────────────────────────

export interface ContextBudget {
  /** Presupuesto total de la conversación (entrada + salida). */
  totalTokens: number | null;
  /** Tokens que puedes enviar y aún dejar sitio para la respuesta. */
  usableInputTokens: number | null;
  /** Techo de la respuesta dentro del presupuesto. */
  maxOutputTokens: number | null;
  /** true si el material no cabe de una sentada. */
  doesNotFit: boolean;
}

/**
 * La ventana es un presupuesto ÚNICO: la entrada y la salida lo comparten.
 *
 * Enviar 900.000 tokens de una ventana de 1.050.000 deja 150.000 para la
 * respuesta, no 1.178.000. Este es el dato que decide si un parche largo se
 * va a cortar.
 */
export function buildContextBudget(
  contextWindow: number | null | undefined,
  maxOutputTokens: number | null | undefined,
): ContextBudget {
  if (!contextWindow || contextWindow <= 0) {
    return {
      totalTokens: null,
      usableInputTokens: null,
      maxOutputTokens: maxOutputTokens ?? null,
      doesNotFit: false,
    };
  }

  const output = maxOutputTokens ?? null;
  // El input no puede invadir el techo de salida: si el modelo puede responder
  // hasta N tokens, el input usable es el presupuesto menos ese techo.
  const usableInput = output != null ? Math.max(0, contextWindow - output) : contextWindow;

  return {
    totalTokens: contextWindow,
    usableInputTokens: usableInput,
    maxOutputTokens: output,
    doesNotFit: false,
  };
}

// ─────────────────────────────────────────────────────────────
// SESIONES (ADR 018)
// ─────────────────────────────────────────────────────────────

/**
 * Tokens que consume una sesión completa de un perfil dado.
 *
 * El contexto ACUMULA dentro de una sesión: el primer intercambio paga su
 * entrada, y los siguientes suman solo su delta más la respuesta. Por eso no
 * es `turns × (input + output)`, sino:
 *
 *   tokens_sesión = input + turnos × output
 *
 * (la entrada se paga una vez; lo que se reenvía va cacheado).
 */
export function tokensPerSession(
  profile: WorkProfile,
  sessionTurns: number,
): number {
  return profile.inputTokens + sessionTurns * profile.outputTokens;
}

/**
 * Nº de sesiones de este perfil que caben en la ventana del modelo.
 *
 * `null` si no hay ventana conocida.
 */
export function sessionsPerConversation(
  contextWindow: number | null | undefined,
  profile: WorkProfile,
  sessionTurns: number,
): number | null {
  if (!contextWindow || contextWindow <= 0) return null;
  const perSession = tokensPerSession(profile, sessionTurns);
  if (perSession <= 0) return null;
  return Math.floor(contextWindow / perSession);
}

/**
 * Veredicto de encaje entre el material y la ventana.
 *
 * Tres estados, no un binario (ADR 018): "no cabe de una sentada" es
 * informativo — el usuario puede repartir el trabajo en varias conversaciones
 * sin agotar la cuota — mientras que "no cabe ni una vez" sí es un bloqueo.
 */
export interface FitVerdict {
  level: "FITS" | "TIGHT" | "SPLIT_REQUIRED" | "DOES_NOT_FIT";
  labelEs: string;
  detailEs: string;
}

export function assessFit(
  contextWindow: number | null | undefined,
  profile: WorkProfile,
  sessionTurns: number,
  mode: WorkMode = "PASTE",
): FitVerdict {
  if (!contextWindow || contextWindow <= 0) {
    return {
      level: "FITS",
      labelEs: "Ventana de contexto desconocida",
      detailEs: "",
    };
  }

  // Con el repo conectado, el material entra por bloques: la ventana deja de
  // ser el límite y lo que limita es la cuota.
  if (mode === "CONNECTED") {
    return {
      level: "FITS",
      labelEs: "El material entra por bloques",
      detailEs:
        "Con el proyecto conectado no tienes que pegarlo entero: lo que limita es la cuota de mensajes, no la ventana.",
    };
  }

  const perSession = tokensPerSession(profile, sessionTurns);
  const materialFits = profile.inputTokens <= contextWindow;

  if (!materialFits) {
    // El material completo no cabe en una sesión. La diferencia entre
    // "repartirlo" y "no cabe ni por partes" es si existe un TROZO que sí
    // quepa: con un repo de 80k tokens y una ventana de 8k, ningún trozo
    // cabe → bloqueo real. Con una ventana de 32k, sí puedes partirlo.
    const usableInput = contextWindow - (profile.outputTokens ?? 0);
    const splittable = usableInput > 0;

    if (mode === "ALL_AT_ONCE" || !splittable) {
      return {
        level: "DOES_NOT_FIT",
        labelEs: "No cabe ni por partes",
        detailEs: `Una sesión de "${profile.label}" necesita ${perSession.toLocaleString("es-ES")} tokens y la ventana es de ${contextWindow.toLocaleString("es-ES")}. Necesitas un modelo con una ventana mayor.`,
      };
    }

    return {
      level: "SPLIT_REQUIRED",
      labelEs: "No cabe de una sentada",
      detailEs: `Repartirlo en varias conversaciones funciona, pero cada una gasta cuota: no es un bloqueo, es más sesiones.`,
    };
  }

  const sessions = Math.floor(contextWindow / perSession);
  if (sessions <= 1) {
    return {
      level: "TIGHT",
      labelEs: "Cabe justa",
      detailEs: `Solo ~${sessions} sesión${sessions === 1 ? "" : "es"} de "${profile.label}" por conversación.`,
    };
  }

  return {
    level: "FITS",
    labelEs: `Caben ~${sessions.toLocaleString("es-ES")} sesiones de "${profile.label}" por conversación`,
    detailEs: "",
  };
}

/**
 * Reparto del presupuesto de una conversación: cuánto envías y cuánto
 * puedes recibir. Es el detalle (b) del ADR 019.
 */
export interface BudgetSplit {
  inputLabel: string;
  outputLabel: string;
  doesNotFit: boolean;
}

export function splitBudget(
  budget: ContextBudget,
): BudgetSplit | null {
  if (budget.totalTokens == null || budget.usableInputTokens == null) return null;

  return {
    inputLabel: `~${budget.usableInputTokens.toLocaleString("es-ES")} tokens para enviar`,
    outputLabel:
      budget.maxOutputTokens != null
        ? `hasta ${budget.maxOutputTokens.toLocaleString("es-ES")} tokens de respuesta`
        : "respuesta sin tope publicado",
    doesNotFit: budget.doesNotFit,
  };
}

/**
 * Equivalentes de un perfil de trabajo expresados en material real.
 * Se usa en la ficha para dizer "cabe un proyecto entero".
 *
 * Los umbrales están calibrados contra las ventanas reales del catálogo
 * (32k, 64k, 128k, 200k, 1M) para que cada etiqueta caiga en una banda
 * real y no en un limbo arbitrario.
 */
export function describeMaterialCapacity(
  contextWindow: number | null | undefined,
): { label: string; detail: string } | null {
  if (!contextWindow || contextWindow <= 0) return null;

  const biggest = WORK_PROFILES[WORK_PROFILES.length - 1];
  const middle = WORK_PROFILES[1];

  // Umbrales por material de ENTRADA, no por sesión completa: lo que el
  // usuario pega es lo que tiene que caber.
  //
  // · 80.000+ → proyecto entero
  // ·  4.000+ → un repositorio (varios ficheros relacionados)
  // ·  1.000+ → un fichero grande
  // ·  menos  → ventana corta
  if (contextWindow >= biggest.inputTokens) {
    return {
      label: "Cabe un proyecto entero",
      detail: `Aguanta material de hasta ~${(biggest.inputTokens / 1000).toLocaleString("es-ES")}k tokens de entrada (${biggest.reference}).`,
    };
  }

  if (contextWindow >= middle.inputTokens) {
    return {
      label: "Cabe un repositorio",
      detail: `Aguanta material de hasta ~${(middle.inputTokens / 1000).toLocaleString("es-ES")}k tokens de entrada, como ${middle.reference}.`,
    };
  }

  if (contextWindow >= 1_000) {
    return {
      label: "Cabe un fichero grande",
      detail: `Aguanta material de hasta ~${(contextWindow / 1000).toLocaleString("es-ES")}k tokens de entrada. Para repos enteros, necesitas un modelo con ventana mayor.`,
    };
  }

  return {
    label: "Ventana corta",
    detail: `Solo cabe material pequeño (~${(contextWindow / 1000).toLocaleString("es-ES")}k tokens). Para código extenso, busca una ventana mayor.`,
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

/** Perfil de trabajo por clave, con fallback al primero. */
export function resolveProfile(key: WorkProfileKey): WorkProfile {
  return WORK_PROFILES.find((p) => p.key === key) ?? WORK_PROFILES[0];
}
