"use client";

import Link from "next/link";
import { ArrowUpRight, Zap, Gauge, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScoreBar } from "@/components/score-bar";
import { PrivacyBadge, WeightBadge, LocalBadge } from "@/components/privacy-badge";
import { useMode } from "@/components/providers/mode-provider";
import { cn } from "@/lib/utils";
import type { EnrichedModel } from "@/data/models";
import {
  getCheapestApiPricing,
  getCheapestSubscription,
  getLocalRequirements,
} from "@/data/models";
import { formatMoney, formatTokens } from "@/lib/format";

const SKILL_LABELS_PRACTICAL: Record<string, string> = {
  code: "Programación",
  reasoning: "Razonamiento",
  writing: "Redacción",
  languages: "Idiomas",
  "data-analysis": "Análisis de datos",
  "long-context": "Documentos largos",
};

const SKILL_LABELS_TECHNICAL: Record<string, string> = {
  code: "SWE-bench / LCB",
  reasoning: "GPQA / ARC-AGI",
  writing: "Arena Elo",
  languages: "Multilingüe",
  "data-analysis": "Tablas /series",
  "long-context": "RULER 128K",
};

/** Descriptivo del percentil en lenguaje llano. */
function percentileHint(percentile: number | undefined): string | undefined {
  if (percentile == null) return undefined;
  if (percentile >= 0.95) return "Top 5%";
  if (percentile >= 0.85) return "Top 15%";
  if (percentile >= 0.75) return "Top 25%";
  if (percentile >= 0.5) return "En la media";
  if (percentile >= 0.25) return "Por debajo de la media";
  return "En la cola";
}

export function ModelCard({
  model,
  className,
}: {
  model: EnrichedModel;
  className?: string;
}) {
  const { mode } = useMode();
  const practical = mode === "practical";

  const subscription = getCheapestSubscription(model);
  const apiPricing = getCheapestApiPricing(model);
  const local = getLocalRequirements(model);

  const skills = practical
    ? (["code", "reasoning", "writing", "long-context"] as const)
    : (["code", "reasoning", "writing", "long-context"] as const);

  const labels = practical ? SKILL_LABELS_PRACTICAL : SKILL_LABELS_TECHNICAL;

  return (
    <Card
      className={cn(
        "group relative flex flex-col gap-4 p-5 transition-all hover:border-primary/40 hover:shadow-md",
        className,
      )}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/modelos/${model.slug}`}
              className="truncate text-base font-semibold tracking-tight hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {model.name}
            </Link>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{model.laboratoryName}</span>
            {model.weightType !== "PROPRIETARY" && (
              <WeightBadge
                weightType={model.weightType}
                license={model.license}
                compact
              />
            )}
            {model.canSelfHost && (
              <LocalBadge vramGb={local?.recommendedVramGb} compact />
            )}
            {model.lifecycle.status === "LEGACY" && (
              <span className="text-[var(--privacy-caution)]">· heredado</span>
            )}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="tabular shrink-0 font-semibold"
          title={
            practical
              ? "Índice agregado de calidad (0-100)"
              : "Artificial Analysis Quality Index (0-100)"
          }
        >
          {model.qualityIndex.toFixed(0)}
        </Badge>
      </div>

      {/* Descripción */}
      <p
        className={cn(
          "text-sm leading-relaxed text-muted-foreground",
          !practical && "font-mono text-xs",
        )}
      >
        {practical
          ? (model.practicalSummary ?? model.summary)
          : (model.summary ?? model.practicalSummary)}
      </p>

      {/* Métricas clave */}
      <div className="grid grid-cols-3 gap-3 border-y border-border/60 py-3">
        <Metric
          icon={<Zap className="size-3" aria-hidden />}
          label={practical ? "Velocidad" : "Throughput"}
          value={
            practical
              ? model.speed.labelEs
              : model.speed.tps != null
                ? `${model.speed.tps} tok/s`
                : "—"
          }
          hint={
            practical
              ? undefined
              : model.speed.ttft != null
                ? `TTFT ${model.speed.ttft}s`
                : undefined
          }
        />
        <Metric
          icon={<Layers className="size-3" aria-hidden />}
          label={practical ? "Capacidad" : "Context"}
          value={
            practical
              ? model.capacity.shortLabel
              : model.contextWindow != null
                ? formatTokens(model.contextWindow)
                : "—"
          }
          hint={
            practical
              ? undefined
              : model.maxOutputTokens != null
                ? `out ${formatTokens(model.maxOutputTokens)}`
                : undefined
          }
        />
        <Metric
          icon={<Gauge className="size-3" aria-hidden />}
          label={practical ? "Desde" : "API $/1M in/out"}
          value={
            practical
              ? subscription?.monthlyPrice != null
                ? `$${subscription.monthlyPrice}/mes`
                : apiPricing
                  ? `$${apiPricing.inputPer1M}/1M`
                  : model.canSelfHost
                    ? "Gratis (local)"
                    : "—"
              : apiPricing
                ? `$${apiPricing.inputPer1M} / $${apiPricing.outputPer1M}`
                : "—"
          }
          hint={
            practical
              ? subscription?.monthlyPrice != null
                ? "suscripción"
                : apiPricing
                  ? "pago por uso"
                  : model.canSelfHost
                    ? "autoalojado"
                    : undefined
              : apiPricing?.cachedInputPer1M != null
                ? `cached $${apiPricing.cachedInputPer1M}`
                : undefined
          }
        />
      </div>

      {/* Barras de habilidad */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {skills.map((skill) => {
          const raw = model.skills[skill];
          const percentile = model.percentiles[
            skill === "code"
              ? "swe-bench-verified"
              : skill === "reasoning"
                ? "gpqa-diamond"
                : skill === "writing"
                  ? "arena-elo"
                  : "ruler-128k"
          ];
          return (
            <ScoreBar
              key={skill}
              value={raw}
              label={labels[skill]}
              hint={practical ? percentileHint(percentile) : undefined}
            />
          );
        })}
      </div>

      {/* Pie: privacidad */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <PrivacyBadge
          trainsOnUserData={subscription?.trainsOnUserDataByDefault}
        />
        {practical && subscription?.estimatedMessageCap != null && (
          <span className="tabular text-[11px] text-muted-foreground">
            {subscription.estimatedMessageCap} msgs /{" "}
            {subscription.resetWindowHours}h
          </span>
        )}
      </div>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
      {hint && (
        <div className="tabular truncate text-[10px] text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Etiqueta de precio formateada. */
export function priceLabel(monthlyPrice: number): string {
  return formatMoney(monthlyPrice);
}
