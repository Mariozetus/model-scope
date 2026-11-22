# Decisiones de diseño — ModelScope

> Registro de decisiones de arquitectura (ADR). Cada entrada explica el
> **contexto**, la **decisión**, las **consecuencias** y las **alternativas
> descartadas**.
>
> Para el estado actual del código, ver [`../AGENTS.md`](../AGENTS.md) y
> [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Formato de cada entrada:** contexto → decisión → consecuencias → alternativas
descartadas. Cuando cambies una decisión, **añade una entrada nueva** que la
revoque; no edites la anterior en silencio. El histórico es el valor.

---

## Índice

| # | Decisión | Estado |
|---|---|---|
| [001](#001) | Score por percentil de cohorte, no por anclas absolutas | Aceptada |
| [002](#002) | Seed en TypeScript en lugar de base de datos activa | Aceptada |
| [003](#003) | Tres categorías de pesos, no dos | Aceptada |
| [004](#004) | La ejecución local nunca se presenta como «gratis» | Aceptada |
| [005](#005) | Doble modo Práctico/Técnico global y persistente | Aceptada |
| [006](#006) | Puntuación multiplicativa en el recomendador | Aceptada |
| [007](#007) | El overflow de cuota penaliza el razonamiento, no el precio | Aceptada |
| [008](#008) | `useSyncExternalStore` para todo estado persistido | Aceptada |
| [009](#009) | `ModelLifecycle` en lugar de `ModelStatus` | Aceptada |
| [010](#010) | `export const instant = false` en vez de `<Suspense>` | Aceptada |
| [011](#011) | shadcn/ui sobre Base UI (no Radix) | Aceptada |
| [012](#012) | La lógica de negocio vive fuera de los componentes | Aceptada |
| [013](#013) | Cada dato lleva su fuente y fecha de verificación | Aceptada |
| [014](#014) | Los precios se verifican contra la página oficial | Aceptada |
| [015](#015) | `EnrichedModel` es el contrato estable de la capa de datos | Aceptada |
| [016](#016) | El top 20 se amplía con `isFeatured`, no con un número fijo | Aceptada |

---

## 001 · Score por percentil de cohorte, no por anclas absolutas

**Estado:** Aceptada · **Ámbito:** `src/lib/scoring/`

### Contexto

El requisito original pedía puntuaciones de 1 a 10. La implementación ingenua
—anclar cada benchmark a un techo absoluto (ej. «SWE-bench top = 80 %»)— tiene
un fallo estructural: cuando sale un modelo mejor hay que subir el techo, y al
subirlo **todos los demás modelos bajan de nota aunque no hayan cambiado nada**.

Esto invalida cualquier histórico, confunde al usuario («¿por qué el mismo
modelo ha empeorado?») y hace que las puntuaciones no signifiquen nada.

El requisito adicional lo hacia explícito: el score **no debe requerir
recalibración constante** cuando salen modelos nuevos.

### Decisión

Separar la **escala** del **objeto medido**:

- La escala 1..10 es un **instrumento fijo**: la curva `PERCENTILE_TO_SCORE`.
- El objeto medido es la **cohorte vigente de modelos** para ese benchmark.

El score de un modelo es su percentil dentro de la cohorte, mapeado por la curva
fija. Se añaden dos correcciones:

1. **Techo de capacidad curado** (`BENCHMARK_CEILINGS`) — si el mejor del cohorte
   solo llega al 55 % en un benchmark, no debe recibir un 10 (= «el mejor
   disponible»). El techo es curado, no derivado del cohorte, así que tampoco
   envejece.
2. **Contracción por confianza** (`cohortConfidence(n)`) — en cohortes pequeñas
   el percentil es ruido (un solo outlier mueve todo), así que el score se
   contrae hacia la mediana (5.0).

### Consecuencias

- El «10» **siempre existe**: lo ocupa el líder actual. Se traspasa solo.
- Las puntuaciones de un modelo son estables mientras la cohorte no cambie.
- La curva **no se recalibra por la salida de un modelo**. Solo cambia si cambia
  la interpretación de la escala, que es un cambio de producto versionado.
- La comparación entre modelos de benchmarks distintos es un ranking de cohorte,
  no una afirmación absoluta. Es coherente con el mensaje del producto.
- El "cohort size" se expone en `EnrichedModel` y se muestra en Modo Técnico:
  la transparencia sobre el margen de error es parte del contrato.

### Alternativas descartadas

- **Anclas absolutas por benchmark.** Rechazada: obliga a recalibrar y hace
  caer las notas de todos con cada lanzamiento.
- **Puntuaciones tipo Elo.** Descartada para el MVP: requiere un sistema de
  comparaciones pareadas que no tenemos, y su interpretación (≈1000 = nivel
  jugador de ajedrez) es opaca para el usuario B2C.
- **Z-scores o min-max por cohorte.** Descartada: min-max es hipersensible al
  outlier (de ahí el techo de capacidad); el z-score produce puntuaciones fuera
  de 1..10 y menos interpretables.

---

## 002 · Seed en TypeScript en lugar de base de datos activa

**Estado:** Aceptada · **Ámbito:** `src/data/`

### Contexto

El stack previsto incluye PostgreSQL + Prisma. Sin embargo, el MVP debe:

- Arrancar con `npm install && npm run dev` y **sin infraestructura**.
- No requerir migraciones, ni seeds SQL, ni un servidor de base de datos.
- Ser demostrable y testeable de forma trivial.

### Decisión

El MVP corre sobre un **seed tipado en TypeScript** (`src/data/seed.ts`). El
schema de Prisma (`prisma/schema.prisma`) se escribe **antes** y en paralelo
como documentación del modelo relacional objetivo, pero **no se activa**.

La capa `src/data/models.ts` se escribe como **frontera de sustitución**: toda
la lógica de datos (cohortes, normalización, enriquecimiento) vive detrás de
una API pública de funciones. Cuando llegue el momento, se implementa un
repositorio Prisma con la misma firma y se cambia una sola línea.

### Consecuencias

- Cero fricción de arranque. El proyecto se clona y funciona.
- Los tipos del dominio (`src/lib/domain/types.ts`) son la **única** definición
  de las formas; el seed y Prisma se mapean a ellas.
- El catálogo es **contenido editorial**, no datos de máquina: requiere
  criterio humano (qué merece entrar, qué licencia tiene, si el autoalojamiento
  es viable). Un seed en TS lo hace explícito y revisable.
- Limitación real: **el mantenimiento de precios es manual**. Está registrado
  como deuda técnica y mitigado con `lastVerifiedDate`.

### Alternativas descartadas

- **PostgreSQL con Docker Compose desde el día uno.** Descartada: añade un
  requisito de entorno que rompe el «npm install y ya funciona», sin aportar
  nada al producto en esta fase.
- **SQLite en el repo.** Descartada: da una falsa sensación de persistencia
  (los datos siguen siendo un seed) y complica la migración a Postgres.
- **Archivo JSON en `public/`.** Descartada: pierde los tipos, que son justo lo
  que hace Valuable el seed.

---

## 003 · Tres categorías de pesos, no dos

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`

### Contexto

El brief pedía añadir soporte para «modelos locales / pesos abiertos /
código abierto». La formulación inicial tempted a usar un booleano
`isOpenSource: boolean`.

### Decisión

Modelar **tres** estados, porque «pesos abiertos» y «código abierto» no son
sinónimos:

```ts
type WeightType =
  | "PROPRIETARY"                  // solo API o suscripción
  | "OPEN_WEIGHTS_RESTRICTED"      // pesos descargables, licencia con condiciones
  | "OPEN_WEIGHTS_PERMISSIVE"      // licencia OSI (MIT, Apache-2.0)
```

El caso intermedio existe porque **Llama 4 Community** permite descargar los
pesos pero impone condiciones (usuariosetu restrictions, política de uso
aceptable). Presentarlo como «open source» es incorrecto y tiene consecuencias
legales reales. El flag `isOsiLicense` distingue el caso permisivo.

En la UI: verde para OSI, ámbar para restringido. En la tabla técnica: columna
«Licencia». En el recomendador: la licencia se muestra en el «por qué» de la
opción local.

### Consecuencias

- La distinción se captura **una sola vez** en el dominio y se propaga.
- Un usuario que vaya a usar un modelo comercialmente puede filtrar por OSI.
- El término «open source» deja de usarse como etiqueta técnica del producto.

### Alternativas descartadas

- **Booleano `isOpenSource`.** Descartada: confunde las tres situaciones y
  produce recomendaciones comerciales que pueden ser legales o no.
- **Cuatro categorías** (añadiendo «código abierto sin pesos», tipo Stable
  Diffusion). Descartada: fuera del alcance (solo LLMs de texto).

---

## 004 · La ejecución local nunca se presenta como «gratis»

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`, `src/components/model-detail.tsx`

### Contexto

Al añadir la vía `LOCAL_SELF_HOSTED` Surge una trampa de marketing: el coste
marginal por token es cero, así que la comparación de precios muestra «0 $/mes».
Eso es **solo la mitad de la verdad**..

### Decisión

El coste marginal es cero, pero **el hardware se paga**. Por eso:

1. `LocalRequirements` expone los requisitos reales: VRAM mínima y
   recomendada, descarga Q4, parámetros totales y activos, RAM para CPU, motores
   compatibles y comando de ejemplo.
2. `AccessChannel` lleva `isZeroMarginalCost` y
   `estimatedHardwareMonthlyCost`.
3. La ficha del modelo muestra una tarjeta de ejecución local con el **coste
   real**: hardware, dificultad de puesta en marcha, y el hecho de que el
   «gratis» es marginal.
4. En el recomendador, la vía local recibe un **bonus de 1.10** (tiene coste
   marginal cero) pero **no** se cuela en opciones de presupuesto «gratis» sin
   más: el requisito de hardware se muestra siempre.

Detalle técnico derivado: para MoE, la VRAM la exigen los **parámetros
totales**, no los activos. Llama 4 Scout declara «17B activos» pero necesita
~65 GB en Q4 porque todos los expertos deben estar residentes.

### Consecuencias

- El usuario entiende el coste total antes de elegir.
- La tabla técnica muestra una columna «VRAM local».
- Es un argumento de venta honesto: quien tiene GPU yapagada puede descubrir
  que le sale gratis.

### Alternativas descartadas

- **Mostrar solo «$0/mes».** Descartada: engaña y generaargos de soporte.
- **No mostrar el canal local en la calculadora.** Descartada: es una vía real
  de acceso con propiedades económicas distintas.

---

## 005 · Doble modo Práctico/Técnico global y persistente

**Estado:** Aceptada · **Ámbito:** `src/components/providers/mode-provider.tsx`

### Contexto

El público objetivo son dos: B2C/prosumer y desarrolladores. Un modelo **unico**
de presentación no sirve a ninguno de los dos bien.

### Decisión

Un interruptor **global** que alterna entre dos renderizados del **mismo** dato:

- **Modo Práctico** — tarjetas, lenguaje llano, sin jerga.
- **Modo Técnico** — tabla densa ordenable con precios por 1M, tok/s, TTFT,
  contexto, licencia, VRAM local y percentiles.

El estado es **global** (afecta a toda la app, no a una vista) y **persistente**
en `localStorage`. Se aplica con `data-mode` en `<html>` para que el CSS
reaccione sin depender del cliente.

El componente alterna entre dos renderizaciones; **no** se duplica la lógica de
datos: ambos caminos consumen el mismo `EnrichedModel[]`.

### Consecuencias

- La persistencia sobrevive a la navegación (verificado: Práctico → ficha de
  modelo → home → sigue Práctico).
- Cada módulo tiene que mantener **dos** presentaciones. Coste real, aceptado
  conscientemente: es lo que hace que el producto sirva a dos audiencias.
- El Modo Técnico expone también los percentiles y el tamaño de cohorte:
  transparencia sobre cómo se calculó el score.

### Alternativas descartadas

- **Dos sitios web distintos.** Descartada: duplica contenido, rompe el SEO y
  el mantenimiento.
- **Preferencia por cookies/servidor.** Descartada para el MVP: añade
  complejidad sin beneficio (la preferencia no necesita estar en el servidor).
- **Solo un modo, con jerga opcional.** Descartada: la tabla densa y las
  tarjetas resuelven problemas de lectura distintos.

---

## 006 · Puntuación multiplicativa en el recomendador

**Estado:** Aceptada · **Ámbito:** `src/lib/recommender/wizard.ts`

### Contexto

El recomendador filtra por necesidad, presupuesto y privacidad. La pregunta de
diseño: ¿suma ponderada o producto?

### Decisión

**Producto**, con la calidad como factor dominante:

```
score = calidad(0..10) * 3.0
      * factor_presupuesto(0.15 .. 1.0)
      * factor_privacidad(0.55 .. 1.15)
      * 1.05  (bonus suscripción: incluye herramientas extra)
      * 1.10  (bonus local: coste marginal cero)
```

El presupuesto y la privacidad son **filtros duros**, no preferencias suaves.
Con suma ponderada, un modelo Excellent pero caro puede quedarse a la cabeza;
con producto, un filtro incumplido lo hunde. Y si un factor llega a cero, el
candidato desaparece — la semántica correcta de «no cumple».

### Consecuencias

- Un modelo fuera de presupuesto no puede ganar por calidad.
- La escala de scores es 0..100 tras el `* 3.0` y el clamp.
- Los multiplicadores son números «mágicos» documentados en el código; el
  bonus de suscripción (1.05) refleja que la suscripción incluye web search y
  artifacts que la API no trae de serie.

### Alternativas descartadas

- **Suma ponderada.** Descartada: un filtro duro que compite con la calidad no
  es un filtro.
- **Eliminación estricta (filtrar y luego ordenar por calidad).** Descartada:
  demasiado brusca; con producto se conserva una guía suave (un 0.15 en vez
  de un 0).

---

## 007 · El overflow de cuota penaliza el razonamiento, no el precio

**Estado:** Aceptada · **Ámbito:** `src/lib/calculator/subscription-vs-usage.ts`

### Contexto

Si el usuario supera la cuota de su suscripción, los mensajes sobrantes **no le
cobran dinero**: caen en un modelo fallback más barato y peor. Es una
**degradación de calidad**, no un sobrecoste.

### Decisión

La comparación separa precio y cobertura:

```
si suscripción_cubre_y_más_barata  → winner = subscription
si no_cubre_y_API_más_barata       → winner = usage (doble victoria)
si empate                          → winner = tie
```

La suscripción gana por precio aunque no cubra el uso, pero el motivo explica
cuántos mensajes degradan y a qué modelo caen. La cuota se traduce a capacidad
mensual con:

```
resets_por_mes    = (días_laborables * 24) / reset_window_hours
capacidad_mensual = estimated_message_cap * resets_por_mes
```

### Consecuencias

- El resultado es accionable: «te ahorra $X pero 30 mensajes caerán en Haiku».
- La UI muestra el overflow, el modelo fallback y los «mensajes reales por
  dólar».
- Con `estimatedMessageCap = null` (ilimitado) no hay overflow.

### Alternativas descartadas

- **Añadir el coste del overflow a la suscripción.** Descartada: no es como
  funciona la facturación. Mentiría sobre el modelo de negocio del proveedor.
- **Ignorar el overflow.** Descartada: daría un veredicto falso.

---

## 008 · `useSyncExternalStore` para todo estado persistido

**Estado:** Aceptada · **Ámbito:** `src/components/providers/mode-provider.tsx`, `theme-toggle.tsx`

### Contexto

El modo global y el tema se persisten en `localStorage`. La implementación
natural sería `useState` + `useEffect` que lee el storage y hace `setState`.

### Decisión

Usar **`useSyncExternalStore`** con un `subscribe` propio (evento `storage` +
evento custom para la misma pestaña).

Motivos:

1. La regla `react-hooks/set-state-in-effect` de React 19 **prohíbe** hacer
   `setState` dentro de un `useEffect`.
2. Semánticamente es lo correcto: leer `localStorage` es **leer una fuente
   externa**, no un «efecto de sincronización».
3. Evita renderizados en cascada y desajustes de hidratación: el servidor
   devuelve `defaultMode` y el cliente se re-suscribe al montar.

Detalles defensivos: `try/catch` en lectura y escritura (en modo privado
`localStorage` puede lanzar; la sesión funciona igual, solo pierde la
persistencia).

### Consecuencias

- Sin errores de hidratación en SSR.
- La persistencia sobrevive a la navegación (verificado).
- Hay que recordar emitir el evento custom al cambiar desde la misma pestaña
  (el evento `storage` solo se dispara entre pestañas).

### Alternativas descartadas

- **`useEffect` + `setState`.** Descartada: viola la regla de lint y produce
  un flash del valor por defecto.
- **Zustand / Jotai.** Descartada: no está en el stack y para dos valores
  persistidos es sobreingeniería.
- **Cookies.** Descartada: requiere servidor para leerlas y no aporta nada.

---

## 009 · `ModelLifecycle` en lugar de `ModelStatus`

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`

### Contexto

El nombre `ModelStatus` colisionaba con la unión de estados de **byte** de un
modelo (lo que se descarga de los pesos: base/cuantización), que también
necesitaba un nombre.

### Decisión

Renombrar el estado de ciclo de vida a **`ModelLifecycle`**:

```ts
interface ModelLifecycle {
  status: "PREVIEW" | "GA" | "DEPRECATED" | "LEGACY";
  deprecatedAt?: string;
  routedTo?: string;
}
```

El enum en sí no cambia; solo el nombre del tipo contenedor.

### Consecuencias

- Los dos conceptos quedan sin colisión.
- `deprecatedAt` y `routedTo` registran a dónde se enrutan las peticiones tras
  una deprecación — información que ya se eligió decidir aunque todavía no se
  use en la UI.

### Alternativas descartadas

- **`ByteFormatStatus` para el otro caso.** Equivalente; se prefirió no tocar
  el concepto de byte en esta fase.

---

## 010 · `export const instant = false` en vez de `<Suspense>`

**Estado:** Aceptada · **Ámbito:** `src/app/modelos/[slug]/page.tsx`

### Contexto

Next.js 16 con **Cache Components** activo avisa de
`Next.js encountered URL data during prerendering` en las rutas que leen
`params`. La guía ofrece dos salidas: envolver el acceso en `<Suspense>` o
declarar la ruta como no-instantánea.

### Decisión

Usar **`export const instant = false`** en la ruta dinámica de modelo.

Razón: la página renderiza una **ficha completa** (radar, ficha técnica, tabla de
vías de acceso, comparativa multi-proveedor, tarjeta local). Un esqueleto
seguido de contenido no aporta nada al usuario; el esqueleto solo tiene sentido
en un shell que se pinta rápido y luego se rellena.

### Consecuencias

- El aviso desaparece.
- La página se prerenderiza con contenido completo (PPR parcial), no con un
  placeholder.
- `generateStaticParams()` sigue generando los 19 slugs.

### Alternativas descartadas

- **`<Suspense>` con fallback skeleton.** Descartada: añade una cascada de
  render sin ganancia para el usuario en una página de contenido denso.
- **Desactivar Cache Components.** Descartada: desaprovechar la capacidad de
  Next.js 16 para simplificar un warning.

---

## 011 · shadcn/ui sobre Base UI (no Radix)

**Estado:** Aceptada · **Ámbito:** `src/components/ui/`

### Contexto

El scaffolding de shadcn/ui en este proyecto se apoya en **Base UI**
(`@base-ui/react`), no en Radix. Las APIs son distintas en los detalles que se
usan.

### Decisión

Adoptar las APIs de Base UI y documentar las diferencias, que son la fuente
habitual de errores al copiar ejemplos de la documentación de Radix:

| Radix | Base UI (aquí) |
|---|---|
| `<Trigger asChild>` | `<Trigger render={<Link />}>` |
| `asChild` en general | `render={...}` |
| — | `nativeButton={false}` cuando el elemento no es `<button>` |
| `onValueChange(value: number[])` | `onValueChange(value: number, eventDetails)` (Slider) |
| `onValueChange(value: string)` | `onValueChange(value: string \| null)` (Select) |

### Consecuencias

- Los ejemplos copiados de docs de Radix **no** funcionan tal cual.
- Los tipos de los callbacks son más estrictos (hay que Narrowing de `null`).

### Alternativas descartadas

- **Forzar Radix.** Descartada: la versión instalada es Base UI; mezclar
  librerías de primitivas de UI duplica comportamiento y estilos.

---

## 012 · La lógica de negocio vive fuera de los componentes

**Estado:** Aceptada · **Ámbito:** `src/lib/`

### Contexto

El proyecto tiene fórmulas con reglas no triviales: normalización por cohorte,
coste de tokens con caché, capacidad de suscripción, veredicto comparativo,
puntuación del recomendador.

### Decisión

Toda la lógica va en `src/lib/` como **funciones puras**; los componentes solo
renderizan y capturan input.

Esto no es purismo: es lo que hace que la lógica sea **testeable sin DOM**. El
stack no incluye React Testing Library, y no hace falta: 35 tests cubren todas
las fórmulas sin renderizar nada.

### Consecuencias

- Los componentes son finos y legibles.
- Las fórmulas se pueden portar a un worker, a un endpoint o a un script de
  sincronización sin cambios.
- Los tests corren en ~180 ms.

### Alternativas descartadas

- **Tests de componentes.** Descartada: no es lo que hay que verificar. Las
  fórmulas son el riesgo; el render es trivial comparado con ellas.

---

## 013 · Cada dato lleva su fuente y fecha de verificación

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`, `src/data/seed.ts`

### Contexto

Los benchmarks y los precios son datos que **cambian** y que **vienen de
fuera**. Presentarlos sin procedencia es una falta de rigor y una fuente de
quejas cuando un precio queda obsoleto.

### Decisión

- `ModelBenchmarkResult.source` — procedencia de cada score.
- `AccessChannel.lastVerifiedDate` — fecha de verificación de precios y
  condiciones de suscripción.
- La interfaz etiqueta los datos como **referencia** cuando proceden de model
  cards o de agregadores.

Además, `lastVerifiedDate` está pensado para **avisar en la UI cuando un precio
supere los 90 días sin verificar** (pendiente de implementar).

### Consecuencias

- Cada cifra es auditable: se puede rastrear de dónde salió.
- La UI puede (y debe pronto) avisar de datos caducados.
- El `source` por entrada obliga a ser honesto sobre la procedencia: si un
  score viene de una model card y no de una evaluación independiente, se dice.

### Alternativas descartadas

- **Un único `lastUpdated` global.** Descartada: no permite saber **qué** dato
  está viejo.

---

## 014 · Los precios se verifican contra la página oficial

**Estado:** Aceptada · **Ámbito:** `src/data/seed.ts`

### Contexto

Los precios de los modelos cambian con frecuencia y los agregadores (OpenRouter)
pueden tener margen o retraso respecto al proveedor.

### Decisión

Los precios **first-party** se verifican contra la **página oficial de precios**
del laboratorio. Fuentes usadas (verificadas el 2026-11-22):

| Laboratorio | Fuente |
|---|---|
| Anthropic | `platform.claude.com/docs/en/about-claude/pricing` |
| OpenAI | `developers.openai.com/api/docs/pricing` |
| Google | `ai.google.dev/gemini-api/docs/pricing` |
| DeepSeek | `api-docs.deepseek.com/quick_start/pricing` |
| Mistral | `docs.mistral.ai/inference/pricing` |
| xAI | `docs.x.ai/developers/pricing` |
| Meta | `openrouter.ai/meta-llama/llama-4-maverick` |

OpenRouter se usa como fuente de **precios de terceros** y de **datos de
velocidad**, no de precios first-party.

Casos especiales que el seed documenta explícitamente:

- **DeepSeek** tiene precios valle/pico (pico = 2× valle, franjas 01:00–04:00 y
  06:00–10:00 UTC). Se documenta el precio de valle.
- **Meta retiró su API el 2026-07-06**: para Llama, el autoalojamiento es la vía
  oficial.
- **Gemini 4 Carbon/Argon** suben de $2/$10 a $4/$20 el 2026-12-01.
- **xAI** entrena con los chats del usuario por defecto (a diferencia de
  OpenAI, Anthropic y Google). Alimenta el semáforo de privacidad.

### Consecuencias

- El catálogo refleja precios con fecha, no «precios de memoria».
- Se pueden detectar cambios de precio comparando snapshots (pendiente).
- El mantenimiento es manual — la deuda técnica principal, a resolver con el
  pipeline de sincronización.

### Alternativas descartadas

- **Fijar precios desde OpenRouter para todo.** Descartada: OpenRouter no
  ofrece los precios first-party de referencia para todos los modelos, y su
  precio puede incluir margen.

---

## 015 · `EnrichedModel` es el contrato estable de la capa de datos

**Estado:** Aceptada · **Ámbito:** `src/data/models.ts`

### Contexto

El MVP usa un seed en memoria, pero el plan es migrar a Prisma + Postgres. Una
migración de ese tipo rompe muchas cosas si la capa de datos está filtrada por
todas partes.

### Decisión

`src/data/models.ts` expone una **API de funciones** y define un único tipo de
salida, `EnrichedModel`, que es lo que consume la UI. La implementación interna
(seed → Prisma) es un detalle intercambiable.

Regla derivada: **la UI nunca importa de `seed.ts` directamente**. Siempre pasa
por `models.ts`.

### Consecuencias

- Migrar a Prisma es cambiar el interior de `models.ts`, no los componentes.
- `EnrichedModel` puede enrichirse con campos nuevos (precios históricos,
  disponibilidad) sin tocar la UI.
- El test de la capa de datos es trivial (no necesita base de datos).

### Alternativas descartadas

- **Consultas a la base de datos desde los componentes.** Descartada: acopla la
  UI al esquema y rompe la substitutibilidad.
- **React Server Components con fetching directo.** Descartada por ahora: el
  MVP es estático y el seed es síncrono; RSC añadiría complejidad sin
  ganancia cuando llegue la DB.

---

## 016 · El top 20 se amplía con `isFeatured`, no con un número fijo

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`, `src/data/seed.ts`

### Contexto

El brief pedía «Top 20 por defecto, expandible a todos». Pero con 19 modelos en
el catálogo actual, un «top 20» literal es el catálogo completo — lo que hace
que la función del top no haga nada y esconde la diferencia entre lo
destacado y el resto.

### Decisión

El conjunto «destacado» se marca **explícitamente** en el dato
(`isFeatured` + `featuredOrder`), no se deriva de un corte numérico. La UI
muestra los destacados y ofrece «ver todos» para el resto.

Consecuencia futura: cuando el catálogo supere los 20, el top se ajusta
**editorialmente** (qué merece el foco), no por posición en un ranking.

### Consecuencias

- La curatorial es explícita y auditable.
- El orden de los destacados es controlable (`featuredOrder`).
- El catálogo puede crecer sin que el «top» se desalinee con el criterio
  editorial.

### Alternativas descartadas

- **`slice(0, 20)` sobre el ranking.** Descartada: en cuanto haya 25 modelos,
  el top sería «los 20 con mejor overall», que es un criterio distinto del
  editorial y no tiene en cuenta la novedad o la representatividad del
  catálogo.
