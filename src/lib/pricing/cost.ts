/**
 * Capa de precios: coste en USD a partir de tokens y precios por 1M.
 */

import type { ApiPricing } from "@/lib/domain/types";
import { round2 } from "@/lib/scoring/normalize";

/**
 * Coste de una única interacción.
 *
 * El input cacheado se cobra al precio discounted si el provider lo ofrece;
 * si no, se cobra a precio normal (es lo que asumen la mayoría de providers).
 */
export function costOfInteraction(
  pricing: ApiPricing,
  inputTokens: number,
  outputTokens: number,
  opts: { cachedInputRatio?: number; cachedInputTokens?: number } = {},
): number {
  const cachedRatio = opts.cachedInputRatio ?? 0;
  const cachedTokens =
    opts.cachedInputTokens ?? Math.round(inputTokens * cachedRatio);
  const billableInput = Math.max(0, inputTokens - cachedTokens);

  const inputCost = (billableInput / 1_000_000) * pricing.inputPer1M;

  // Si el provider no ofrece precio de caché, los tokens cacheados se cobran
  // al precio NORMAL de input (no gratis). Es el comportamiento por defecto
  // de la mayoría de providers que no soportan prompt caching.
  const cachedPricePer1M =
    pricing.cachedInputPer1M ?? pricing.inputPer1M;
  const cachedCost = (cachedTokens / 1_000_000) * cachedPricePer1M;

  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + cachedCost + outputCost;
}

/** Coste mensual a partir de un volumen de interacciones. */
export function monthlyApiCost(
  pricing: ApiPricing,
  interactionsPerMonth: number,
  inputTokens: number,
  outputTokens: number,
  opts?: { cachedInputRatio?: number },
): number {
  return (
    interactionsPerMonth *
    costOfInteraction(pricing, inputTokens, outputTokens, opts)
  );
}

/**
 * Coste "blended" por 1M tokens con ratio 3:1 input:output.
 * Es la unidad en la que se anuncian los precios, así que es la comparable.
 */
export function blendedCostPer1M(pricing: ApiPricing): number {
  return round2((3 * pricing.inputPer1M + pricing.outputPer1M) / 4);
}

/**
 * Coste de mantener un input fijo en contexto (patrón "system prompt largo").
 * Relevante para usuarios que hacen RAG o pegan un documento largo siempre.
 */
export function fixedContextMonthlyCost(
  pricing: ApiPricing,
  contextTokens: number,
  interactionsPerMonth: number,
  cachedInputRatio = 0.9,
): number {
  return monthlyApiCost(
    pricing,
    interactionsPerMonth,
    contextTokens,
    0,
    { cachedInputRatio },
  );
}
