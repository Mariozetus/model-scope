"use client";

import * as React from "react";
import {
  Code2,
  Languages,
  PenLine,
  Table2,
  Brain,
  Files,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrivacyBadge } from "@/components/privacy-badge";
import { useMode } from "@/components/providers/mode-provider";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/format";
import type { EnrichedModel } from "@/data/models";
import type { AccessChannel } from "@/lib/domain/types";
import { getCheapestApiPricing } from "@/data/models";

const SKILL_META = [
  { key: "code", label: "Código", icon: Code2 },
  { key: "reasoning", label: "Lógica", icon: Brain },
  { key: "writing", label: "Escritura", icon: PenLine },
  { key: "languages", label: "Idiomas", icon: Languages },
  { key: "data-analysis", label: "Datos", icon: Table2 },
  { key: "long-context", label: "Contexto", icon: Files },
] as const;

/** Percentil de referencia por habilidad, para la etiqueta contextual. */
const SKILL_BENCHMARK: Record<string, string> = {
  code: "swe-bench-verified",
  reasoning: "gpqa-diamond",
  writing: "arena-elo",
  languages: "multilingual-mgsm",
  "data-analysis": "table-reasoning",
  "long-context": "ruler-128k",
};

function percentileLabel(p: number | undefined): string {
  if (p == null) return "Sin datos";
  if (p >= 0.95) return "Top 5%";
  if (p >= 0.85) return "Top 15%";
  if (p >= 0.75) return "Top 25%";
  if (p >= 0.5) return "En la media";
  if (p >= 0.25) return "Por debajo de la media";
  return "En la cola";
}

/**
 * Radar de habilidades del modelo.
 *
 * Modo Práctico: barras con etiqueta de percentil.
 * Modo Técnico: barras + percentil numérico y tamaño de cohorte.
 */
export function SkillRadar({ model }: { model: EnrichedModel }) {
  const { mode } = useMode();
  const practical = mode === "practical";

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Habilidades</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {practical
          ? "Puntuación relativa frente a los demás modelos evaluados"
          : "Puntuación 0-10 (percentil dentro de la cohorte)"}
      </p>

      <div className="mt-5 space-y-4">
        {SKILL_META.map(({ key, label, icon: Icon }) => {
          const value = model.skills[key];
          const benchmark = SKILL_BENCHMARK[key];
          const percentile = model.percentiles[benchmark];
          const cohortSize = model.cohortSizes[benchmark];

          return (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <Icon className="size-3 text-muted-foreground" aria-hidden />
                  {label}
                </span>
                <span className="flex items-baseline gap-1.5">
                  {!practical && cohortSize != null && (
                    <span className="tabular text-[10px] text-muted-foreground">
                      n={cohortSize}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[11px] text-muted-foreground",
                      practical && "font-medium",
                    )}
                  >
                    {practical
                      ? percentileLabel(percentile)
                      : `p${((percentile ?? 0) * 100).toFixed(0)}`}
                  </span>
                  <span className="tabular text-xs font-semibold">
                    {value.toFixed(1)}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bar-fill h-full rounded-full transition-all duration-500"
                  style={{ width: `${(value / 10) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">
            Índice agregado de calidad
          </span>
          <span className="tabular text-lg font-bold">
            {model.qualityIndex.toFixed(0)}
            <span className="text-xs font-normal text-muted-foreground">
              /100
            </span>
          </span>
        </div>
      </div>
    </Card>
  );
}

/**
 * Tabla "¿Dónde y cómo usarlo?" — Módulo B.
 * Compara opción gratis, suscripción oficial y vías API / agregadores.
 */
export function AccessChannelsTable({ model }: { model: EnrichedModel }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">¿Dónde y cómo usarlo?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Todas las vías para consumir este modelo, lado a lado.
      </p>

      <div className="mt-5 space-y-4">
        {/* Opción gratis */}
        {model.subscriptions
          .filter((s) => s.freeTier)
          .map((subscription) => (
            <ChannelCard
              key={`free-${subscription.id}`}
              badge="Gratis"
              badgeVariant="outline"
              title={subscription.name}
              subtitle={subscription.freeTierQuotaNote ?? "Opción gratuita"}
              privacySafe={subscription.trainsOnUserDataByDefault}
              highlights={[
                `Herramientas: ${(subscription.includedTools ?? []).join(", ") || "básicas"}`,
                "Se degrada a un modelo reducido al agotar la cuota",
              ]}
            />
          ))}

        {/* Suscripción oficial */}
        {model.subscriptions
          .filter((s) => !s.freeTier)
          .map((subscription) => (
            <ChannelCard
              key={`sub-${subscription.id}`}
              badge="Suscripción oficial"
              title={subscription.name}
              subtitle={`${subscription.monthlyPrice != null ? `$${subscription.monthlyPrice}/mes` : "—"} · precio fijo`}
              price={
                subscription.monthlyPrice != null
                  ? `$${subscription.monthlyPrice}`
                  : undefined
              }
              privacySafe={subscription.trainsOnUserDataByDefault}
              highlights={[
                subscription.estimatedMessageCap != null
                  ? `${subscription.estimatedMessageCap} mensajes cada ${subscription.resetWindowHours}h`
                  : "Sin límite de mensajes",
                subscription.fallbackModelOnLimit
                  ? `Degrada a ${subscription.fallbackModelOnLimit}`
                  : "Sin degradación",
                `Herramientas: ${(subscription.includedTools ?? []).join(", ") || "ninguna"}`,
              ]}
              notes={subscription.notes}
            />
          ))}

        {/* API oficial + agregadores */}
        {model.apiChannels.map((channel) => (
          <ChannelCard
            key={`api-${channel.id}`}
            badge="API oficial"
            title={channel.name}
            subtitle="Pago por uso, sin cuota de mensajes"
            price={`$${channel.inputPricePer1M} / $${channel.outputPricePer1M}`}
            priceSuffix="por 1M tokens"
            highlights={[
              channel.cachedInputPricePer1M != null
                ? `Input cacheado: $${channel.cachedInputPricePer1M}/1M`
                : "Sin precio de input cacheado",
              channel.throughputTps != null
                ? `${channel.throughputTps} tok/s`
                : "Velocidad no medida",
            ]}
          />
        ))}

        {model.providerOffers.map((offer) => (
          <ChannelCard
            key={`prov-${offer.providerSlug}`}
            badge="Agregador"
            title={offer.providerName}
            subtitle={
              offer.isRecommended
                ? "Recomendado por rendimiento o precio"
                : "Proveedor externo"
            }
            price={`$${offer.inputPricePer1M} / $${offer.outputPricePer1M}`}
            priceSuffix="por 1M tokens"
            highlights={[
              offer.throughputTps != null
                ? `${offer.throughputTps} tok/s${offer.ttftSeconds != null ? ` · TTFT ${offer.ttftSeconds}s` : ""}`
                : "Velocidad no medida",
              offer.quantization
                ? `Cuantización: ${offer.quantization}`
                : "Precisión completa",
            ]}
          />
        ))}

        {/* Ejecución local / self-hosted */}
        {model.localChannels.map((channel) => (
          <LocalChannelCard key={`local-${channel.id}`} channel={channel} />
        ))}
      </div>
    </Card>
  );
}

/**
 * Tarjeta de la opción de ejecución local.
 *
 * Muestra el coste real: si el modelo se autoaloja, el coste marginal de cada
 * token es cero, pero el hardware cuesta. Damos ambas cifras para no
 * engañar con un "gratis" que no lo es.
 */
function LocalChannelCard({ channel }: { channel: AccessChannel }) {
  const req = channel.localRequirements;

  const difficultyLabel = {
    facil: "Fácil: un comando y listo",
    media: "Media: requiere GPU decente",
    avanzada: "Avanzada: clúster de GPUs",
  }[channel.setupDifficulty ?? "media"];
  return (
    <div className="rounded-xl border border-chart-1/40 bg-chart-1/[0.04] p-4 transition-colors hover:border-chart-1/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-chart-1/40 text-chart-1">
              Ejecución local
            </Badge>
            <span className="text-sm font-semibold">{channel.name}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Corres tú el modelo. Tus datos no salen de tu infraestructura.
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="tabular text-lg font-bold tracking-tight">
            $0
          </div>
          <div className="text-[10px] text-muted-foreground">
            por token (marginal)
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
          <span>
            Coste del hardware:{" "}
            <strong className="tabular font-medium text-foreground">
              {channel.estimatedHardwareMonthlyCost != null
                ? `~$${channel.estimatedHardwareMonthlyCost}/mes`
                : "depende de tu hardware"}
            </strong>
          </span>
        </li>

        {req && (
          <>
            <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
              <span>
                Hardware:{" "}
                {req.minVramGb != null && (
                  <strong className="tabular font-medium text-foreground">
                    ~{req.minVramGb} GB VRAM
                  </strong>
                )}{" "}
                mínimos
                {req.recommendedVramGb != null &&
                  ` · ${req.recommendedVramGb} GB recomendados`}
              </span>
            </li>

            {req.downloadGbQ4 != null && (
              <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
                <span>
                  Descarga:{" "}
                  <strong className="tabular font-medium text-foreground">
                    ~{req.downloadGbQ4} GB
                  </strong>{" "}
                  (Q4_K_M)
                </span>
              </li>
            )}

            {req.totalParameters != null && (
              <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
                <span>
                  Parámetros:{" "}
                  <strong className="tabular font-medium text-foreground">
                    {formatParams(req.totalParameters)}
                  </strong>
                  {req.activeParameters != null && (
                    <>
                      {" "}
                      ({formatParams(req.activeParameters)} activos por token)
                    </>
                  )}
                </span>
              </li>
            )}

            <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
              <span>
                Motores:{" "}
                <strong className="font-medium text-foreground">
                  {(channel.includedTools ?? []).join(", ")}
                </strong>
              </span>
            </li>
          </>
        )}

        <li className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
          <span>Puesta en marcha: {difficultyLabel}</span>
        </li>
      </ul>

      {req?.exampleCommand && (
        <code className="mt-3 block overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
          {req.exampleCommand}
        </code>
      )}

      {channel.notes && (
        <p className="mt-3 border-t border-border/60 pt-3 text-[10px] leading-relaxed text-muted-foreground">
          {channel.notes}
        </p>
      )}
    </div>
  );
}

/** Formatea un número de parámetros: 1.600.000.000.000 → "1.6T". */
function formatParams(n: number): string {
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  return `${n}`;
}

function ChannelCard({
  badge,
  badgeVariant = "secondary",
  title,
  subtitle,
  price,
  priceSuffix,
  privacySafe,
  highlights,
  notes,
}: {
  badge: string;
  badgeVariant?: "secondary" | "outline";
  title: string;
  subtitle: string;
  price?: string;
  priceSuffix?: string;
  privacySafe?: boolean;
  highlights: string[];
  notes?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 p-4 transition-colors hover:border-primary/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant} className="text-[10px]">
              {badge}
            </Badge>
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {price && (
          <div className="shrink-0 text-right">
            <div className="tabular text-lg font-bold tracking-tight">
              {price}
            </div>
            {priceSuffix && (
              <div className="text-[10px] text-muted-foreground">
                {priceSuffix}
              </div>
            )}
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {highlights.map((highlight) => (
          <li
            key={highlight}
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
          >
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-chart-1" />
            <span className="min-w-0">{highlight}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        {privacySafe !== undefined && (
          <PrivacyBadge trainsOnUserData={privacySafe} />
        )}
        {notes && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {notes}
          </p>
        )}
      </div>
    </div>
  );
}

/** Ficha técnica del modelo. */
export function SpecSheet({ model }: { model: EnrichedModel }) {
  const { mode } = useMode();
  const practical = mode === "practical";

  const apiPricing = getCheapestApiPricing(model);

  const rows: Array<{ label: string; value: string }> = practical
    ? [
        { label: "Ventana de contexto", value: model.capacity.labelEs },
        { label: "Velocidad", value: model.speed.labelEs },
        {
          label: "Salida máxima",
          value: model.maxOutputTokens
            ? `${formatTokens(model.maxOutputTokens)} tokens`
            : "—",
        },
        {
          label: "Modalidades",
          value:
            model.modalities
              .map((m) =>
                ({
                  text: "Texto",
                  vision: "Imagen",
                  audio: "Audio",
                  video: "Vídeo",
                })[m],
              )
              .join(", ") || "—",
        },
        {
          label: "Pesos",
          value:
            model.weightType === "PROPRIETARY"
              ? "Propietarios (solo API)"
              : `Abiertos · ${model.license}`,
        },
        {
          label: "Uso comercial",
          value:
            model.weightType === "PROPRIETARY"
              ? "—"
              : model.hasOsiLicense
                ? "Sí, sin condiciones"
                : "Con condiciones de licencia",
        },
        {
          label: "Autoalojable",
          value: model.canSelfHost ? "Sí" : "No",
        },
        {
          label: "Herramientas",
          value: model.supportsTools ? "Sí" : "No",
        },
        {
          label: "Precios desde",
          value: apiPricing
            ? `$${apiPricing.inputPer1M} / $${apiPricing.outputPer1M} por 1M tokens`
            : "—",
        },
      ]
    : [
        { label: "Context window", value: model.contextWindow ? `${model.contextWindow.toLocaleString("es-ES")} tokens` : "—" },
        { label: "Max output tokens", value: model.maxOutputTokens ? model.maxOutputTokens.toLocaleString("es-ES") : "—" },
        { label: "Throughput (mejor)", value: model.speed.tps ? `${model.speed.tps} tok/s` : "—" },
        { label: "TTFT (mejor)", value: model.speed.ttft != null ? `${model.speed.ttft}s` : "—" },
        {
          label: "Pesos",
          value:
            model.weightType === "PROPRIETARY"
              ? "Propietarios"
              : `Abiertos · ${model.license}${model.hasOsiLicense ? " (OSI)" : " (restringida)"}`,
        },
        { label: "Self-hosting", value: model.supportsSelfHosting ? "Sí" : "No" },
        { label: "Streaming", value: model.supportsStreaming ? "Sí" : "No" },
        { label: "JSON mode", value: model.supportsJSONMode ? "Sí" : "No" },
        { label: "Prompt caching", value: model.supportsCaching ? "Sí" : "No" },
        { label: "Input cacheado", value: apiPricing?.cachedInputPer1M != null ? `$${apiPricing.cachedInputPer1M}/1M` : "—" },
        {
          label: "Estado",
          value:
            model.lifecycle.status === "GA"
              ? "GA"
              : model.lifecycle.status === "PREVIEW"
                ? "Preview"
                : model.lifecycle.status === "LEGACY"
                  ? "Heredado"
                  : "Obsoleto",
        },
      ];

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Ficha técnica</h3>
      <dl className="mt-4 divide-y divide-border/60">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd
              className={
                practical
                  ? "text-right text-xs font-medium"
                  : "tabular text-right font-mono text-xs"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * Comparativa multi-proveedor desplegable por modelo.
 * Muestra qué proveedor ofrece mejor latencia, menor precio o mayor
 * cuantización.
 */
export function ProviderComparison({ model }: { model: EnrichedModel }) {
  const { mode } = useMode();
  const practical = mode === "practical";

  const rows = [
    ...model.apiChannels.map((c) => ({
      provider: c.name,
      kind: "API oficial" as const,
      input: c.inputPricePer1M ?? null,
      output: c.outputPricePer1M ?? null,
      tps: c.throughputTps ?? null,
      ttft: c.ttftSeconds ?? null,
      quantization: c.quantization ?? "—",
    })),
    ...model.providerOffers.map((o) => ({
      provider: o.providerName,
      kind: "Agregador" as const,
      input: o.inputPricePer1M ?? null,
      output: o.outputPricePer1M ?? null,
      tps: o.throughputTps ?? null,
      ttft: o.ttftSeconds ?? null,
      quantization: o.quantization ?? "—",
    })),
  ];

  if (rows.length < 2) return null;

  const cheapest = rows.reduce(
    (best, r) => {
      const rCost = (r.input ?? 0) + (r.output ?? 0);
      const bestCost = (best.input ?? 0) + (best.output ?? 0);
      return rCost < bestCost ? r : best;
    },
    rows[0],
  );
  const fastest = rows.reduce(
    (best, r) => ((r.tps ?? 0) > (best.tps ?? 0) ? r : best),
    rows[0],
  );
  const lowestLatency = rows.reduce(
    (best, r) => {
      const rTtft = r.ttft ?? Number.POSITIVE_INFINITY;
      const bestTtft = best.ttft ?? Number.POSITIVE_INFINITY;
      return rTtft < bestTtft ? r : best;
    },
    rows[0],
  );

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Comparativa multi-proveedor</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        El mismo modelo, servido por distintos proveedores.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60">
              <th className="py-2 text-left font-medium text-muted-foreground">
                Proveedor
              </th>
              <th className="py-2 text-right font-medium text-muted-foreground">
                In $/1M
              </th>
              <th className="py-2 text-right font-medium text-muted-foreground">
                Out $/1M
              </th>
              <th className="py-2 text-right font-medium text-muted-foreground">
                tok/s
              </th>
              <th className="py-2 text-right font-medium text-muted-foreground">
                TTFT
              </th>
              <th className="py-2 text-right font-medium text-muted-foreground">
                Cuant.
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.provider} className="border-b border-border/30 last:border-0">
                <td className="py-2">
                  <span className="font-medium">{row.provider}</span>
                  {practical ? (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">
                      {row.kind}
                    </span>
                  ) : null}
                </td>
                <td className="tabular py-2 text-right">
                  {row.input != null ? (
                    <span className={row === cheapest ? "font-semibold text-[var(--chart-5)]" : ""}>
                      ${row.input}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular py-2 text-right">
                  {row.output != null ? `$${row.output}` : "—"}
                </td>
                <td className="tabular py-2 text-right">
                  {row.tps != null ? (
                    <span className={row === fastest ? "font-semibold text-[var(--chart-1)]" : ""}>
                      {row.tps}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular py-2 text-right">
                  {row.ttft != null ? (
                    <span className={row === lowestLatency ? "font-semibold text-[var(--chart-2)]" : ""}>
                      {row.ttft}s
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="tabular py-2 text-right text-muted-foreground">
                  {row.quantization}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <Legend color="text-[var(--chart-5)]">
          Mejor precio: {cheapest.provider}
        </Legend>
        <Legend color="text-[var(--chart-1)]">
          Más rápido: {fastest.provider}
        </Legend>
        <Legend color="text-[var(--chart-2)]">
          Menor latencia: {lowestLatency.provider}
        </Legend>
      </div>
    </Card>
  );
}

function Legend({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("font-semibold", color)}>●</span>
      {children}
    </span>
  );
}
