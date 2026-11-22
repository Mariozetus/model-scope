# Arquitectura — ModelScope

> Documento técnico: **cómo está construido** el proyecto.
> Para el *qué* y el *por qué* del diseño, ver [`../AGENTS.md`](../AGENTS.md).
> Para el histórico de decisiones, ver [`DECISIONS.md`](DECISIONS.md).

---

## 1. Vista general

```
┌───────────────────────────────────────────────────────────────┐
│                        RUTAS (App Router)                     │
│  /                    → home: Hero + Recomendador + Calc +   │
│                         Catálogo                              │
│  /modelos/[slug]      → Módulo B: ficha del modelo            │
│  /laboratorios        → Módulo E: índice de labs y providers │
└───────────────────────────────────────────────────────────────┘
                              │
┌───────────────────────────────────────────────────────────────┐
│                     COMPONENTES (src/components)              │
│  catalog · model-card · technical-table · model-detail         │
│  subscription-calculator · recommender-wizard                  │
│  score-bar · privacy-badge · mode-toggle · theme-toggle       │
│  providers/mode-provider (estado global persistente)          │
└───────────────────────────────────────────────────────────────┘
                              │
┌───────────────────────────────────────────────────────────────┐
│                   LÓGICA DE NEGOCIO (src/lib)                 │
│  domain/     types · constants · benchmarks · equivalents     │
│  scoring/    cohort · anchors · skills · speed · normalize    │
│  pricing/    cost                                          │
│  calculator/ subscription-vs-usage · quota                   │
│  recommender/ wizard                                       │
└───────────────────────────────────────────────────────────────┘
                              │
┌───────────────────────────────────────────────────────────────┐
│                    CAPA DE DATOS (src/data)                   │
│  seed.ts  → catálogos: LABORATORIES · PROVIDERS · MODELS      │
│  models.ts → getEnrichedModels() + helpers de consulta        │
└───────────────────────────────────────────────────────────────┘
```

**Regla de dependencia:** las flechas solo apuntan hacia abajo. `src/lib/` no
importa de `src/components/`. `src/data/` no importa de `src/lib/components/`.
`src/lib/` solo se importa desde `src/data/` y `src/components/`.

## 2. Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.4.6 |
| UI runtime | React | 19.3.0 |
| Lenguaje | TypeScript | ^5 |
| Estilos | Tailwind CSS v4 | 4.3.3 |
| Componentes | shadcn/ui sobre **Base UI** | `@base-ui/react` ^1.9 |
| Iconos | lucide-react | ^1.3 |
| Gráficos | recharts (pendiente de uso real) | ^3.11 |
| Tests | Vitest | ^5.1.1 |
| Lint | ESLint 9 + `eslint-config-next` | 16.4.6 |
| Modelo relacional | Prisma (schema documentado, no activo) | — |

**Sin base de datos activa.** Sin claves de API. `npm install && npm run dev` y
funciona.

## 3. Estructura de ficheros

```
prisma/
  schema.prisma                Modelo relacional objetivo (Postgres) — no activado

src/
  app/
    layout.tsx                 Shell, providers, metadata, <html data-mode>
    page.tsx                   Home: Hero + Recomendador + Calculadora + Catálogo
    globals.css                Tailwind v4 + tokens + reglas por data-mode
    modelos/[slug]/
      page.tsx                 Módulo B — ficha del modelo
    laboratorios/
      page.tsx                 Módulo E — índice de laboratorios y proveedores

  components/
    ui/                        shadcn/ui (Base UI) — badge, button, card, dialog,
                               label, progress, scroll-area, select, separator,
                               skeleton, slider, switch, table, tabs, tooltip
    providers/
      mode-provider.tsx        Toggle global Práctico ↔ Técnico (persistido)
    site-header.tsx            Navegación + interruptores de modo y tema
    site-footer.tsx            Aviso de "datos de referencia"
    hero.tsx                   Portada
    catalog.tsx                Módulo A — filtros por intención + render dual
    model-card.tsx             Tarjeta (Modo Práctico)
    technical-table.tsx        Tabla densa ordenable (Modo Técnico)
    model-detail.tsx           Módulo B — radar, capacidad, ficha, vías de acceso
    subscription-calculator.tsx Módulo C — la calculadora
    recommender-wizard.tsx     Módulo D — wizard de 4 pasos (entrada del comparador)
    score-bar.tsx              Barra de puntuación 0..10 (role="meter")
    privacy-badge.tsx          Semáforo + WeightBadge + LocalBadge

  lib/
    domain/
      types.ts                 Tipos del dominio (fuente de verdad)
      constants.ts             Equivalentes humanos + perfiles de trabajo
      benchmarks.ts            13 benchmarks + descripciones en lenguaje llano
      equivalents.ts           tokens → páginas / líneas / sesiones / presupuesto
    scoring/
      anchors.ts               PERCENTILE_TO_SCORE, BENCHMARK_CEILINGS, cohortConfidence
      cohort.ts                scoreByCohort() — el motor del 1..10
      skills.ts                Composición por habilidad + índice agregado
      speed.ts                 Clasificación de velocidad cualitativa
      normalize.ts             clamp, round1, round2
    pricing/
      cost.ts                  Coste de tokens → USD
    calculator/
      subscription-vs-usage.ts Fórmula del Módulo C + veredicto de restricción
      quota.ts                 Cuota → experiencia real (por nivel)
    recommender/
      wizard.ts                Puntuación multicriterio del Módulo D
    format.ts                  Formateadores (tokens, dinero, fechas)
    utils.ts                   cn()

  data/
    seed.ts                    19 modelos, 8 laboratorios, 5 proveedores
    models.ts                  Capa de acceso a datos (normaliza y expone)

  __tests__/
    scoring.test.ts            Normalización por cohorte, anclas, confianza
    calculator.test.ts         Costes, veredicto, overflow, sesiones, presupuesto

docs/
  ARCHITECTURE.md              Este documento
  DECISIONS.md                 ADR: decisiones de diseño y alternativas
```

## 4. Capa de datos

### 4.1 El seed

`src/data/seed.ts` exporta tres arrays tipados contra el dominio:

```ts
export const LABORATORIES: Laboratory[] = [...]
export const PROVIDERS: Provider[] = [...]
export const MODELS: Model[] = [...]
```

Estado actual: **8 laboratorios, 5 proveedores, 19 modelos**. Precios y
ventanas de contexto verificados contra páginas oficiales el **2026-11-22**.

Cada `ModelBenchmarkResult` lleva `source` (procedencia del score) y cada
`AccessChannel` de suscripción lleva `lastVerifiedDate`.

### 4.2 La capa de acceso

`src/data/models.ts` es la **única** puerta de entrada a los datos. Si la UI
importa de `seed.ts` directamente, es un error de arquitectura.

Su responsabilidad:

1. **Construir las cohortes** por benchmark (`buildCohorts`): todos los modelos
   que tienen dato en ese benchmark.
2. **Normalizar** todos los benchmarks por cohorte (`normalizeAllBenchmarks`).
3. **Componer el `SkillProfile`** por modelo a partir de los benchmarks
   normalizados (`aggregateSkillProfile`).
4. **Enriquecer**: `EnrichedModel` = `Model` + todo lo calculado.

```ts
export interface EnrichedModel extends Model {
  skills: SkillProfile;          // 0..10 por habilidad
  qualityIndex: number;         // 0..100
  overall: number;               // 0..10, para ordenar
  percentiles: Record<string, number>;   // por benchmark
  cohortSizes: Record<string, number>;   // por benchmark
  speed: SpeedClassification;
  capacity: ContextWindowTranslation;   // tokens → páginas / líneas de código
  budget: ContextBudget;                 // presupuesto entrada + salida (ADR 019)
  materialCapacity: { label; detail };   // "Cabe un proyecto entero"
  subscriptions: AccessChannel[];
  apiChannels: AccessChannel[];
  localChannels: AccessChannel[];
  canSelfHost: boolean;
  hasOsiLicense: boolean;
}
```

API pública:

| Función | Para qué |
|---|---|
| `getEnrichedModels()` | Todos los modelos, enriquecidos y ordenados |
| `getModelBySlug(slug)` | Un modelo por slug (o `undefined`) |
| `getAllModelsSorted()` | Slugs para `generateStaticParams` |
| `getFeaturedModels()` | Los destacados (Top 11 por defecto) |
| `getCheapestApiPricing(model)` | El canal API más barato de un modelo |
| `getApiPricings(model)` | Todas las vías de pago por uso, ordenadas por precio |
| `getLocalRequirements(model)` | Requisitos de hardware (modelo o canal) |
| `getLocalMonthlyCost(model)` | Coste de hardware estimado por mes |
| `getSkillProfiles()` | `Map<modelId, SkillProfile>` para el recomendador |
| `getLaboratoriesWithModels()` | Módulo E: laboratorios + sus modelos |
| `getProvidersWithModels()` | Módulo E: proveedores + sus modelos |

**Trampa conocida:** `getLocalRequirements` y compañía usan `?.` sobre
`localChannels`. Los modelos propietarios no tienen canal local y un acceso
sin optional chaining rompe en runtime. Esto ya se corrigió en tres sitios
(`models.ts`, `modelos/[slug]/page.tsx`, `recommender-wizard.tsx`) — no lo
reviertas.

### 4.3 Migración a Prisma (planificada)

`prisma/schema.prisma` ya define el modelo relacional objetivo:

- `ModelProvider` como pivote N:M (un modelo, muchos proveedores).
- `PriceSnapshot` — histórico de precios (base para auditar cambios).
- `SyncRun` — trazas de la sincronización con OpenRouter.
- `LocalProfile` — requisitos de hardware.
- Enums `WeightType` y `ModelLifecycle`.

La migración **no cambia el contrato público**: `getEnrichedModels()` sigue
devolviendo `EnrichedModel[]`. Solo cambia el interior de `src/data/models.ts`.

## 5. Flujo de datos en runtime

### 5.1 Catálogo (Módulo A)

```
seed.MODELS
  → buildCohorts()             agrupar por benchmark
  → scoreByCohort()            percentil → 0..10 (por benchmark)
  → aggregateSkillProfile()    benchmarks → SkillProfile (6 dimensiones)
  → overallScore()             índice global
  → classifySpeed()            etiquetas cualitativas
  → translateContextWindow()   tokens → páginas/novelas
  → EnrichedModel[]
  → catalog.tsx
      ├─ modo "practical"  → model-card.tsx (tarjetas)
      └─ modo "technical"  → technical-table.tsx (tabla ordenable)
```

El cálculo es **determinista y sin efectos**: la misma cohorte produce siempre
las mismas puntuaciones. No hay aleatoriedad ni estado global en la capa de
datos.

### 5.2 Ficha del modelo (Módulo B)

Ruta `src/app/modelos/[slug]/page.tsx`:

1. `generateStaticParams()` devuelve los 19 slugs → prerenderizado estático.
2. `generateMetadata()` genera el título y la descripción por modelo.
3. `getModelBySlug(slug)`; si no existe → `notFound()`.
4. Se renderizan: capacidad de contexto, radar de habilidades, ficha técnica,
   tabla de vías de acceso, comparativa multi-proveedor y la tarjeta de
   ejecución local.

**Cache Components y `params`:** la ruta accede a `params`, así que declara
`export const instant = false`. Sin eso, Next.js 16 avisa de
`URL data during prerendering`. La alternativa sería `<Suspense>`, pero el
contenido es una ficha completa y un esqueleto no aporta nada.

### 5.3 Calculadora (Módulo C)

```
perfil de trabajo + frecuencia + modo de consumo + días laborables
  → WORK_PROFILES[profile]             tokens input/output por intercambio
  → calculateSubscriptionVsUsage()      fórmula pura
      ├─ comparativa suscripción vs API
      ├─ overflow de cuota (si el nivel es numérico)
      ├─ sesiones que caben en la ventana
      └─ veredicto: ¿qué te va a frenar, la cuota o la ventana?
```

`calculateSubscriptionVsUsage` es una **función pura**: sin `Date`, sin estado,
sin efectos. Es la fórmula más testeada del proyecto.

### 5.4 Recomendador (Módulo D)

```
4 pasos (necesidad · material · presupuesto · privacidad)
  → construir candidatos (modelo + canal)
  → qualityForNeed(profile, need)          calidad 0..10 para la necesidad
  → budgetMultiplier()                      multiplicativo
  → privacyMultiplier()                     multiplicativo
  → bonuses (suscripción 1.05, local 1.10)
  → recommend() → Top 3
```

El candidato es **modelo + canal**, no solo modelo: por eso la respuesta es «este
modelo, por esta vía, a este precio». El coste estimado de la vía API usa el
**perfil de trabajo** declarado, no una constante.

### 5.5 Índice de laboratorios y proveedores (Módulo E)

Ruta `src/app/laboratorios/page.tsx`:

```
LABORATORIES / PROVIDERS (seed)
  → getLaboratoriesWithModels() / getProvidersWithModels()
  → tarjetas con los modelos enlazados a sus fichas
```

Es un **índice de navegación** (ADR 022): no expone precios propios ni tablas
de precios por proveedor. Solo responde a «qué modelos da cada laboratorio» y
«qué ofrece cada proveedor».

## 6. Estado global y persistencia

Solo hay **dos** estados globales:

| Estado | Provider | Persistencia | Mecanismo |
|---|---|---|---|
| Modo Práctico ↔ Técnico | `ModeProvider` | `localStorage` | `useSyncExternalStore` |
| Tema claro ↔ oscuro | `theme-toggle.tsx` | `localStorage` | `useSyncExternalStore` |

**Por qué `useSyncExternalStore` y no `useEffect` + `setState`:**

1. La regla `react-hooks/set-state-in-effect` de React 19 lo prohíbe.
2. Leer una fuente externa (localStorage) no es un «efecto de sincronización»:
   `useSyncExternalStore` es la API correcta, evita renderizados en cascada y
   no produce desajustes de hidratación (el servidor devuelve `defaultMode` y
   el cliente se re-suscribe al montar).

Detalles de implementación:

- `STORAGE_KEY = "ai-recommender:view-mode"`.
- Evento propio `ai-recommender:mode-change` para notificar cambios hechos en
  la **misma** pestaña (el evento `storage` solo fires entre pestañas).
- `try/catch` en lectura y escritura: en modo privado `localStorage` puede
  lanzar. La sesión funciona igual, solo pierde la persistencia.
- El modo se refleja en `<html data-mode="...">` para que el CSS reaccione.

## 7. Renderizado dual

El mismo dato se presenta de dos formas. El conmutador no duplica la lógica de
datos: ambos caminos consumen el mismo `EnrichedModel[]`.

| | Modo Práctico | Modo Técnico |
|---|---|---|
| Catálogo | Tarjetas (`model-card.tsx`) | Tabla densa (`technical-table.tsx`) |
| Lenguaje | Plano, B2C | Denso, developer |
| Columnas clave | Precio, licencia, badge | Precios 1M, tok/s, TTFT, contexto, licencia, VRAM local, percentiles |
| Interacción | Lectura rápida | Orden por columna |

## 8. Accesibilidad

No es un extra: está implementado y verificado en modo claro y oscuro.

- El conmutador de modo es un `radiogroup` con `aria-checked`.
- Las barras de puntuación usan `role="meter"` con `aria-valuenow/min/max`.
- Foco visible en elementos interactivos y en las filas de la tabla.
- Se respeta `prefers-reduced-motion`.
- Contraste verificado en ambos temas.

## 9. Testing

Vitest sobre las fórmulas puras. No hay tests de componentes (sin React Testing
Library en el stack): la lógica vive en `src/lib/` precisamente para que sea
testeable sin DOM.

| Fichero | Cubre |
|---|---|
| `src/__tests__/scoring.test.ts` | `scoreByCohort`, `percentileToScore`, `cohortConfidence`, composición de skills |
| `src/__tests__/calculator.test.ts` | `costOfInteraction`, `monthlyApiCost`, `calculateSubscriptionVsUsage`, overflow, veredicto, sesiones, presupuesto de contexto, niveles de cuota |

53 tests en total. Bugs reales que los tests detectaron:

1. El input cacheado se cobraba gratis cuando el proveedor no tenía precio de
   caché. Ahora se cobra a precio normal de input.
2. `cohortConfidence` no era monótona entre `n = 2` y `n = 3`.
3. `assessFit` devolvía siempre `SPLIT_REQUIRED` cuando el material no cabía:
   el caso `DOES_NOT_FIT` ("no cabe ni por partes") era inalcanzable porque
   ambas ramas compartían la misma condición.

## 10. Configuración de Next.js

`next.config.ts`:

- `cacheComponents: true` — Cache Components (App Router moderno).
- `partialPrefetching: true` — Prefetch parcial.
- Turbopack por defecto.

Consecuencias practices ya conocidas:

- Las rutas que leen `params` necesitan `export const instant = false` o
  `<Suspense>`.
- Los tipos de props de página (`PageProps<>`, `LayoutProps<>`) los genera
  `npx next typegen` y son globales.

## 11. Build y despliegue

```bash
npm run verify   # typecheck + lint + test + build
```

Estado del build: **24 rutas estáticas** generadas (home, 404 y las 19 fichas de
modelo, más las variantes con prefetch parcial). Despliegue trivial: es una app
Next.js estática sin base de datos ni variables de entorno.

## 12. Rendimiento

- Catálogo y fichas prerenderizados en build → sin coste de render en runtime.
- La capa de datos es síncrona y en memoria: no hay I/O en el camino crítico.
- Recharts está instalado pero **no se usa todavía** (el radar es CSS puro).
  Cuidado: mantenerlo sin uso infla el bundle. O se usa o se quita.
- `lucide-react` se importa de forma individual (tree-shaking).

## 13. Extensiones previsibles

| Extensión | Dónde tocar | Impacto |
|---|---|---|
| Sincronización OpenRouter | `src/data/` (nuevo `openrouter.ts`) + `/api/v1/sync` | Alto: el seed pasa a ser caché |
| Persistencia real | `src/data/models.ts` + Prisma | Medio: el contrato no cambia |
| Gráfico Recharts real | `model-detail.tsx` | Bajo: sustituye `SkillRadar` |
| Comparación lado a lado | Nuevo módulo, `src/components/compare.tsx` | Alto: es una funcionalidad nueva |
| Panel de administración | Nuevas rutas `/admin` | Alto: superficie nueva |
| Aviso de precio caducado | `model-detail.tsx` + `catalog.tsx` | Bajo |
