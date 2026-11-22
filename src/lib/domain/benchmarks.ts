/**
 * Metadatos de benchmarks — curado, con descripción en lenguaje llano.
 */

import type { BenchmarkMeta } from "@/lib/domain/types";

export const BENCHMARKS: BenchmarkMeta[] = [
  {
    slug: "swe-bench-verified",
    name: "SWE-bench Verified",
    category: "CODING",
    unit: "percent",
    plainDescription:
      "Resuelve problemas reales de GitHub medidos por si las pruebas pasan",
  },
  {
    slug: "livecodebench",
    name: "LiveCodeBench",
    category: "CODING",
    unit: "percent",
    plainDescription: "Escribe código correcto en ejercicios de programación nuevos",
  },
  {
    slug: "gpqa-diamond",
    name: "GPQA Diamond",
    category: "REASONING",
    unit: "percent",
    plainDescription:
      "Resuelve preguntas de ciencia de nivel doctoral, con búsqueda web",
  },
  {
    slug: "arc-agi",
    name: "ARC-AGI",
    category: "REASONING",
    unit: "percent",
    plainDescription:
      "Resuelve problemas de razonamiento abstracto que no ha visto antes",
  },
  {
    slug: "arena-elo",
    name: "Chatbot Arena Elo",
    category: "HUMAN_PREF",
    unit: "elo",
    plainDescription:
      "Preferencia humana: qué respuesta la gente prefiere",
  },
  {
    slug: "arena-writing",
    name: "Arena Writing",
    category: "HUMAN_PREF",
    unit: "elo",
    plainDescription: "Preferencia humana específicamente en redacción",
  },
  {
    slug: "arena-multilingual",
    name: "Arena Multilingual",
    category: "MULTILINGUAL",
    unit: "elo",
    plainDescription: "Preferencia humana en idiomas distintos al inglés",
  },
  {
    slug: "multilingual-mgsm",
    name: "Multilingual MGSM",
    category: "MULTILINGUAL",
    unit: "percent",
    plainDescription: "Resuelve problemas de matemáticas en varios idiomas",
  },
  {
    slug: "finance-reasoning",
    name: "Finance Reasoning",
    category: "MATH",
    unit: "percent",
    plainDescription: "Razona sobre datos financieros y series temporales",
  },
  {
    slug: "table-reasoning",
    name: "Table Reasoning",
    category: "MATH",
    unit: "percent",
    plainDescription: "Interpreta tablas y hojas de cálculo para responder preguntas",
  },
  {
    slug: "ruler-128k",
    name: "RULER 128K",
    category: "LONG_CONTEXT",
    unit: "percent",
    plainDescription:
      "Recupera información escondida en textos muy largos (128k tokens)",
  },
  {
    slug: "longbench-v2",
    name: "LongBench v2",
    category: "LONG_CONTEXT",
    unit: "percent",
    plainDescription: "Comprensión de documentos muy extensos",
  },
  {
    slug: "aa-quality-index",
    name: "Artificial Analysis Quality Index",
    category: "AGGREGATE",
    unit: "score",
    plainDescription: "Índice agregado de calidad de Artificial Analysis (0-100)",
  },
];

export const BENCHMARK_MAP = new Map(
  BENCHMARKS.map((b) => [b.slug, b]),
);
