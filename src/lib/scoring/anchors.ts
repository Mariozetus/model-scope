/**
 * Curva de anclaje Percentil → Puntuación.
 *
 * ─────────────────────────────────────────────────────────────────
 * POR QUÉ NO USAMOS ANCLAS ABSOLUTAS (min/max fijos por benchmark)
 * ─────────────────────────────────────────────────────────────────
 * Un techo absoluto obliga a recalibrarlo cada vez que sale un modelo
 * mejor, lo que hace que TODOS los modelos bajen de nota aunque no hayan
 * cambiado. Eso invalida el histórico y confunde al usuario.
 *
 * En su lugar, la escala 1..10 es un INSTRUMENTO FIJO (esta tabla) y la
 * cohorte de modelos vigentes es el objeto medido. El "10" siempre existe y
 * siempre lo ocupa el líder de la cohorte actual; cuando sale un modelo
 * mejor, el 10 se traspasa automáticamente y el anterior baja a su nuevo
 * percentil — que es un cambio merecido, no artificial.
 *
 * La tabla nunca se recalibra por la salida de un modelo. Solo se modifica
 * si cambia la INTERPRETACIÓN de la escala (p. ej. pasar de 1..10 a 0..100),
 * lo cual es un cambio de producto explícito y versionado.
 */

/** Puntos de control de la curva percentil → puntuación (0..10). */
export const PERCENTILE_TO_SCORE = [
  { percentile: 0.0, score: 1.0 },
  { percentile: 0.1, score: 2.0 },
  { percentile: 0.25, score: 3.5 },
  { percentile: 0.5, score: 5.0 },
  { percentile: 0.75, score: 7.5 },
  { percentile: 0.9, score: 9.0 },
  { percentile: 1.0, score: 10.0 },
] as const;

/**
 * Techo de capacidad por benchmark.
 *
 * Evita que un outlier se lleve el 10: si el mejor del cohorte solo llega
 * al 55% en un benchmark, no debería recibir un 10 (= "el mejor disponible").
 * Este techo es CURADO, no derivado del cohorte, así que tampoco envejece.
 */
export const BENCHMARK_CEILINGS: Record<string, number> = {
  "swe-bench-verified": 9.0,
  "gpqa-diamond": 9.5,
  "arc-agi": 9.0,
  "livecodebench": 9.0,
  "arena-elo": 9.5,
  "arena-writing": 9.5,
  "arena-multilingual": 9.0,
  "multilingual-mgsm": 9.0,
  "finance-reasoning": 9.0,
  "table-reasoning": 9.0,
  "ruler-128k": 9.0,
  "longbench-v2": 9.0,
  "aa-quality-index": 9.5,
};

/**
 * Factor de confianza por tamaño de cohorte.
 *
 * Cohortes pequeñas → el percentil es ruidoso (un solo modelo outlier mueve
 * todo). Se contrae el score hacia la mediana (5.0) para no exagerar
 * diferencias estadísticas sin respaldo.
 *
 * n >= 30 → 1.0 (sin contracción)
 * n <= 3  → 0.55 (contracción fuerte)
 */
export function cohortConfidence(n: number): number {
  if (n >= 30) return 1.0;
  if (n <= 2) return 0.55;
  const t = (Math.log(n) - Math.log(3)) / (Math.log(30) - Math.log(3));
  return 0.55 + t * 0.45;
}
