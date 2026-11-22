/**
 * Tipos del dominio — AI Model & Access Comparator.
 *
 * Estos tipos son la fuente de verdad del vocabulario (glosario del brief).
 * La capa de persistencia (Prisma) se mapeará a estas formas; el seed data
 * usa estas formas directamente mientras no haya DB activa.
 */

// ─────────────────────────────────────────────────────────────
// LABORATORY — la entidad que entrena y publica el modelo base
// ─────────────────────────────────────────────────────────────
export interface Laboratory {
  id: string;
  slug: string;
  name: string;
  websiteUrl?: string;
  country?: string;
  foundedYear?: number;
  /**
   * true si el laboratorio aloja en su propia nube (ej. Groq, Together,
   * Fireworks) en lugar de ser un agregador que enruta peticiones.
   */
  isHostingProvider?: boolean;
}

// ─────────────────────────────────────────────────────────────
// MODEL — la arquitectura/versión específica entrenada
// ─────────────────────────────────────────────────────────────

/**
 * Naturaleza de los pesos.
 *
 * La distinción importa porque "pesos abiertos" NO es lo mismo que "código
 * abierto": Llama 4 tiene pesos descargables pero licencia propietaria de
 * Meta con condiciones; Qwen3 y DeepSeek V4 usan licencias OSI (Apache-2.0,
 * MIT) que permiten uso comercial, modificación y redistribución sin
 * condiciones.
 */
export type WeightType =
  /** Pesos propietario: solo se puede usar vía API o suscripción. */
  | "PROPRIETARY"
  /** Pesos descargables con licencia restrictiva (ej. Llama 4 Community). */
  | "OPEN_WEIGHTS_RESTRICTED"
  /** Pesos descargables con licencia OSI (Apache-2.0, MIT, etc.). */
  | "OPEN_WEIGHTS_PERMISSIVE";

export interface ModelLifecycle {
  status: "PREVIEW" | "GA" | "DEPRECATED" | "LEGACY";
  /** Fecha de retirada si está deprecado. */
  deprecatedAt?: string;
  /** Destino al que se enrutan las peticiones tras la deprecación. */
  routedTo?: string;
}

export type Modality = "text" | "vision" | "audio" | "video";

/** Taxonomía de intención del Modo Práctico (filtros por intención). */
export type UseCase =
  | "code"
  | "writing"
  | "data-analysis"
  | "pdf-analysis"
  | "reasoning"
  | "cheap"
  /** Uso local / self-hosted: privacidad total, sin coste por token. */
  | "local";

/**
 * Requisitos de hardware para ejecutar el modelo en local.
 * Solo tiene sentido en modelos de pesos abiertos.
 */
export interface LocalRequirements {
  /** Parámetros totales (para MoE, el total, no los activos). */
  totalParameters: number | null;
  /** Parámetros activos por token (solo MoE). */
  activeParameters?: number | null;
  /** Tamaño de descarga aproximado en GB con cuantización Q4_K_M. */
  downloadGbQ4: number | null;
  /** VRAM mínima recomendada en GB para contexto corto (4k). */
  minVramGb: number | null;
  /** VRAM recomendada en GB para contexto de 32k. */
  recommendedVramGb: number | null;
  /** RAM del sistema si corre solo en CPU. */
  cpuOnlyRamGb?: number | null;
  /** Herramientas con las que se ejecuta localmente. */
  runtimes: string[];
  /** Comando de ejemplo para descargarlo y ejecutarlo. */
  exampleCommand?: string;
}

export interface Model {
  id: string;
  slug: string;
  name: string;
  laboratoryId: string;
  laboratoryName: string;

  /** Identificadores externos para sincronización con OpenRouter. */
  openRouterId?: string;
  apiModelId?: string;

  releasedAt?: string;
  lifecycle: ModelLifecycle;
  weightType: WeightType;
  /** "MIT" | "Apache-2.0" | "Llama 4 Community License" | null (propietario) */
  license?: string;
  /** true si la licencia es OSI (permite uso comercial sin condiciones). */
  isOsiLicense?: boolean;

  // ── Capacidades intrínsecas ──
  /** Tokens totales (input + output). */
  contextWindow?: number;
  maxOutputTokens?: number;
  modalities: Modality[];
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJSONMode: boolean;
  supportsCaching: boolean;
  /** true si el modelo se puede alojar en tu propia infraestructura. */
  supportsSelfHosting?: boolean;

  // ── Curación editorial ──
  summary?: string;
  practicalSummary?: string;
  useCases: UseCase[];
  isFeatured: boolean;
  featuredOrder?: number;

  /** Raw benchmarks, en la unidad nativa de cada benchmark. */
  benchmarks: ModelBenchmarkResult[];
  /** Canales de acceso de primera clase (curados). */
  accessChannels: AccessChannel[];
  /** Ofertas de proveedores terceros (sincronizables). */
  providerOffers: ProviderOffer[];
  /** Requisitos para ejecutarlo en local (solo pesos abiertos). */
  localRequirements?: LocalRequirements;
}

// ─────────────────────────────────────────────────────────────
// BENCHMARKS
// ─────────────────────────────────────────────────────────────
export type BenchmarkCategory =
  | "REASONING"
  | "CODING"
  | "HUMAN_PREF"
  | "AGGREGATE"
  | "LONG_CONTEXT"
  | "MATH"
  | "VISION"
  | "MULTILINGUAL";

export interface BenchmarkMeta {
  slug: string;
  name: string;
  category: BenchmarkCategory;
  /** "score" | "percent" | "elo" */
  unit: string;
  plainDescription?: string;
}

export interface ModelBenchmarkResult {
  benchmarkSlug: string;
  /** Valor crudo en la unidad del benchmark. */
  score: number;
  source?: string;
  measuredAt?: string;
}

// ─────────────────────────────────────────────────────────────
// SKILL DIMENSIONS — puntuaciones normalizadas 0..10
// ─────────────────────────────────────────────────────────────
export type SkillDimension =
  | "code"
  | "reasoning"
  | "writing"
  | "languages"
  | "data-analysis"
  | "long-context";

export const SKILL_DIMENSIONS: readonly SkillDimension[] = [
  "code",
  "reasoning",
  "writing",
  "languages",
  "data-analysis",
  "long-context",
] as const;

export interface SkillProfile {
  code: number;
  reasoning: number;
  writing: number;
  languages: number;
  "data-analysis": number;
  "long-context": number;
}

// ─────────────────────────────────────────────────────────────
// ACCESS CHANNELS — vías de acceso de primera clase
// ─────────────────────────────────────────────────────────────
export type AccessChannelKind =
  /** Suscripción oficial del laboratorio (B2C). */
  | "OFFICIAL_SUBSCRIPTION"
  /** API de pago por uso del propio laboratorio. */
  | "FIRST_PARTY_API"
  /** API de un tercero: agregador o proveedor de inferencia. */
  | "THIRD_PARTY_API"
  /** Ejecución local / self-hosted: sin coste por token. */
  | "LOCAL_SELF_HOSTED";

export interface AccessChannel {
  id: string;
  modelId: string;
  kind: AccessChannelKind;
  /** "ChatGPT Plus", "API de Anthropic", "OpenRouter", "Tu servidor" */
  name: string;
  providerSlug?: string;
  websiteUrl?: string;

  // Pricing API (FIRST_PARTY_API / THIRD_PARTY_API)
  inputPricePer1M?: number;
  outputPricePer1M?: number;
  cachedInputPricePer1M?: number;
  currency: string;

  // Rendimiento
  throughputTps?: number;
  ttftSeconds?: number;
  quantization?: string;

  // ── Campos de suscripción (OFFICIAL_SUBSCRIPTION) ──
  monthlyPrice?: number;
  annualPrice?: number | null;
  estimatedMessageCap?: number | null;
  resetWindowHours?: number | null;
  fallbackModelOnLimit?: string | null;
  /** Por defecto false; solo true si el proveedor entrena con los chats. */
  trainsOnUserDataByDefault?: boolean;
  includedTools?: string[];
  freeTier?: boolean;
  freeTierQuotaNote?: string;
  includedApiCredits?: number;
  lastVerifiedDate?: string;
  notes?: string;

  // ── Campos de ejecución local (LOCAL_SELF_HOSTED) ──
  /** true si es la opción de coste cero: solo pagas tu hardware. */
  isZeroMarginalCost?: boolean;
  /** Coste estimado del hardware (amortización mensual), si se conoce. */
  estimatedHardwareMonthlyCost?: number;
  /** Dificultad para ponerlo en marcha. */
  setupDifficulty?: "facil" | "media" | "avanzada";
  /** Requisitos hardware resumidos para la UI. */
  localRequirements?: LocalRequirements;
}

// ─────────────────────────────────────────────────────────────
// PROVIDERS — agregadores / inferencia / cloud
// ─────────────────────────────────────────────────────────────
export type ProviderKind =
  | "AGGREGATOR"
  | "INFERENCE"
  | "CLOUD"
  | "FIRST_PARTY";

export interface Provider {
  id: string;
  slug: string;
  name: string;
  kind: ProviderKind;
  websiteUrl?: string;
  apiDocsUrl?: string;
  /** true si el provider sirve modelos de pesos abiertos de forma destacada. */
  focusesOpenWeights?: boolean;
}

export interface ProviderOffer {
  modelId: string;
  providerId: string;
  providerName: string;
  providerSlug: string;

  inputPricePer1M?: number;
  outputPricePer1M?: number;
  cachedInputPricePer1M?: number;

  throughputTps?: number;
  ttftSeconds?: number;
  quantization?: string;

  isOfficial: boolean;
  isRecommended: boolean;
}

// ─────────────────────────────────────────────────────────────
// PRICING (vista unificada para la calculadora)
// ─────────────────────────────────────────────────────────────
export interface ApiPricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}
