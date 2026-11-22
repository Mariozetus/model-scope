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

/**
 * Nivel de cuota de un plan de suscripción.
 *
 * El binario "limitado / ilimitado" mentía: no hay ningún plan de $100/mes
 * que sea realmente ilimitado, y los propios proveedores comunican sus planes
 * con niveles ("very high", "high", "medium"). Además, un plan con fallback
 * TIENE un límite por definición.
 *
 * El número exacto (`estimatedMessageCap`) solo es fuente de verdad cuando
 * el nivel es numérico; para el resto, la capacidad no es calculable y la UI
 * lo dice en lugar de inventar un infinito.
 */
export type QuotaLevel =
  /** Sin techo conocido. */
  | "UNLIMITED"
  /** Cientos de mensajes por ventana. */
  | "VERY_HIGH"
  /** Decenas de mensajes por ventana. */
  | "HIGH"
  /** Entre 40 y 80 mensajes por ventana. */
  | "MEDIUM"
  /** Menos de 40 mensajes por ventana. */
  | "LIMITED"
  /** El proveedor no publica ni el nivel ni el número. */
  | "UNKNOWN";

/**
 * Nivel de cuota y su etiqueta en lenguaje llano.
 * El orden refleja la severidad: de más головiota a más restrictivo.
 */
export const QUOTA_LEVELS: readonly QuotaLevel[] = [
  "UNLIMITED",
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "LIMITED",
  "UNKNOWN",
] as const;

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
  /**
   * Nivel de cuota del plan. Obligatorio en canales de suscripción: sin él no
   * se puede decir si el plan es "sin límite" (que casi nunca lo es) o si
   * estamos inventando una capacidad.
   */
  quotaLevel?: QuotaLevel;
  /**
   * Nº de mensajes por ventana de reset. Solo es fuente de verdad cuando el
   * nivel es numérico (LIMITED / MEDIUM / HIGH / VERY_HIGH). null = el
   * proveedor no publica el número.
   */
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
// WORK PROFILES — el tipo de trabajo que el usuario hace
// ─────────────────────────────────────────────────────────────

/**
 * Perfil de trabajo: QUÉ hace el usuario y con CUÁNTO material.
 *
 * Antes había dos ejes multiplicativos (tamaño × caso de uso) que se
 * contradecían: "chat corto en programación" costaba más tokens que "chat
 * corto en general". Ahora hay un solo eje y el contenido del caso de uso
 * vive DENTRO del perfil.
 *
 * Cada perfil lleva una `reference` — un ejemplo real que el usuario
 * reconoce — porque sin ella las cifras no significan nada para quien no
 * sabe qué es un token.
 */
export interface WorkProfile {
  key: string;
  /** Etiqueta corta: "Revisión de código". */
  label: string;
  /** Ejemplo real de lo que el usuario manda. */
  reference: string;
  /** Tokens de entrada por intercambio. */
  inputTokens: number;
  /** Tokens de respuesta por intercambio. */
  outputTokens: number;
  /** Descripción larga para el Modo Técnico. */
  description: string;
}

/**
 * Cómo consume el usuario el material. Determina si la ventana de contexto es
 * el límite real o si el material entra por bloques (herramientas, repo
 * conectado).
 */
export type WorkMode =
  /** El usuario pega solo lo que necesita en cada mensaje. */
  | "PASTE"
  /** El modelo tiene acceso al proyecto (herramientas, repo conectado). */
  | "CONNECTED"
  /** El usuario pega todo el material de golpe, de una sentada. */
  | "ALL_AT_ONCE";

// ─────────────────────────────────────────────────────────────
// SESSION — la unidad de trabajo
// ─────────────────────────────────────────────────────────────

/**
 * Resultado de cruzar la ventana de contexto con un perfil de trabajo.
 *
 * "Sesión" = un bloque de intercambios sobre un tema, en una conversación.
 * Las sesiones que caben dependen del presupuesto del modelo; las que te da
 * la cuota dependen del plan. Son restricciones ORTOGONALES: se agotan en
 * momentos distintos, y la que frena al usuario es lo que hay que responder.
 */
export interface SessionBudget {
  /** Perfil de trabajo usado para el cálculo. */
  profile: WorkProfile;
  /** Nº de sesiones de este tipo que caben en la ventana del modelo. */
  sessionsPerConversation: number | null;
  /** Tokens que consume una sesión completa de este tipo. */
  tokensPerSession: number;
  /** Tokens que puede ocupar la respuesta dentro del presupuesto. */
  maxOutputTokens: number | null;
  /** true si el material completo NO cabe en una sola conversación. */
  doesNotFit: boolean;
  /** true si el material cabe, pero con holgura mínima. */
  tightFit: boolean;
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

  /**
   * Fecha de verificación de los precios de esta oferta. Obligatoria por
   * ADR 013: toda cifra lleva `source` o `lastVerifiedDate`.
   */
  lastVerifiedDate?: string;
  /** Procedencia del precio (página del proveedor, OpenRouter…). */
  priceSource?: string;

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
