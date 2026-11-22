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
| [017](#017) | Los tokens son unidad interna y de precio, nunca una capacidad legible | Aceptada |
| [018](#018) | La sesión es la unidad de trabajo; cuota y ventana son ortogonales | Aceptada |
| [019](#019) | La ventana de contexto es un presupuesto único, entrada + salida | Aceptada |
| [020](#020) | La cuota tiene nivel explícito, no un binario ilimitado/limitado | Aceptada |
| [021](#021) | Perfiles de trabajo con referencia visible, sin multiplicadores opuestos | Aceptada |
| [022](#022) | Módulo E (laboratorios y proveedores) es un índice, sin datos nuevos | Aceptada |
| [023](#023) | La app es un comparador: el recomendador es la puerta de entrada | Aceptada |

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

---

## 017 · Los tokens son unidad interna y de precio, nunca una capacidad legible

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/equivalents.ts`, `src/lib/domain/constants.ts`

### Contexto

El catálogo mezclaba tres cosas distintas bajo la misma palabra «tokens»:

1. **Unidad interna de cálculo** — el motor de costes y la fórmula de la
   calculadora. Nunca debe verse.
2. **Unidad de precio** — cómo se factura todo el mundo ($8 por millón de
   tokens). Imprescindible, pero hay que explicar la unidad.
3. **Capacidad del modelo** — cuántos tokens caben en la ventana de contexto.

El error fue que (3) se traducía a «páginas» y «novelas cortas» mientras (2)
se dejaba en tokens crudos. El usuario veía «Capacidad: ~2.100 páginas» junto
a «$8 / $40 por 1M tokens» sin saber qué era cada cosa ni cómo se relacionaban.

El problema de fondo: **«páginas» es un equivalente de lectura**, y el producto
cubre también programación (§2: «solo LLMs de texto y código»). Un programador
necesita saber si «2.100 páginas» es su repositorio, y no lo es.

### Decisión

Regla de tres niveles según el contexto:

| Contexto | Unidad | Ejemplo |
|---|---|---|
| **Precio** | Tokens, con la unidad explícita | «$8 por cada millón de tokens que le envías · $40 por cada millón que te devuelve» |
| **Capacidad del modelo** | Equivalente del mundo del usuario | «caben ~200.000 líneas de código» |
| **Cuota del plan** | Sesiones de trabajo | «800 mensajes / 5 h ≈ 230 sesiones de revisión de código al día» |

Los tokens **nunca** son la unidad de una capacidad. Cuando aparecen, es
porque son la **unidad de medida de un precio**, y siempre acompañados de la
explicación de qué es lo que se está pagando.

La equivalencia de capacidad deja de ser una única traducción universal y pasa
a ser **contextual**: el catálogo declara qué equivalentes tienen sentido para
ese modelo según sus `useCases` (código, documentos, datos).

### Consecuencias

- El Modo Práctico puede hablar de «líneas de código» sin jerga de tokens.
- La ficha del modelo no mezcla «páginas» con «128.000 tokens» sin contexto.
- Los tokens desaparecen de la calculadora como dato de entrada del usuario:
  el usuario declara **trabajo**, no tokens.
- Las equivalencias de capacidad necesitan **unidades de código** que antes no
  existían (`HUMAN_EQUIVALENTS`).

### Alternativas descartadas

- **Mostrar siempre tokens crudos.** Descartada: es jerga y no permite
  dimensionar nada (§3.6).
- **«Páginas» como equivalente universal.** Descartada: solo sirve para
  lectura; no responde a «¿cabe mi repo?».
- **Horas de trabajo como unidad de cuota.** Descartada: el consumo no es
  lineal con el tiempo — en minutos se te puede agotar la cuota, y con otro
  tipo de trabajo en horas no. La unidad agotada es un **contador de
  interacciones**, no una medida de tiempo.

---

## 018 · La sesión es la unidad de trabajo; cuota y ventana son ortogonales

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`, `src/lib/calculator/`

### Contexto

Las preguntas que el usuario trae son de **uso diario**, no de tokens:

- «¿Cuánto voy a poder usar esta suscripción día a día?»
- «¿Voy a llegar a los límites diarios y semanales?»
- «¿Se me va a quedar corto?»

Para responderlas hay que cruzar dos restricciones que el producto mezclaba:

| Restricción | La impone | Naturaleza |
|---|---|---|
| **Interacciones** | el plan (cuota) | contador **artificial** del producto |
| **Tokens acumulados** | el modelo (ventana) | límite **físico** del modelo |

Un casoFrequently confuso: un usuario con ventana de 32k que trabaja con un
proyecto de 300k tokens **no está en problemas** si reparte el trabajo en
varias conversaciones. Que el material no quepa en *una* conversación no
significa que no pueda terminar el trabajo, y **no agota la cuota**: solo
significa que necesita más sesiones.

La app no podía responderlo porque `contextWindow` y `maxOutputTokens` eran
campos muertos e independientes, y porque no existía el concepto de tamaño de
sesión.

### Decisión

Se introduce la **sesión** como unidad de trabajo:

> **Sesión** = un bloque de intercambios sobre un tema, en una conversación,
> con un tamaño de trabajo concreto.

Una sesión consume cuota (interacciones) **y** ocupa ventana (tokens
acumulados), y **puede agotarse en momentos distintos**:

- La cuota se agota por hacer **demasiados intercambios**.
- La ventana se agota por hacer una sesión **demasiado larga**.

Esto genera un veredicto nuevo que antes no existía: **qué restricción va a
frenar al usuario**. Es la respuesta directa a «¿se me va a quedar corto?».

El tamaño de la sesión (nº de intercambios) es un **parámetro del usuario**, no
del modelo: por eso vive en la calculadora, no en la ficha.

### Consecuencias

- La capacidad del modelo pasa a expresarse en «sesiones de tipo X», que es
  accionable y no requiere saber qué es un token.
- La comparación cuota-vs-ventana se puede hacer explícita en la UI.
- El aviso de «no cabe» deja de ser un binario: distinguir «no cabe de una
  sentada» (informativo) de «no cabe ni por partes» (bloqueante).

### Alternativas descartadas

- **Horas de trabajo.** Descartada: el consumo no es lineal con el tiempo.
- **Tokens como unidad de cuota.** Descartada: obliga al usuario a pensar en
  tokens, que es justo lo que se quiere evitar.
- **Una sola restricción (cuota o ventana).** Descartada: son ortogonales y
  la respuesta útil es «cuál de las dos te frena».

---

## 019 · La ventana de contexto es un presupuesto único, entrada + salida

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`, `src/lib/domain/equivalents.ts`

### Contexto

El dominio tenía dos campos independientes:

```ts
contextWindow?: number;     // "Tokens totales (input + output)"
maxOutputTokens?: number;
```

El comentario decía «tokens totales (input + output)», pero los números del
seed (`contextWindow: 1_050_000`, `maxOutputTokens: 128_000`) se leían como si
fueran acumulables. **No lo son**: la ventana es un presupuesto **único** que
la entrada y la salida comparten. Enviar 900.000 tokens deja 150.000 para la
respuesta, no 1.178.000.

El modelo actual no podía expresar «¿cuánto me queda para la respuesta?», que
es la pregunta que decide si un parche largo se va a cortar.

### Decisión

La ventana se modela como un **presupuesto con dos restricciones
simultáneas**:

- `contextWindow` — presupuesto total (entrada + salida).
- `maxOutputTokens` — techo de lo que puede ocupar la respuesta dentro de ese
  presupuesto.

La ficha presenta:
- **Titular**: el equivalente absoluto («cabe un proyecto entero»).
- **Detalle**: el reparto («de 1.050.000 tokens: ~922.000 puedes enviar y
  hasta 128.000 puedes recibir»).

### Consecuencias

- Se puede avisar de que una respuesta se va a cortar por falta de presupuesto
  de salida, no solo por falta de ventana.
- El cálculo de «sesiones que caben» usa el presupuesto real, no una suma
  ingenua.

### Alternativas descartadas

- **Tratar `contextWindow` y `maxOutputTokens` como acumulables.** Descartada:
  contradice el significado real de la ventana.
- **Exigir `maxOutputTokens` siempre.** Descartada: no todos los proveedores lo
  publican; se mantiene opcional.

---

## 020 · La cuota tiene nivel explícito, no un binario ilimitado/limitado

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/types.ts`, `src/lib/calculator/quota.ts`

### Contexto

`estimatedMessageCap: null` significaba «sin límite de mensajes», y la
calculadora lo traducía a capacidad infinita. Pero:

1. **No hay ningún plan de $100/mes que sea realmente ilimitado.** OpenAI,
   Anthropic y Google comunican sus planes con niveles: «very high», «high»,
   «medium», «limited».
2. **La propia app se contradecía**: la ficha decía «Sin límite de mensajes» y
   a la vez «Degrada a GPT-6.2 Sol». Si hay fallback, hay un límite.
3. El cálculo daba «la suscripción gana siempre» para los planes caros — el
   peor tipo de error, porque hace perder dinero al usuario.

### Decisión

La cuota se modela con un **nivel explícito** más un número opcional cuando el
proveedor lo publica:

```ts
type QuotaLevel =
  | "UNLIMITED"   // sin techo conocido
  | "VERY_HIGH"   // cientos de mensajes por ventana
  | "HIGH"        // decenas
  | "MEDIUM"      // ~40-80 por ventana
  | "LIMITED"     // menos de 40 por ventana
  | "UNKNOWN";    // el proveedor no publica el nivel
```

Un canal **debe** declarar `quotaLevel`. El número (`estimatedMessageCap`)
sigue existiendo, pero solo es la fuente de verdad cuando hay nivel numérico.
Para los niveles no numéricos la capacidad **no es calculable** y la UI lo
dice en lugar de inventar un infinito.

### Consecuencias

- La UI puede decir «Límite muy alto — el proveedor no publica el número
  exacto» en vez de mentir con un infinito.
- El overflow sigue calculándose igual cuando hay número.
- El seed debe reclasificar los ~10 planes de suscripción.

### Alternativas descartadas

- **Dejar `null` = ilimitado.** Descartada: es una mentira sobre los planes
  reales, y el producto existe precisamente para no mentir con precios.
- **Eliminar el binario y guardar solo el número.** Descartada: obliga a
  inventar un número cuando el proveedor no lo publica.

---

## 021 · Perfiles de trabajo con referencia visible, sin multiplicadores opuestos

**Estado:** Aceptada · **Ámbito:** `src/lib/domain/constants.ts`, `src/lib/calculator/`

### Contexto

El modelo de consumo tenía **dos ejes que se multiplicaban y no eran
ortogonales**:

- `INTENSITY_PROFILES` (tamaño): short / medium / long.
- `USE_CASE_MULTIPLIERS` (tipo): general / coding / data-analysis.

El resultado era que **el mismo perfil mostraba cifras distintas según el
dropdown de caso de uso**, y las combinaciones no tenían sentido:
«chat corto + programación» costaba *más* tokens de entrada que «chat corto +
general» (800 × 1.3), y «chat corto + análisis de datos» duplicaba la entrada
mientras reducía la salida a la mitad. Nadie entendía esos números.

Además, en Modo Práctico se mostraban tokens **crudos y sin unidad**
(`800 / 400`), y el campo `pagesEquivalent` se calculaba y **nunca se
renderizaba**.

### Decisión

Un **único eje** de perfiles de trabajo, con una **referencia visible** que
explica qué es cada uno en términos de contenido real:

| Perfil | Referencia | Tokens (in / out) |
|---|---|---|
| Pregunta rápida | «¿Cómo centro un div?» — una duda de 3 líneas | 400 / 300 |
| Revisión de código | un PR de ~500 líneas | 4.000 / 1.500 |
| Trabajo sobre repo o documento | el proyecto entero (decenas de miles de líneas) | 80.000 / 8.000 |

El eje «caso de uso» desaparece como multiplicador: su contenido se **absorbe**
en los perfiles («programación» vive en «revisión de código», «análisis de
datos» en «documento»). Se conserva la información y se elimina la
contradicción.

En la UI el perfil se muestra con su **referencia**, no con tokens sueltos. Los
tokens aparecen solo como **unidad de medida con significado**, no como número
abstracto.

### Consecuencias

- Un solo control, sin combinaciones contradictorias.
- La escalera de coste es visible: 700 tokens (pregunta) → 88.000 (proyecto
  completo), ~125× de diferencia, con ejemplos que el usuario reconoce.
- Los tests que verificaban que «coding > general» se reescriben: el eje
  desapareció.

### Alternativas descartadas

- **3 × 3 (contenido × material).** Descartada: dos controles con 9 perfiles
  es más fricción de la que el objetivo del producto justifica.
- **Mantener el multiplicador con valores coherentes.** Descartada: el eje
  «tipo de trabajo» y el eje «tamaño» no son ortogonales; mientras ambos
  existan, habrá combinaciones que se contradigan.
- **Mostrar tokens crudos sin unidad.** Descartada: es la causa directa de la
  confusión reportada.

---

## 022 · Módulo E (laboratorios y proveedores) es un índice, sin datos nuevos

**Estado:** Aceptada · **Ámbito:** `src/app/laboratorios/`, `src/app/proveedores/`

### Contexto

El usuario explore el catálogo y quiere saber **qué modelos da cada
laboratorio** y **qué ofrece cada proveedor**. El seed ya tiene `LABORATORIES`
y `PROVIDERS`, pero `PROVIDERS` estaba exportado y **nunca importado** en
ningún sitio: datos muertos.

El módulo se discutió explícitamente y se delimitó: es **un índice de
navegación**, no un módulo de precios. No expone precios propios ni tablas de
precios por proveedor.

### Decisión

Dos rutas de solo lectura:

- `/laboratorios` — cada laboratorio con los modelos que publica y sus vías
  de acceso (suscripción / API / local).
- `/proveedores` — cada proveedor con los modelos que sirve.

Ambas enlazan a las fichas existentes. **No se añaden datos nuevos**: se
consume el seed que ya existe.

Consecuencia de datos: las ofertas de terceros (`ProviderOffer`) no tienen
`lastVerifiedDate`, lo que viola §3.7 («toda cifra nueva lleva `source` o
`lastVerifiedDate`)). Se corrige como parte de este módulo.

### Alternativas descartadas

- **Índice con tabla de precios por proveedor.** Descartada: exigiría subir
  `ProviderOffer` a entidad de primer nivel con precios y fechas propias, que
  es un módulo de precios nuevo y no un índice.
- **Fusionar laboratorios y proveedores en una sola página.** Descartada: son
  cosas distintas — el laboratorio **entrena** y publica; el proveedor **sirve**
  modelos que otros entrenaron.

---

## 023 · La app es un comparador: el recomendador es la puerta de entrada

**Estado:** Aceptada · **Ámbito:** `src/app/page.tsx`, `src/lib/recommender/wizard.ts`

### Contexto

El objetivo declarado del producto es **«poder comparar suscripciones o
APIs»**. La home actual es un catálogo con la calculadora y el recomendador
**debajo**, y el módulo C (calculadora) compara *una* suscripción contra *la*
API de *un* modelo — no compara suscripciones entre sí.

El usuario que entra sin saber nada no tiene un modelo en mente: quiere «qué
me conviene». Y las dos preguntas que decide comprar son
**económicas y de tiempo**: «¿cuánto me va a costar?» y «¿me va a dar para
trabajar?».

### Decisión

La home se reorienta a **comparador**:

1. El **recomendador** (módulo D) sube a la posición de entrada: es el que
   responde «qué es lo que más me conviene» sin que el usuario sepa nada.
2. El **comparador** (módulo C ampliado) puede contrastar **varias vías a la
   vez** — suscripciones de distintos laboratorios y APIs — no solo una
   suscripción contra una API.
3. La comparación se hace en una **unidad común** (tokens normalizados, ADR
   017/018), porque dos suscripciones de laboratorios distintos no son
   comparables en mensajes sin normalizar.

El módulo C no desaparece: **gana alcance**. Pasa de «compara esta
suscripción con esta API» a «compara estas opciones entre sí».

### Consecuencias

- El catálogo (módulo A) deja de ser el punto de entrada principal.
- El recomendador necesita evaluar **planes de suscripción**, no solo canales
  de modelo: una suscripción es del laboratorio, no del modelo.
- La comparación entre suscripciones requiere la entidad «plan», que el
  dominio no tiene todavía.

### Alternativas descartadas

- **Dejar el catálogo como entrada y ampliar la calculadora.** Descartada: el
  usuario que no sabe qué modelo quiere no puede elegir nada en un catálogo.
- **Crear un módulo nuevo «comparador».** Descartada: es una reorientación del
  C y del D, no una funcionalidad aparte — añadir un módulo nuevo es exactamente
  lo que §2 prohíbe sin discusión.
