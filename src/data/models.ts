/**
 * Capa de acceso a datos del MVP.
 *
 * Trabaja sobre el seed en memoria. Cuando se active Prisma/Postgres, este
 * módulo se sustituye por las queries reales — la interfaz pública no cambia.
 */

import { BENCHMARKS } from "@/lib/domain/benchmarks";
import type {
  AccessChannel,
  ApiPricing,
  Laboratory,
  LocalRequirements,
  Model,
  ModelBenchmarkResult,
  Provider,
  SkillProfile,
} from "@/lib/domain/types";
import { LABORATORIES as _L, MODELS, PROVIDERS as _P } from "@/data/seed";
import { scoreByCohort } from "@/lib/scoring/cohort";
import { aggregateSkillProfile, overallScore } from "@/lib/scoring/skills";
import { classifySpeed, type SpeedClassification } from "@/lib/scoring/speed";
import {
  buildContextBudget,
  describeMaterialCapacity,
  translateContextWindow,
} from "@/lib/domain/equivalents";

export { MODELS } from "@/data/seed";
export const LABORATORIES = _L;
export const PROVIDERS = _P;

// ─────────────────────────────────────────────────────────────
// TIPOS DE VISTA
// ─────────────────────────────────────────────────────────────

/** Un modelo con todo lo calculado que necesita la UI. */
export interface EnrichedModel extends Model {
  /** Puntuaciones 0..10 por habilidad. */
  skills: SkillProfile;
  /** Índice agregado 0..100. */
  qualityIndex: number;
  /** Puntuación global 0..10 (para ordenar). */
  overall: number;
  /** Percentil por benchmark (0..1), para el Modo Técnico. */
  percentiles: Record<string, number>;
  /** Tamaño de la cohorte por benchmark, para el Modo Técnico. */
  cohortSizes: Record<string, number>;
  /** Velocidad clasificada. */
  speed: SpeedClassification;
  /** Equivalentes legibles de la ventana de contexto. */
  capacity: ReturnType<typeof translateContextWindow>;
  /** Presupuesto de la conversación (entrada + salida comparten tope). */
  budget: ReturnType<typeof buildContextBudget>;
  /** Qué cabe de material en la ventana, en lenguaje llano. */
  materialCapacity: ReturnType<typeof describeMaterialCapacity>;
  /** Canales de acceso particionados por tipo. */
  subscriptions: AccessChannel[];
  apiChannels: AccessChannel[];
  /** Opciones de ejecución local / self-hosted. */
  localChannels: AccessChannel[];
  /** true si el modelo se puede autoalojar (pesos abiertos). */
  canSelfHost: boolean;
  /** true si la licencia es OSI (uso comercial sin condiciones). */
  hasOsiLicense: boolean;
}

// ─────────────────────────────────────────────────────────────
// COHORTES
// ─────────────────────────────────────────────────────────────

/**
 * Construye la cohorte de cada benchmark: TODOS los modelos con dato,
 * conservando la referencia al modelo real.
 *
 * Esto es lo que hace que el sistema no necesite un "10 absoluto": la
 * cohorte es el objeto medido, y la escala 1..10 es el instrumento fijo.
 */
function buildCohorts(models: Model[]): Map<
  string,
  Array<{ modelId: string; rawScore: number }>
> {
  const cohorts = new Map<string, Array<{ modelId: string; rawScore: number }>>();

  for (const model of models) {
    for (const result of model.benchmarks) {
      const existing = cohorts.get(result.benchmarkSlug) ?? [];
      existing.push({ modelId: model.id, rawScore: result.score });
      cohorts.set(result.benchmarkSlug, existing);
    }
  }

  return cohorts;
}

/**
 * Normaliza todos los benchmarks de todos los modelos por cohorte.
 * Devuelve: modelId → { benchmarkSlug → score 0..10 } y percentiles.
 */
function normalizeAllBenchmarks(models: Model[]) {
  const cohorts = buildCohorts(models);
  const byModel = new Map<string, Map<string, number>>();
  const percentilesByModel = new Map<string, Record<string, number>>();
  const cohortSizes = new Map<string, Record<string, number>>();

  for (const model of models) {
    byModel.set(model.id, new Map());
    percentilesByModel.set(model.id, {});
    cohortSizes.set(model.id, {});
  }

  for (const [benchmarkSlug, members] of cohorts) {
    const { scores, percentiles, cohortSize } = scoreByCohort(
      members,
      benchmarkSlug,
    );

    members.forEach((member) => {
      const score = scores.get(member.modelId);
      if (score != null) byModel.get(member.modelId)?.set(benchmarkSlug, score);
      const p = percentiles.get(member.modelId);
      if (p != null) percentilesByModel.get(member.modelId)![benchmarkSlug] = p;
      cohortSizes.get(member.modelId)![benchmarkSlug] = cohortSize;
    });
  }

  return { byModel, percentilesByModel, cohortSizes };
}

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

let cache: EnrichedModel[] | null = null;

/**
 * Devuelve todos los modelos enriquecidos (scores, velocidad, capacidad).
 * Memoizado por proceso: la normalización por cohorte es determinista.
 */
export function getEnrichedModels(): EnrichedModel[] {
  if (cache) return cache;

  const models = MODELS;
  const { byModel, percentilesByModel, cohortSizes } =
    normalizeAllBenchmarks(models);

  cache = models.map((model) => {
    const normalized = byModel.get(model.id) ?? new Map<string, number>();
    const skills = aggregateSkillProfile(normalized);

    // Velocidad: tomamos la mejor oferta disponible (API o proveedor).
    const speedSource = pickBestSpeed(model);

    const subscriptions = model.accessChannels.filter(
      (c) => c.kind === "OFFICIAL_SUBSCRIPTION",
    );
    const apiChannels = model.accessChannels.filter(
      (c) =>
        c.kind === "FIRST_PARTY_API" || c.kind === "THIRD_PARTY_API",
    );
    const localChannels = model.accessChannels.filter(
      (c) => c.kind === "LOCAL_SELF_HOSTED",
    );

    const hasOsiLicense = model.isOsiLicense === true;
    const canSelfHost =
      model.supportsSelfHosting === true ||
      model.weightType !== "PROPRIETARY";

    return {
      ...model,
      skills,
      qualityIndex: overallScore(skills) * 10,
      overall: overallScore(skills),
      percentiles: percentilesByModel.get(model.id) ?? {},
      cohortSizes: cohortSizes.get(model.id) ?? {},
      speed: classifySpeed(speedSource.tps, speedSource.ttft),
      capacity: translateContextWindow(model.contextWindow),
      budget: buildContextBudget(model.contextWindow, model.maxOutputTokens),
      materialCapacity: describeMaterialCapacity(model.contextWindow),
      subscriptions,
      apiChannels,
      localChannels,
      canSelfHost,
      hasOsiLicense,
    };
  });

  return cache;
}

/** Elige la mejor oferta de velocidad (mayor tps, menor ttft). */
function pickBestSpeed(model: Model): {
  tps: number | null;
  ttft: number | null;
} {
  const candidates = [
    ...model.providerOffers.map((o) => ({
      tps: o.throughputTps ?? null,
      ttft: o.ttftSeconds ?? null,
    })),
    ...model.accessChannels
      .filter(
        (c) =>
          c.kind === "FIRST_PARTY_API" || c.kind === "THIRD_PARTY_API",
      )
      .map((c) => ({
        tps: c.throughputTps ?? null,
        ttft: c.ttftSeconds ?? null,
      })),
  ].filter((c) => c.tps != null || c.ttft != null);

  if (candidates.length === 0) return { tps: null, ttft: null };

  // Prioriza TTFT bajo (lo que más percibe el usuario), luego tps alto.
  return candidates.reduce((best, current) => {
    const bestTtft = best.ttft ?? Number.POSITIVE_INFINITY;
    const curTtft = current.ttft ?? Number.POSITIVE_INFINITY;
    if (curTtft < bestTtft) return current;
    if (curTtft === bestTtft && (current.tps ?? 0) > (best.tps ?? 0)) {
      return current;
    }
    return best;
  });
}

/** Modelos destacados (Top 20 curado), ordenados por featuredOrder. */
export function getFeaturedModels(): EnrichedModel[] {
  return getEnrichedModels()
    .filter((m) => m.isFeatured)
    .sort((a, b) => (a.featuredOrder ?? 999) - (b.featuredOrder ?? 999));
}

/** Todos los modelos, ordenados por puntuación global. */
export function getAllModelsSorted(): EnrichedModel[] {
  return [...getEnrichedModels()].sort((a, b) => b.overall - a.overall);
}

export function getModelBySlug(slug: string): EnrichedModel | undefined {
  return getEnrichedModels().find((m) => m.slug === slug);
}

export function getModelById(id: string): EnrichedModel | undefined {
  return getEnrichedModels().find((m) => m.id === id);
}

/**
 * Precios de API "baratos" por modelo (el más barato disponible).
 *
 * Devuelve el canal CON SU IDENTIDAD: sin el nombre del proveedor, la
 * comparativa de la ficha ": API oficial" vs "OpenRouter" no tenía sentido
 * (era un empate disfrazado de victoria de precio).
 */
export function getCheapestApiPricing(model: EnrichedModel): ApiPricing | null {
  return getApiPricings(model)[0] ?? null;
}

/**
 * Todas las vías de pago por uso de un modelo, ordenadas de más barata a más
 * cara. Conserva el proveedor para que la UI pueda nombrarlo.
 */
export function getApiPricings(model: EnrichedModel): ApiPricing[] {
  const candidates: ApiPricing[] = [];

  for (const channel of model.apiChannels) {
    if (channel.inputPricePer1M != null && channel.outputPricePer1M != null) {
      candidates.push({
        inputPer1M: channel.inputPricePer1M,
        outputPer1M: channel.outputPricePer1M,
        cachedInputPer1M: channel.cachedInputPricePer1M,
      });
    }
  }

  for (const offer of model.providerOffers) {
    if (offer.inputPricePer1M != null && offer.outputPricePer1M != null) {
      candidates.push({
        inputPer1M: offer.inputPricePer1M,
        outputPer1M: offer.outputPricePer1M,
        cachedInputPer1M: offer.cachedInputPricePer1M,
      });
    }
  }

  // Orden estable: a igualdad de blended, gana la vía first-party (es la
  // oficial del laboratorio). Antes el `reduce` ganaba por orden de aparición,
  // lo que hacía que un empate pareciera una victoria de precio.
  return candidates
    .map((pricing, index) => ({ pricing, index }))
    .sort((a, b) => {
      const diff = blendedOf(a.pricing) - blendedOf(b.pricing);
      if (Math.abs(diff) > 1e-9) return diff;
      return a.index - b.index;
    })
    .map((c) => c.pricing);
}

/** Coste blended 3:1 (input:output) — la unidad comparable entre vías. */
export function blendedOf(pricing: ApiPricing): number {
  return (3 * pricing.inputPer1M + pricing.outputPer1M) / 4;
}

/** Suscripción oficial más barata de un modelo (si existe). */
export function getCheapestSubscription(
  model: EnrichedModel,
): AccessChannel | undefined {
  return [...model.subscriptions].sort(
    (a, b) => (a.monthlyPrice ?? 0) - (b.monthlyPrice ?? 0),
  )[0];
}

/** Requisitos de hardware para ejecución local (del modelo o del canal). */
export function getLocalRequirements(
  model: EnrichedModel,
): LocalRequirements | undefined {
  if (model.localRequirements) return model.localRequirements;
  return model.localChannels?.[0]?.localRequirements;
}

/** Mapa modelId → SkillProfile, para el recomendador. */
export function getSkillProfiles(): Map<string, SkillProfile> {
  return new Map(getEnrichedModels().map((m) => [m.id, m.skills]));
}

/** Catálogo de benchmarks con metadatos. */
export function getBenchmarkCatalog() {
  return BENCHMARKS;
}

/** Modelos que se pueden autoalojar (pesos abiertos). */
export function getSelfHostableModels(): EnrichedModel[] {
  return getEnrichedModels().filter((m) => m.canSelfHost);
}

// ─────────────────────────────────────────────────────────────
// MÓDULO E — ÍNDICE DE LABORATORIOS Y PROVEEDORES (ADR 022)
// ─────────────────────────────────────────────────────────────

/** Un laboratorio con los modelos que publica. */
export interface LaboratoryWithModels {
  laboratory: Laboratory;
  models: EnrichedModel[];
}

/** Un proveedor con los modelos que sirve. */
export interface ProviderWithModels {
  provider: Provider;
  models: EnrichedModel[];
}

/**
 * Laboratorios con sus modelos, ordenados por número de modelos y luego por
 * nombre. Es un ÍNDICE: no expone precios propios, solo navegación.
 */
export function getLaboratoriesWithModels(): LaboratoryWithModels[] {
  const models = getEnrichedModels();
  return LABORATORIES.map((laboratory) => ({
    laboratory,
    models: models.filter((m) => m.laboratoryId === laboratory.id),
  }))
    .filter((entry) => entry.models.length > 0)
    .sort(
      (a, b) =>
        b.models.length - a.models.length ||
        a.laboratory.name.localeCompare(b.laboratory.name, "es"),
    );
}

/**
 * Proveedores con los modelos que sirven, ordenados igual que los
 * laboratorios.
 */
export function getProvidersWithModels(): ProviderWithModels[] {
  const models = getEnrichedModels();
  return PROVIDERS.map((provider) => ({
    provider,
    models: models.filter((m) =>
      m.providerOffers.some((o) => o.providerId === provider.id),
    ),
  }))
    .filter((entry) => entry.models.length > 0)
    .sort(
      (a, b) =>
        b.models.length - a.models.length ||
        a.provider.name.localeCompare(b.provider.name, "es"),
    );
}

/** Laboratorio por slug (o `undefined`). */
export function getLaboratoryBySlug(slug: string): Laboratory | undefined {
  return LABORATORIES.find((l) => l.slug === slug);
}

/** Proveedor por slug (o `undefined`). */
export function getProviderBySlug(slug: string): Provider | undefined {
  return PROVIDERS.find((p) => p.slug === slug);
}

/**
 * Coste estimado del hardware por mes para un modelo autoalojado.
 * Devuelve null si no hay datos o si no se puede autoalojar.
 */
export function getLocalMonthlyCost(
  model: EnrichedModel,
): number | null {
  const channel = model.localChannels?.[0];
  return channel?.estimatedHardwareMonthlyCost ?? null;
}

export type { ModelBenchmarkResult };
