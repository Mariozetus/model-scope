/**
 * Normalización por cohorte: convierte scores crudos en puntuaciones 0..10
 * usando la posición relativa del modelo dentro de la cohorte vigente.
 */

import { BENCHMARK_CEILINGS, cohortConfidence, PERCENTILE_TO_SCORE } from "./anchors";
import { clamp, round1 } from "./normalize";

export interface CohortMember {
  modelId: string;
  rawScore: number;
}

export interface CohortScoreResult {
  scores: Map<string, number>;
  /** Percentil 0..1 por modelo, para mostrar en Modo Técnico. */
  percentiles: Map<string, number>;
  /** Tamaño efectivo de la cohorte. */
  cohortSize: number;
  /** Factor de confianza aplicado. */
  confidence: number;
}

/**
 * Interpola la curva percentil → puntuación.
 * La curva es monótona y está definida en PERCENTILE_TO_SCORE.
 */
export function percentileToScore(percentile: number): number {
  const p = clamp(percentile, 0, 1);
  const points = PERCENTILE_TO_SCORE;

  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (p >= lo.percentile && p <= hi.percentile) {
      const span = hi.percentile - lo.percentile;
      const t = span === 0 ? 0 : (p - lo.percentile) / span;
      return lo.score + t * (hi.score - lo.score);
    }
  }
  return points[points.length - 1].score;
}

/**
 * Normaliza una cohorte completa de resultados de un benchmark a 0..10.
 *
 * Pasos:
 *  1. Percentil (mid-rank para empates) dentro de la cohorte.
 *  2. Mapeo percentil → score con la curva fija.
 *  3. Techo de capacidad curado para el benchmark (evita outliers con 10).
 *  4. Contracción por confianza según el tamaño de la cohorte.
 */
export function scoreByCohort(
  cohort: CohortMember[],
  benchmarkSlug: string,
): CohortScoreResult {
  const valid = cohort.filter(
    (m) => Number.isFinite(m.rawScore),
  );
  const n = valid.length;

  const scores = new Map<string, number>();
  const percentiles = new Map<string, number>();

  if (n === 0) {
    return { scores, percentiles, cohortSize: 0, confidence: 0 };
  }

  if (n === 1) {
    // Un solo dato no dice nada sobre posición relativa:Neutralizamos.
    scores.set(valid[0].modelId, 5.0);
    percentiles.set(valid[0].modelId, 0.5);
    return { scores, percentiles, cohortSize: 1, confidence: cohortConfidence(1) };
  }

  const sorted = [...valid].sort((a, b) => a.rawScore - b.rawScore);
  const ceiling = BENCHMARK_CEILINGS[benchmarkSlug] ?? 10;
  const confidence = cohortConfidence(n);

  // Asignación de percentiles con mid-rank para empates:
  // si dos modelos empatan, ambos reciben el percentil medio del rango.
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].rawScore === sorted[i].rawScore) {
      j++;
    }
    const midRank = (i + j) / 2;
    const percentile = midRank / (n - 1);

    for (let k = i; k <= j; k++) {
      const member = sorted[k];
      percentiles.set(member.modelId, percentile);

      const curveScore = percentileToScore(percentile);
      const capped = Math.min(curveScore, ceiling);
      const shrunk = 5.0 + (capped - 5.0) * confidence;
      scores.set(member.modelId, round1(clamp(shrunk, 1, 10)));
    }
    i = j + 1;
  }

  return { scores, percentiles, cohortSize: n, confidence };
}
