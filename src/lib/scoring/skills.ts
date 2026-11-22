/**
 * Composición de habilidades: qué benchmarks forman cada dimensión y con
 * qué peso, y agregación al perfil de puntuaciones 0..10.
 */

import type { SkillDimension, SkillProfile } from "@/lib/domain/types";
import { SKILL_DIMENSIONS } from "@/lib/domain/types";
import { clamp, round1 } from "./normalize";

/**
 * Mapa: dimensión -> benchmarks que la componen (con sus pesos).
 * Curado en config, versionado en Git. Suma 1.0 por dimensión.
 */
export const SKILL_COMPOSITION: Record<
  SkillDimension,
  Array<{ benchmarkSlug: string; weight: number }>
> = {
  code: [
    { benchmarkSlug: "swe-bench-verified", weight: 0.6 },
    { benchmarkSlug: "livecodebench", weight: 0.4 },
  ],
  reasoning: [
    { benchmarkSlug: "gpqa-diamond", weight: 0.6 },
    { benchmarkSlug: "arc-agi", weight: 0.4 },
  ],
  writing: [
    { benchmarkSlug: "arena-elo", weight: 0.7 },
    { benchmarkSlug: "arena-writing", weight: 0.3 },
  ],
  languages: [
    { benchmarkSlug: "multilingual-mgsm", weight: 0.5 },
    { benchmarkSlug: "arena-multilingual", weight: 0.5 },
  ],
  "data-analysis": [
    { benchmarkSlug: "finance-reasoning", weight: 0.5 },
    { benchmarkSlug: "table-reasoning", weight: 0.5 },
  ],
  "long-context": [
    { benchmarkSlug: "ruler-128k", weight: 0.5 },
    { benchmarkSlug: "longbench-v2", weight: 0.5 },
  ],
};

/**
 * Agrega un perfil de habilidades a partir de scores ya normalizados.
 * Cada dimensión es la media ponderada de sus benchmarks componentes.
 */
export function aggregateSkillProfile(
  normalizedByBenchmark: Map<string, number>,
): SkillProfile {
  const profile = {} as SkillProfile;

  for (const dim of SKILL_DIMENSIONS) {
    const composition = SKILL_COMPOSITION[dim];
    let weightedSum = 0;
    let totalWeight = 0;

    for (const component of composition) {
      const score = normalizedByBenchmark.get(component.benchmarkSlug);
      if (score == null || !Number.isFinite(score)) continue;
      weightedSum += score * component.weight;
      totalWeight += component.weight;
    }

    // Sin datos → 5.0 (neutro), no 0.0 (que se leería como "peor que nadie").
    profile[dim] = totalWeight === 0 ? 5.0 : round1(weightedSum / totalWeight);
  }

  return profile;
}

/** Pesos de cada dimensión en el índice agregado global. Suman 1.0. */
export const DIMENSION_WEIGHTS: Record<SkillDimension, number> = {
  code: 0.24,
  reasoning: 0.24,
  writing: 0.18,
  languages: 0.14,
  "data-analysis": 0.12,
  "long-context": 0.08,
};

/** Índice agregado 0..100 (equivalente al Artificial Analysis Quality Index). */
export function aggregateQualityIndex(profile: SkillProfile): number {
  const weighted = SKILL_DIMENSIONS.reduce(
    (sum, dim) => sum + profile[dim] * DIMENSION_WEIGHTS[dim],
    0,
  );
  return Math.round(clamp(weighted, 0, 10) * 10);
}

/** Puntuación global 0..10 para ordenar el catálogo. */
export function overallScore(profile: SkillProfile): number {
  return round1(aggregateQualityIndex(profile) / 10);
}
