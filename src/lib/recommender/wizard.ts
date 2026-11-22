/**
 * Asistente Recomendador — Módulo D del MVP.
 *
 * Wizard de 3 pasos: necesidad → presupuesto → privacidad.
 * Devuelve el Top 3 de combinaciones Modelo + Proveedor.
 */

import type { SkillProfile, UseCase } from "@/lib/domain/types";
import { clamp, round1 } from "@/lib/scoring/normalize";

export type BudgetTier = "free" | "under10" | "twenty" | "unlimited";

export type WizardNeed =
  | "programar"
  | "escribir"
  | "analizar-pdfs"
  | "razonar"
  | "barato"
  | "local";

export interface WizardAnswers {
  need: WizardNeed;
  budget: BudgetTier;
  privacy: "no-importa" | "me-importa";
}

export interface RecommendationCandidate {
  modelId: string;
  modelName: string;
  laboratoryName: string;
  channelKind: "subscription" | "api" | "local";
  channelKindLabel: string;
  channelName: string;
  /** Coste mensual estimado de esta vía concreta. */
  monthlyCost: number;
  /** true si el proveedor no entrena con los datos del usuario por defecto. */
  privacySafe: boolean;
  modelSlug: string;
  /** Velocidad y contexto para mostrar en la tarjeta. */
  speedLabel?: string;
  contextLabel?: string;
  /** Para la vía local: requisitos de hardware. */
  localVramGb?: number | null;
  /** Para la vía local: licencia del modelo. */
  license?: string;
}

export interface RecommendationResult extends RecommendationCandidate {
  score: number;
  why: string;
}

/**
 * Puntuación multicriterio.
 *
 * Se usa MULTIPLICACIÓN para el presupuesto y la privacidad (no suma): así un
 * filtro duro (precio fuera de rango) reduce drásticamente el candidato en
 * lugar de competir con la calidad en una suma ponderada. Si un modelo es
 *--(cero) en un factor, desaparece.
 */
export function scoreCandidate(
  candidate: RecommendationCandidate,
  answers: WizardAnswers,
  profiles: Map<string, SkillProfile>,
): RecommendationResult {
  const profile = profiles.get(candidate.modelId);
  const quality = profile ? qualityForNeed(profile, answers.need) : 5;

  // 1) Ajuste a la necesidad (0..10) — el factor dominante.
  let score = quality * 3.0;

  // 2) Presupuesto (multiplicativo).
  score *= budgetMultiplier(candidate.monthlyCost, answers.budget);

  // 3) Privacidad (multiplicativo solo si al usuario le importa).
  score *= privacyMultiplier(candidate.privacySafe, answers.privacy);

  // 4) Bonus por canal de suscripción: incluye herramientas extra
  //    (web search, artifacts) que la API por uso no trae de serie.
  if (candidate.channelKind === "subscription") {
    score *= 1.05;
  }

  // 5) La vía local no tiene coste marginal: si el usuario quiere usar en
  //    local y el hardware es razonable, se bonifica ligeramente.
  if (candidate.channelKind === "local") {
    score *= 1.1;
  }

  return {
    ...candidate,
    score: round1(clamp(score, 0, 100)),
    why: buildWhy(candidate, answers, quality),
  };
}

/** Calidad relevante para la necesidad declarada, 0..10. */
export function qualityForNeed(
  profile: SkillProfile,
  need: WizardNeed,
): number {
  switch (need) {
    case "programar":
      return profile.code;
    case "escribir":
      return profile.writing;
    case "analizar-pdfs":
      return Math.max(profile["long-context"], profile["data-analysis"]);
    case "razonar":
      return profile.reasoning;
    case "barato":
      return (profile.code + profile.reasoning + profile.writing) / 3;
    case "local":
      return (profile.code + profile.reasoning + profile.writing) / 3;
  }
}

/**
 * Factor de presupuesto. Muy por encima del presupuesto → score casi nulo.
 */
export function budgetMultiplier(
  monthlyCost: number,
  budget: BudgetTier,
): number {
  switch (budget) {
    case "free":
      return monthlyCost === 0 ? 1 : 0.15;
    case "under10":
      return monthlyCost <= 10 ? 1 : monthlyCost <= 20 ? 0.6 : 0.25;
    case "twenty":
      return monthlyCost <= 20 ? 1 : monthlyCost <= 50 ? 0.7 : 0.3;
    case "unlimited":
      return 1;
  }
}

export function privacyMultiplier(
  privacySafe: boolean,
  privacy: WizardAnswers["privacy"],
): number {
  if (privacy === "no-importa") return 1;
  return privacySafe ? 1.15 : 0.55;
}

/** Mapea la necesidad del wizard a los tags de useCase del modelo. */
export const NEED_TO_USE_CASE: Record<WizardNeed, UseCase[]> = {
  programar: ["code"],
  escribir: ["writing"],
  "analizar-pdfs": ["pdf-analysis", "data-analysis"],
  razonar: ["reasoning"],
  barato: ["cheap", "code", "writing"],
  local: ["local", "code"],
};

function buildWhy(
  c: RecommendationCandidate,
  answers: WizardAnswers,
  quality: number,
): string {
  const parts: string[] = [];
  parts.push(`${quality.toFixed(1)}/10 para tu necesidad`);

  if (answers.privacy === "me-importa") {
    parts.push(
      c.privacySafe
        ? "no entrena con tus chats"
        : "ojo: el proveedor entrena con tus chats",
    );
  }

  if (c.channelKind === "local") {
    parts.push(
      `ejecución local${c.localVramGb ? ` (~${c.localVramGb} GB de VRAM)` : ""}`,
    );
    if (c.license) parts.push(`licencia ${c.license}`);
    return parts.join(" · ");
  }

  parts.push(
    c.monthlyCost === 0
      ? `gratis vía ${c.channelName}`
      : `$${c.monthlyCost.toFixed(c.monthlyCost % 1 === 0 ? 0 : 2)}/mes vía ${c.channelName}`,
  );

  return parts.join(" · ");
}

/**
 * Filtra candidatos por necesidad y presupuesto antes de puntuar.
 * Devuelve el Top N.
 */
export function recommend(
  candidates: RecommendationCandidate[],
  answers: WizardAnswers,
  profiles: Map<string, SkillProfile>,
  topN = 3,
): RecommendationResult[] {
  return candidates
    .map((c) => scoreCandidate(c, answers, profiles))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
