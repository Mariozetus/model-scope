<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ModelScope — Documento principal de diseño

> Este archivo es el **contrato de diseño** del proyecto. Si algo aquí y el código
> discrepan, el código tiene un bug o este documento está desactualizado — en ambos
> casos hay que arreglarlo; no hay un tercer estado.
>
> Documentos complementarios:
> - [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — cómo está construido (capas, módulos, flujo de datos)
> - [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisiones de diseño registradas (ADR) con su *por qué*
> - [`README.md`](README.md) — instalación, comandos y descripción del catálogo actual

---

## 1. Qué es esto

ModelScope compara modelos de IA conectando **dos mundos que normalmente se
presentan por separado**:

| Mundo técnico | Mundo de consumo |
|---|---|
| Benchmarks, velocidad, ventana de contexto | Límites de suscripción, coste real, privacidad |
| "GPT-6.2 Astra es el mejor en SWE-bench" | "¿Cuánto me cuesta al mes y qué hago si me quedo sin cuota?" |

La tesis del producto: **un modelo superior que no puedes pagar o cuya cuota no
te llega no es superior para ti**. Por eso la unidad de comparación no es «el
modelo», es **la combinación modelo + vía de acceso**.

Alcance: **solo LLMs de texto y código**. Nada de visión, audio ni vídeo
generativo. La multimodalidad aparece en los metadatos, pero no es objeto de
comparación.

## 2. Los cuatro módulos (y solo estos)

El producto son cuatro módulos. Nada más entra sin discusión.

| Módulo | Qué resuelve | Ubicación |
|---|---|---|
| **A — Catálogo** | ¿Qué modelos hay y cuál me sirve? | `src/components/catalog.tsx` |
| **B — Ficha del modelo** | ¿Dónde y cómo lo uso? (suscripción / API / agregador / local) | `src/components/model-detail.tsx` |
| **C — Calculadora** | ¿Suscripción o pago por uso? | `src/lib/calculator/` + `subscription-calculator.tsx` |
| **D — Recomendador** | ¿Cuál es mi combinación ideal? (Top 3) | `src/lib/recommender/` + `recommender-wizard.tsx` |

**Regla de alcance:** si una funcionalidad no encaja en A, B, C o D, no se
implementa. El brief original es explícito sobre esto y la tentación de crecer es
el riesgo principal del proyecto.

**Módulo E — Índice de laboratorios y proveedores** (ADR 022): es un módulo de
**navegación**, no de datos. Responde a dos preguntas — ¿qué modelos da cada
laboratorio? ¿qué ofrece cada proveedor? — y **no expone precios propios**.
Vive en `src/app/laboratorios/page.tsx`. Se acepta porque el catálogo ya tenía
las entidades `Laboratory` y `Provider` (`PROVIDERS` estaba exportado y nunca
importado: datos muertos).

**La app es un COMPARADOR** (ADR 023): el recomendador es la puerta de entrada,
porque es lo que responde «qué es lo que más me conviene» cuando el usuario
todavía no sabe qué modelo quiere. El catálogo queda como exploración del
detalle.

## 3. Principios de diseño

### 3.1 La escala 1–10 es un instrumento, no un hecho absoluto

Este es el principio más importante y el más fácil de romper.

**El problema.** Un score anclado a un techo absoluto por benchmark (ej. «SWE-bench
máximo = 80 %») obliga a recalibrarlo cada vez que sale un modelo mejor. Eso hace
que **todos los demás modelos bajen de nota aunque no hayan cambiado**, y
invalida cualquier histórico o comparación guardada.

**La solución.** La escala 1..10 es un **instrumento fijo**
(`PERCENTILE_TO_SCORE`) y la **cohorte vigente de modelos** es el objeto medido.

```
percentil = posición del modelo dentro de la cohorte de ese benchmark
score     = curva_fija(percentil)         → 1..10
            acotado por techo de capacidad → un outlier no se lleva el 10
            contraído por confianza        → cohort pequeñas → hacia la mediana
```

**Consecuencias que no se negocian:**

- El «10» **siempre existe** y lo ocupa el líder actual. No hay que saber de
  antemano cuál es el mejor absoluto: se traspasa solo cuando sale un modelo mejor.
- Las puntuaciones de un modelo son **estables** mientras la cohorte no cambie.
- La curva **nunca se recalibra por la salida de un modelo**. Solo se modifica si
  cambia la *interpretación* de la escala (p. ej. pasar a 0..100), lo cual es un
  cambio de producto explícito y versionado.
- `cohortConfidence(n)` contrae hacia la mediana (5.0) cuando hay pocos datos: en
  una cohorte de 3 modelos, el percentil es ruido.

### 3.2 Peso abierto ≠ código abierto

La prensa mezcla estas tres situaciones. El modelo las distingue porque cambian
las consecuencias legales y comerciales.

| `weightType` | Significado | Uso comercial |
|---|---|---|
| `PROPRIETARY` | No hay pesos; solo API o suscripción | Según contrato del proveedor |
| `OPEN_WEIGHTS_RESTRICTED` | Pesos descargables, licencia con condiciones (ej. Llama 4 Community) | **Revisar la licencia** antes de uso comercial |
| `OPEN_WEIGHTS_PERMISSIVE` | Licencia OSI (MIT, Apache-2.0) | **Sí, sin condiciones** |

`isOsiLicense` marca el caso permisivo. La UI lo hace visible por color: verde
OSI, ámbar restringido. La distinción se captura **una sola vez**, en el modelo de
dominio, y se propaga a la UI, a la tabla técnica y al recomendador.

### 3.3 «Gratis» local no significa gratis

La ejecución local tiene **coste marginal por token cero** y **hardware que se
paga**. Presentar «local» como una opción gratis sin más es engañoso.

Por eso cada modelo autoalojable publica sus requisitos reales (`LocalRequirements`):
VRAM mínima y recomendada, descarga en Q4, parámetros totales y activos, motores
compatibles, comando de ejemplo y un **coste estimado del hardware mensual**.

Corolario importante: para MoE, la VRAM la exigen los **parámetros totales**, no
los activos. Llama 4 Scout declara «17B activos» pero necesita ~65 GB de VRAM en
Q4 porque todos los expertos deben estar residentes. La UI dice los totales.

### 3.4 El overflow no encarece, degrada

En la calculadora, un mensaje que se pasa de la cuota **no cuesta dinero al
usuario**: cae en un modelo fallback (más barato, peor). Por eso penaliza el
razonamiento y el precio de forma distinta:

- Si la suscripción es más barata pero **no cubre** el uso → gana igualmente,
  pero el motivo explica cuántos mensajes degradan.
- Si no cubre **y** el API es más barato → doble victoria del pago por uso.

### 3.5 Los filtros duros se multiplican, no se suman

En el recomendador, presupuesto y privacidad son factores **multiplicativos**.
Un filtro duro fuera de rango (precio) debe reducir drásticamente al candidato en
lugar de competir con la calidad en una suma ponderada. Si un factor llega a
cero, el candidato desaparece — que es la semántica correcta de «no cumple».

### 3.6 Dualidad de interfaz: Práctico ↔ Técnico

El mismo dato se presenta de dos maneras según el usuario:

- **Modo Práctico** — B2C/prosumer. Lenguaje llano, tarjetas, sin jerga.
  «Gratis con tu_subscription», no «precio por 1M tokens».
- **Modo Técnico** — desarrollador. Tabla densa, ordenable, con percentiles,
  TTFT, tok/s, ventanas de contexto.

El modo es **global y persistente** (sobrevive a la navegación) y se aplica con
un atributo `data-mode` en `<html>`, de modo que el CSS puede reaccionar sin
depender del cliente.

### 3.7 Todo dato tiene fuente

Cada entrada del seed lleva `source` (en benchmarks) o `lastVerifiedDate` (en
precios y suscripciones). Los datos de referencia se etiquetan como tales en la
interfaz. No se presentan cifras sin procedencia.

### 3.8 Los tokens nunca son una capacidad legible (ADR 017)

El token aparece en el producto con **tres** significados distintos, y cada uno
obliga a una regla:

| Contexto | Unidad | Regla |
|---|---|---|
| Cálculo interno | tokens | Se esconden. Son la maquinaria. |
| **Precio** | tokens | Se muestran, **siempre con la unidad explícita**: «$8 por cada millón de tokens que le envías · $40 por cada millón que te devuelve». |
| **Capacidad** | equivalentes del mundo del usuario | **Nunca tokens.** «Cabe un proyecto entero», «~20.000 líneas de código», «230 sesiones al día». |

El error que motivó la decisión: la capacidad se traducía a «páginas» (un
equivalente de **lectura**) mientras el precio se dejaba en tokens crudos. El
usuario veía «Capacidad: ~2.100 páginas» junto a «$8 / $40 por 1M tokens» sin
saber qué era cada cosa. Y un programador no puede dimensionar su repositorio
en páginas.

**Consecuencia:** si un token aparece en la interfaz como capacidad, es un bug.

### 3.9 La sesión es la unidad de trabajo; cuota y ventana son ortogonales (ADR 018)

**Sesión** = un bloque de intercambios sobre un tema, en una conversación.

Las dos restricciones que frenan al usuario son **ortogonales**:

| Restricción | La impone | Se agota cuando |
|---|---|---|
| **Interacciones** | el plan (cuota) | haces demasiados mensajes |
| **Tokens acumulados** | el modelo (ventana) | el tema se alarga demasiado |

Por eso el producto tiene que responder **«¿qué te va a frenar?»** y no solo
«¿cuál es más barato?». Y con un matiz que la app debe respetar: **que el
material no quepa en *una* conversación no significa que no puedas terminar el
trabajo**. Se reparte en más sesiones, que consume cuota pero no es un bloqueo.

De aquí sale el veredicto `binding` (`quota` / `context` / `none`).

### 3.10 La ventana de contexto es un presupuesto único (ADR 019)

`contextWindow` y `maxOutputTokens` **no se suman**. La ventana es un
presupuesto que la entrada y la salida comparten:

```
contextWindow  = 1.050.000   ← presupuesto total
maxOutputTokens = 128.000    ← techo de la respuesta DENTRO del presupuesto
→ puedes enviar ~922.000 y recibir hasta 128.000
```

La ficha lo presenta con el **titular** (qué cabe: «Cabe un proyecto entero») y
el **detalle** (el reparto del presupuesto).

### 3.11 La cuota tiene nivel explícito (ADR 020)

No hay ningún plan de $100/mes que sea realmente ilimitado, y si hay fallback
**hay un límite por definición**. El dominio usa `QuotaLevel`
(`UNLIMITED` | `VERY_HIGH` | `HIGH` | `MEDIUM` | `LIMITED` | `UNKNOWN`), no un
`null` que significa "ilimitado".

Consecuencia operativa: cuando el nivel **no es numérico**, la capacidad
mensual **no es calculable** y la UI lo dice. Devolver un infinito haría creer
que el plan nunca se agota, y el error más caro es ese.

### 3.12 Un solo eje de perfiles de trabajo (ADR 021)

El consumo se declara con **un** perfil, no con dos multiplicadores que se
contradicen:

| Perfil | Referencia visible | Tokens (in / out) |
|---|---|---|
| Pregunta rápida | «¿Cómo centro un div?» — una duda de 3 líneas | 400 / 300 |
| Revisión de código | un PR de ~500 líneas | 4.000 / 1.500 |
| Repo o documento | el proyecto entero — decenas de miles de líneas | 80.000 / 8.000 |

La **referencia** no es decoración: sin ella las cifras no significan nada para
quien no sabe qué es un token. Y el eje «caso de uso» desapareció como
multiplicador porque no era ortogonal con el de tamaño.

## 4. Modelo de dominio (resumen)

Source of truth: `src/lib/domain/types.ts`.

```
Laboratory ──┐
             ├── Model ──┬── ModelBenchmarkResult[]  (scores crudos + source)
             │           ├── AccessChannel[]           (vías de acceso)
             │           ├── ProviderOffer[]           (ofertas de terceros)
             │           └── LocalRequirements?        (autoalojamiento)
Provider ────┘
```

Entidades clave:

- **`Laboratory`** — quien entrena y publica. `isHostingProvider` distingue un
  laboratorio que aloja en su nube de un agregador que enruta peticiones.
- **`Model`** — la versión concreta. `weightType`, `license`, `isOsiLicense`,
  `lifecycle`, `contextWindow`, `useCases`, `isFeatured`.
- **`ModelLifecycle`** — `PREVIEW | GA | DEPRECATED | LEGACY`, con `deprecatedAt`
  y `routedTo`. (Se llama así y no `ModelStatus` para no colisionar con la
  unión de estados de byte de un modelo.)
- **`AccessChannel`** — la unidad de comparación real. `kind` ∈
  `OFFICIAL_SUBSCRIPTION | FIRST_PARTY_API | THIRD_PARTY_API | LOCAL_SELF_HOSTED`.
  Contiene tanto precios por 1M como los campos de suscripción (precio mensual,
  `quotaLevel`, cuota por ventana, horas de reset, fallback,
  `trainsOnUserDataByDefault`).
- **`Provider`** — agregador / inferencia / cloud / first-party.
- **`LocalRequirements`** — VRAM, descarga Q4, parámetros, runtimes, comando.
- **`SkillProfile`** — seis dimensiones (code, reasoning, writing, languages,
  data-analysis, long-context) normalizadas 0..10.
- **`QuotaLevel`** — `UNLIMITED | VERY_HIGH | HIGH | MEDIUM | LIMITED | UNKNOWN`.
- **`WorkProfile`** — perfil de trabajo: `reference` + tokens in/out.
- **`WorkMode`** — `PASTE | CONNECTED | ALL_AT_ONCE`: cómo consume el material.

### Vías de acceso

| `kind` | Qué es | Qué tiene de especial |
|---|---|---|
| `OFFICIAL_SUBSCRIPTION` | Plan B2C de tarifa plana (ChatGPT Plus, Claude Pro…) | `quotaLevel`, cuota por ventana, fallback, entrenamiento con datos |
| `FIRST_PARTY_API` | Pago por uso directo al laboratorio | Precio por 1M input/output/cache |
| `THIRD_PARTY_API` | Agregador o proveedor de inferencia | Precio + throughput + TTFT |
| `LOCAL_SELF_HOSTED` | En tu propia infraestructura | Coste marginal 0, hardware real |

## 5. Fórmulas de negocio

### 5.1 Normalización por cohorte

`src/lib/scoring/cohort.ts`

1. **Percentil** dentro de la cohorte del benchmark, con *mid-rank* para empates
   (dos modelos empatados reciben ambos el percentil medio del rango).
2. **Mapa** percentil → score con la curva fija `PERCENTILE_TO_SCORE`.
3. **Techo** de capacidad curado (`BENCHMARK_CEILINGS`): si el mejor del cohorte
   solo llega al 55 % en un benchmark, no debería recibir un 10 (= «el mejor
   disponible»). El techo es curado, no derivado del cohorte → tampoco envejece.
4. **Contracción** por confianza (`cohortConfidence(n)`): `n ≥ 30 → 1.0`,
   `n ≤ 2 → 0.55`, intermedio logarítmico.

Caso degenerado: con `n = 1` no hay posición relativa, así que el único modelo
recibe 5.0 neutro.

### 5.2 Coste API

`src/lib/pricing/cost.ts`

```
coste_interacción = (input_billable / 1e6) * precio_input
                  + (input_cached  / 1e6) * precio_cached
                  + (output        / 1e6) * precio_output
```

**Regla importante:** si el proveedor no ofrece precio de caché, los tokens
cacheados se cobran a **precio normal de input**, no gratis. Es el
comportamiento por defecto de la mayoría de proveedores sin prompt caching, y
fue un bug real detectado por los tests.

### 5.3 Capacidad de suscripción

`src/lib/calculator/subscription-vs-usage.ts`

```
resets_por_mes    = (días_laborables * 24) / reset_window_hours
capacidad_mensual = estimated_message_cap * resets_por_mes
overflow           = max(0, mensajes_usuario - capacidad_mensual)
```

Veredicto:

```
si suscripción_cubre_y_más_barata  → winner = subscription
si no_cubre_y_API_más_barata       → winner = usage (doble victoria)
si empate                          → winner = tie
```

**Guarda de ADR 020:** la capacidad mensual solo se calcula si el `quotaLevel`
es numérico (`LIMITED`/`MEDIUM`/`HIGH`/`VERY_HIGH`). Si el nivel es
`VERY_HIGH`, `UNLIMITED` o `UNKNOWN`, la capacidad es `null` y la UI declara
el nivel en vez de inventar un infinito.

### 5.4 Sesiones y encaje con la ventana

`src/lib/domain/equivalents.ts`

```
tokens_por_sesión   = input_tokens + turnos × output_tokens
sesiones_por_conv.  = floor(context_window / tokens_por_sesión)
```

El contexto **acumula** dentro de una sesión: la entrada se paga una vez y lo
que se reenvía va cacheado. Por eso no es `turnos × (input + output)`.

Veredicto de encaje (`assessFit`):

| Estado | Cuándo | Significado |
|---|---|---|
| `FITS` | el material cabe con holgura | — |
| `TIGHT` | solo cabe una sesión | Vas justo |
| `SPLIT_REQUIRED` | no cabe de una sentada, pero se puede repartir | **Informativo**: más sesiones, más cuota |
| `DOES_NOT_FIT` | no cabe ni por partes | **Bloqueante**: necesitas otra ventana |

### 5.5 Qué restricción frena al usuario

`resolveBindingConstraint()` en `subscription-vs-usage.ts`:

```
si el material no cabe ni por partes        → binding = context (bloqueante)
si la cuota se agota con el uso declarado    → binding = quota
si el material no cabe de una sentada        → binding = context (informativo)
en otro caso                                 → binding = none
```

### 5.6 Recomendador

`src/lib/recommender/wizard.ts`

```
score = calidad_para_la_necesidad(0..10)
      * 3.0                                  // peso de la necesidad
      * factor_presupuesto(0.15 .. 1.0)      // multiplicativo
      * factor_privacidad(0.55 .. 1.15)      // multiplicativo
      * 1.05                                 // bonus canal suscripción
      * 1.10                                 // bonus canal local
```

El coste mensual estimado de la vía API usa el **perfil de trabajo** declarado,
no una constante.

## 6. Convenciones del código

### 6.1 Reglas duras

- **TypeScript estricto.** Nada de `any`. Los tipos del dominio son explícitos.
- **La lógica de negocio vive en `src/lib/`, no en los componentes.** Los
  componentes renderizan; no calculan. La calculadora y el recomendador son
  funciones puras y testeables.
- **Los tests van junto a las fórmulas críticas.** `src/__tests__/` cubre
  normalización, costes y veredicto de la calculadora. Si tocas una fórmula,
  tocas su test en el mismo commit.
- **Idioma: español en la UI y en los comentarios del código.** Los identificadores
  del dominio están en inglés por convención con el ecosistema, pero el código
  se lee en español.
- **Comentarios que explican el *por qué*, no el *qué*.** El código ya dice qué
  hace. Si un comentario no evita un error futuro, sobra.

### 6.2 Next.js 16 + React 19 (trampas conocidas)

Este proyecto usa APIs que **no coinciden** con la documentación anterior de
Next.js. Antes de escribir código, lee la guía relevante en
`node_modules/next/dist/docs/`.

- **Cache Components** está activo (`cacheComponents: true`) y **Partial
  Prefetching** también. Las rutas que leen `params` deben declarar
  `export const instant = false` o envolver el acceso en `<Suspense>`. En este
  proyecto se usa `instant = false` en las fichas de modelo: el contenido es una
  ficha completa y un esqueleto no aporta nada.
- **`react-hooks/set-state-in-effect` está activo.** Prohibido hacer `setState`
  dentro de un `useEffect`. Para estado persistido se usa `useSyncExternalStore`
  (así está implementado el modo global y el tema).
- **shadcn/ui aquí es Base UI, no Radix.** `render={<Link />}` en lugar de
  `asChild`; `nativeButton={false}` cuando el elemento no es un `<button>`.
  El `Slider` toma `value` numérico y su `onValueChange(value, eventDetails)`.
  El `Select` devuelve `string | null` en `onValueChange`.
- **Los tipos de props de página son globales** (`PageProps<"/modelos/[slug]">`,
  `LayoutProps<"/">`) y los genera `npx next typegen`. No los declares a mano.

### 6.3 Convenciones de git

- **Commits en español**, con mensajes que explican el *por qué*.
- **Commits atómicos y bisectables**: cada commit compila y pasa los tests por
  separado.
- Trailer de referencia: `Refs: #1` (o el issue que corresponda).
- Se commitea también el bloque `<!-- BEGIN:nextjs-agent-rules -->` que
  regenera `next dev`, para que el árbol quede limpio.

### 6.4 Comandos

```bash
npm run dev        # servidor de desarrollo en :3000
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test       # vitest run
npm run verify     # typecheck + lint + test + build  ← antes de commitear
```

En PowerShell usa `npm.cmd` (ExecutionPolicy bloquea `npm.ps1`).

## 7. Workflow para quien trabaje en esto

1. **Lee este documento y `docs/DECISIONS.md`** antes de tocar nada. Si vas a
   cambiar una decisión de diseño, documéntala ahí (§8).
2. **Localiza la capa correcta**: el cambio va a `src/lib/` si es lógica,
   a `src/data/` si es contenido, a `src/components/` si es presentación.
3. **Escribe o ajusta el test** si la fórmula cambió.
4. **Verifica**: `npm run verify` en verde.
5. **Commitea** en etapas lógicas, no un commit gigante.
6. **Actualiza la documentación** si cambiaste el modelo de dominio, una
   fórmula o el catálogo.

### Reglas de datos

- **Los precios se verifican contra la página oficial del proveedor**, no contra
  blogs ni agregadores (OpenRouter sirve como fuente de *precios de terceros*,
  pero no de precios first-party).
- **Toda cifra nueva lleva `source` o `lastVerifiedDate`.**
- **Los precios tienen fecha de caducidad.** `lastVerifiedDate` existe para
  poder avisar en la UI cuando un precio supere los 90 días sin verificar.
- **DeepSeek tiene precios valle/pico** (pico = 2× valle, franjas 01:00–04:00 y
  06:00–10:00 UTC). El seed documenta el precio de valle.
- **Meta retiró su API el 2026-07-06.** Para Llama, el autoalojamiento es la vía
  oficial.
- **Gemini 4 Carbon/Argon suben de $2/$10 a $4/$20 el 2026-12-01.**
- **xAI entrena con los chats del usuario por defecto** (a diferencia de
  OpenAI, Anthropic y Google). Esto alimenta el semáforo de privacidad.

## 8. Contrato de cambios en el diseño

Si un cambio altera el **modelo de dominio**, una **fórmula de negocio** o el
**alcance de los módulos**, hay que:

1. Registrar la decisión en `docs/DECISIONS.md` con: contexto → decisión →
   consecuencias → alternativas descartadas.
2. Actualizar este documento si afecta a la sección 3 (principios), 4 (dominio)
   o 5 (fórmulas).
3. Actualizar `docs/ARCHITECTURE.md` si cambia la estructura de ficheros.
4. Si el cambio invalida datos existentes, actualizar el seed y su `source`.

## 9. Deuda técnica conocida

Nada de esto está bloqueando el MVP, pero está registrado para que no se pierda:

1. **Prices manual** — el seed se mantiene a mano. El objetivo es un pipeline de
   sincronización con OpenRouter (`/api/v1/models`) + cron diario. El esquema
   Prisma ya tiene `PriceSnapshot` y `SyncRun` listos.
2. **Sin persistencia real** — el MVP corre sobre el seed en TypeScript.
   `prisma/schema.prisma` documenta el modelo relacional objetivo; el contrato
   público de `EnrichedModel` no cambia al migrar.
3. **Radar de barras en vez de Recharts** — el gráfico real está pendiente.
4. **Sin comparación lado a lado** (hasta 3 modelos) con persistencia.
5. **Sin panel de administración** para las condiciones de suscripción.
6. **Aviso de precio caducado** — `lastVerifiedDate` existe, la UI aún no lo
   muestra.
7. **Entidad «plan» pendiente** — una suscripción es del *laboratorio*, no del
   modelo: ChatGPT Plus da acceso a Astra, Sol y compañía. Hoy el precio vive
   duplicado en el `AccessChannel` de cada modelo, así que comparar dos planes
   de laboratorios distintos requiere comparar por par modelo+canal. El
   modelo de dominio objetivo tiene una entidad `Plan` (ADR 023).
8. **Números de cuota pendientes de verificar** — el seed publica el *nivel*
   de cuota (ADR 020) porque los proveedores no siempre dan el número exacto.
   Cuando lo publiquen, basta rellenar `estimatedMessageCap` y la capacidad
   mensual se vuelve calculable sin tocar código.
