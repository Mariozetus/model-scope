# ModelScope — Comparador de Modelos de IA

MVP de una plataforma que conecta el **rendimiento técnico** de los modelos de IA
(benchmarks, velocidad, ventana de contexto) con la **realidad de consumo** del
usuario final (límites de suscripción, costes reales por uso, privacidad y vías
de acceso).

> **Estado:** MVP funcional. Los precios están verificados contra las páginas
> oficiales de cada proveedor (fecha: 2026-11-22) y cada entrada lleva su
> `source`. Los benchmarks proceden de las model cards y de Artificial Analysis.

## Documentación

| Documento | Para qué |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **Documento principal de diseño.** Principios, modelo de dominio, fórmulas, convenciones de código y workflow. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Cómo está construido: capas, estructura de ficheros, flujo de datos, extensiones. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decisiones de diseño (ADR) con contexto, consecuencias y alternativas descartadas. |
| Este README | Instalación, comandos y descripción del catálogo actual. |

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16.4 (App Router) + React 19.3 + TypeScript |
| Estilos | Tailwind CSS v4 + shadcn/ui (Base UI) |
| Estado | Context + `useSyncExternalStore` (sin librería externa) |
| Datos | Seed en TypeScript → migrable a Prisma + PostgreSQL |
| Tests | Vitest (60 tests sobre las fórmulas de negocio) |

## Arrancar

```bash
npm install
npm run dev        # http://localhost:3000
npm run verify     # typecheck + lint + tests + build
```

No requiere base de datos ni claves de API.

## Estructura

```
prisma/
  schema.prisma              Esquema relacional objetivo (Postgres) — no activo aún

src/
  app/
    layout.tsx               Shell, providers, metadata
    page.tsx                 Home: Hero + Recomendador + Calculadora + Catálogo
    modelos/[slug]/page.tsx  Módulo B — ficha del modelo
    laboratorios/page.tsx    Módulo E — índice de laboratorios y proveedores

  components/
    providers/
      mode-provider.tsx      Toggle global Práctico ↔ Técnico (persistido)
    mode-toggle.tsx          Interruptor visible en la cabecera
    theme-toggle.tsx         Claro / oscuro
    site-header.tsx          Navegación
    site-footer.tsx          Aviso de "datos de referencia"
    hero.tsx                 Portada
    catalog.tsx              Módulo A — filtros por intención + tarjetas/tabla
    model-card.tsx           Tarjeta (Modo Práctico)
    technical-table.tsx      Tabla densa ordenable (Modo Técnico)
    model-detail.tsx         Módulo B — capacidad, radar, ficha, vías de acceso
    subscription-calculator.tsx  Módulo C — la calculadora
    recommender-wizard.tsx   Módulo D — wizard de 4 pasos
    score-bar.tsx            Barra de puntuación 0..10
    privacy-badge.tsx        Semáforo de privacidad + badges de pesos/licencia

  lib/
    domain/
      types.ts               Tipos del dominio (glosario)
      constants.ts           Equivalentes humanos + perfiles de trabajo
      benchmarks.ts          Metadatos de benchmarks
      equivalents.ts         Traductor de capacidad (tokens → páginas / líneas /
                             sesiones / presupuesto)
    scoring/
      anchors.ts             Curva percentil→score, techos, confianza
      cohort.ts              Normalización por cohorte (el motor del 1-10)
      skills.ts              Composición por habilidad + índice agregado
      speed.ts               Clasificación de velocidad cualitativa
      normalize.ts           Utilidades numéricas
    pricing/cost.ts          Coste de tokens → USD
    calculator/
      subscription-vs-usage.ts  Fórmula de la calculadora + veredicto de restricción
      quota.ts               Análisis de cuota → experiencia real (por nivel)
    recommender/wizard.ts    Puntuación multicriterio del wizard
    format.ts                Formateadores

  data/
    seed.ts                  19 modelos, 8 laboratorios, 5 proveedores
    models.ts                Capa de acceso a datos (normaliza y expone)

  __tests__/                 Tests de las fórmulas de negocio

docs/
  ARCHITECTURE.md            Cómo está construido (capas, flujo de datos)
  DECISIONS.md               Decisiones de diseño (ADR) con alternativas
```

`AGENTS.md` en la raíz es el **contrato de diseño** del proyecto: quien toque el
código debe leerlo antes.

## Conceptos de dominio

### Peso abierto ≠ código abierto

La prensa mezcla estas tres situaciones. El modelo las distingue porque
cambian las consecuencias legales y comerciales:

| `weightType` | Significado | Uso comercial |
|---|---|---|
| `PROPRIETARY` | No hay pesos; solo API o suscripción | Según el contrato del proveedor |
| `OPEN_WEIGHTS_RESTRICTED` | Pesos descargables, licencia con condiciones (ej. Llama 4 Community) | **Revisar la licencia** antes de uso comercial |
| `OPEN_WEIGHTS_PERMISSIVE` | Licencia OSI (MIT, Apache-2.0) | **Sí, sin condiciones** |

`isOsiLicense` marca el segundo caso. La UI lo hace visible con color: verde
para OSI, ámbar para licencia restringida.

### Vías de acceso

`AccessChannelKind` define las cuatro:

- `OFFICIAL_SUBSCRIPTION` — plan B2C de tarifa plana (ChatGPT Plus, Claude Pro…).
- `FIRST_PARTY_API` — pago por uso directo al laboratorio.
- `THIRD_PARTY_API` — agregador o proveedor de inferencia (OpenRouter, Groq…).
- `LOCAL_SELF_HOSTED` — ejecución en tu propia infraestructura.

La opción local tiene una sutileza que la UI explicita: el **coste marginal por
token es cero**, pero **el hardware cuesta**. Por eso cada modelo autoalojable
publica sus requisitos reales (VRAM mínima y recomendada, descarga en Q4,
parámetros totales y activos, motores compatibles) y un coste estimado del
hardware mensual. Un "gratis" que no dice nada del hardware es engañoso.

### Decisión de diseño clave: el score 1..10

**Problema:** un score anclado a un techo absoluto obliga a recalibrarlo cada vez
que sale un modelo mejor, haciendo que todos los demás bajen aunque no hayan
cambiado.

**Solución:** la escala 1..10 es un **instrumento fijo** (`PERCENTILE_TO_SCORE`)
y la **cohorte vigente de modelos** es el objeto medido.

```
percentil = posición del modelo dentro de la cohorte de ese benchmark
score     = curva_fija(percentil)          → 1..10
            acotado por techo de capacidad  → evita que un outlier se lleve el 10
            contraído por confianza         → cohorts pequeñas → hacia la mediana
```

Consecuencias:

- El «10» siempre existe y lo ocupa el líder actual. No hay que saber cuál es
  el 10 absoluto: se traspasa solo cuando sale un modelo mejor.
- Las puntuaciones de un modelo son estables mientras la cohorte no cambie.
- La curva (`src/lib/scoring/anchors.ts`) es un instrumento auditable: solo se
  modifica si cambia la interpretación de la escala, no por la salida de un modelo.
- `cohortConfidence(n)` contrae hacia la mediana cuando hay pocos datos.

## Fórmulas de negocio

### Coste API

```
coste_interacción = (input_billable / 1e6) * precio_input
                  + (input_cached    / 1e6) * precio_cached
                  + (output          / 1e6) * precio_output
```

Si el provider no ofrece precio de caché, los tokens cacheados se cobran a
**precio normal de input** (no gratis). Es el comportamiento por defecto.

### Capacidad de suscripción (de cuota por ventana a cuota mensual)

```
resets_por_mes    = reset_window_hours ? (días_laborables * 24) / reset_window_hours
                                     : resetsPerMonth(quota_reset_period)
capacidad_mensual = estimated_message_cap * resets_por_mes
overflow           = max(0, mensajes_usuario - capacidad_mensual)
```

La capacidad mensual **solo es calculable** si el plan:

1. mide la cuota con un **tope por ventana** (`quotaKind: "WINDOWED"`),
2. declara un **nivel numérico** (`quotaLevel` `LIMITED`/`MEDIUM`/`HIGH`/`VERY_HIGH`),
3. **publica el número** de mensajes (`estimatedMessageCap`).

Los planes cuyo nivel no es numérico («Límite muy alto») declaran el nivel en
vez de inventar un infinito. Y los que miden la cuota de otra forma
—multiplicadores («5x Pro usage»), tiers de herramientas («Expanded
messages») o saldos compartidos (xAI)— **tampoco** son convertibles a
mensajes: 5 veces un saldo que no conocemos no son 5 veces más mensajes.

Verificado contra las páginas oficiales de precios (Anthropic, OpenAI, Google
y xAI): **ningún proveedor publica un número de mensajes por ventana**, así
que en la práctica la capacidad mensual no es calculable y la app lo dice.
`resetsPerMonth()` traduce la periodicidad declarada a reinicios:
`HOURLY`=720, `DAILY`=30, `WEEKLY`=30/7, `MONTHLY`=1, `UNKNOWN`=`null`.

### Sesiones y encaje con la ventana

```
tokens_por_sesión  = input_tokens + turnos × output_tokens
sesiones_por_conv. = floor(context_window / tokens_por_sesión)
```

El contexto **acumula** dentro de una sesión (la entrada se paga una vez; lo
que se reenvía va cacheado). El encaje tiene cuatro estados:

| Estado | Significado |
|---|---|
| `FITS` | el material cabe con holgura |
| `TIGHT` | solo cabe una sesión |
| `SPLIT_REQUIRED` | no cabe de una sentada, pero se puede repartir — **informativo** |
| `DOES_NOT_FIT` | no cabe ni por partes — **bloqueante** |

### Veredicto de la calculadora

La suscripción gana si **cubre el uso sin degradar** **y** cuesta menos. El
overflow no encarece la suscripción pero degrada la calidad, así que penaliza
el razonamiento, no el precio.

```
si suscripción_cubre_y_más_barata   → winner = subscription
si no_cubre_y_API_más_barata        → winner = usage (doble victoria)
si empate                           → winner = tie
```

Y además, el veredicto de **qué te va a frenar**:

```
si el material no cabe ni por partes      → binding = context (bloqueante)
si la cuota se agota con el uso declarado  → binding = quota
si no cabe de una sentada                  → binding = context (informativo)
en otro caso                               → binding = none
```

### Recomendador (Módulo D)

Puntuación **multiplicativa**: los filtros duros (precio, privacidad) reducen
drásticamente al candidato en lugar de competir con la calidad en una suma.

```
score = calidad_para_la_necesidad(0..10)
      * 3.0                                  // peso de la necesidad
      * factor_presupuesto(0.15 .. 1.0)      // multiplicativo
      * factor_privacidad(0.55 .. 1.15)      // multiplicativo
      * 1.05                                 // bonus canal suscripción
      * 1.10                                 // bonus canal local
```

## Catálogo actual

19 modelos de 8 laboratorios, con precios verificados el 2026-11-22:

| Laboratorio | Modelos | Contexto | Desde |
|---|---|---|---|
| Anthropic | Opus 5.5, Sonnet 5.5, Haiku 5.5 | 1M | $0.10/1M in |
| OpenAI | GPT-6.2 Astra, GPT-6.2 Sol, GPT-5.4 mini | 1.05M / 400k | $0.75/1M in |
| Google | Gemini 4 Carbon, Gemini 4 Hydrogen, 3.8 Flash | 1M | $0.75/1M in |
| DeepSeek | V4 Pro, V4.1 Flash | 1M | $0.15/1M in |
| Qwen | 3.6 35B-A3B, 3.6 14B | 262k | Apache-2.0, autoalojable |
| Meta | Llama 4 Scout, Maverick | 10M / 1M | Licencia Meta (con condiciones) |
| Mistral | Large 4, Small 4 | 1M | $0.15/1M in |
| xAI | Grok 4.7, Grok 4.3 | 500k / 1M | $1.25/1M in |

Notas que la UI refleja:
- **Meta retiró su API** el 2026-07-06 → el autoalojamiento es la vía oficial
  para Llama.
- **DeepSeek** tiene precios valle/pico (pico = 2× valle). Se documenta el valle.
- **Gemini 4 Carbon y Argon** suben de $2/$10 a $4/$20 el 2026-12-01.

## Estrategia de datos

| Fuente | Qué trae | Estado |
|---|---|---|
| Páginas oficiales de precios | Precios por 1M, contexto, cuotas | **Hecho** — verificado y fechado |
| OpenRouter `/api/v1/models` | Catálogo, contexto, precios | Pendiente — interfaz preparada |
| Artificial Analysis / model cards | Scores por benchmark | **Hecho** — datos de referencia |
| Curación manual (JSON/MD → DB) | Suscripciones: precio, cuota, ventana de reset, fallback, `trainsOnUserData`, tools | En seed (`src/data/seed.ts`) |

El esquema Prisma ya soporta múltiples proveedores por modelo (`ModelProvider`
como pivote N:M), snapshots de precios (`PriceSnapshot`), trazas de sincronización
(`SyncRun`) y perfiles de ejecución local (`LocalProfile`).

## Módulos

- **D — Recomendador** (entrada): wizard de 4 pasos (necesidad · material ·
  presupuesto · privacidad) → Top 3 combinaciones modelo + vía. Es la puerta
  de entrada: responde «qué es lo que más me conviene» cuando el usuario aún no
  sabe qué modelo quiere.
- **C — Calculadora**: perfil de trabajo + frecuencia + días laborables.
  Compara suscripción vs API, muestra ahorro, overflow de cuota, las sesiones
  que caben por conversación y **qué restricción te va a frenar** (la cuota o
  la ventana de contexto).
- **A — Catálogo**: 11 destacados por defecto, expandible a 19. Filtros por
  intención (Programar / Escribir / Analizar PDFs / Razonar / Barato / Local).
  Alterna entre tarjetas (Práctico) y tabla densa ordenable (Técnico).
- **B — Ficha del modelo**: «cuánto cabe en una conversación» (presupuesto
  repartido entre entrada y respuesta), radar de habilidades con percentiles,
  ficha técnica, tabla «¿Dónde y cómo usarlo?» (gratis / suscripción / API /
  agregadores / **local**) y comparativa multi-proveedor con los mejores en
  precio, velocidad y latencia.
- **E — Laboratorios y proveedores**: índice de navegación. Qué modelos da
  cada laboratorio y qué ofrece cada proveedor. Sin precios propios.

### Cómo se habla de la capacidad

Los tokens son la unidad interna del cálculo y la unidad de medida del **precio**
—siempre con la unidad explícita: «$8 por cada millón de tokens que le envías ·
$40 por cada millón que te devuelve». Pero **nunca son una capacidad legible**:

- La **capacidad** se expresa en el mundo del usuario: «Cabe un proyecto
  entero», «~210.000 líneas de código», «~30 sesiones por conversación».
- La **cuota** se expresa con su nivel real («Límite muy alto») en lugar de
  inventar un «sin límite» que ningún plan de $100/mes cumple, **y con la
  forma en que la mide el proveedor**: «múltiplo sobre un plan base», «niveles
  de acceso por herramienta», «saldo de uso compartido». Dos planes con el
  mismo nivel medidos de forma distinta no son magnitudes comparables, y la
  ficha lo dice. El texto literal del proveedor se cita entrecomillado: es la
  única fuente de verdad sobre sus límites.
- El usuario declara **trabajo** (qué hace y con cuánto material), no tokens.

## Accesibilidad

- Modo Práctico ↔ Técnico con `role="radiogroup"` y `aria-checked`.
- Barras con `role="meter"` y valores `aria-valuenow/min/max`.
- Respeta `prefers-reduced-motion`.
- Contraste verificado en modo claro y oscuro.

## Próximos pasos

1. Conectar la API de OpenRouter (`/api/v1/models`) con un cron diario para
   eliminar el mantenimiento manual de precios.
2. Sustituir el seed por el repositorio Prisma (el contrato de `EnrichedModel`
   no cambia).
3. Sustituir el radar de barras por un gráfico Recharts real.
4. Implementar la comparación lado a lado (hasta 3 modelos) con persistencia.
5. Panel de administración para las condiciones de suscripción.
6. Aviso en la UI cuando un precio supere los 90 días sin verificar
   (`lastVerifiedDate` ya está en el modelo).
