"use client";

import * as React from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PrivacyDot, WeightBadge, LocalBadge } from "@/components/privacy-badge";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/format";
import type { EnrichedModel } from "@/data/models";
import {
  getCheapestApiPricing,
  getCheapestSubscription,
  getLocalRequirements,
} from "@/data/models";

type SortKey =
  | "name"
  | "quality"
  | "code"
  | "reasoning"
  | "writing"
  | "inputPrice"
  | "outputPrice"
  | "tps"
  | "ttft"
  | "context"
  | "subscriptionPrice"
  | "privacy"
  | "weights"
  | "local";

type SortDirection = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: "left" | "right" | "center";
  /** Valor para ordenar. null si no aplica. */
  value: (m: EnrichedModel) => number | string | null;
  render: (m: EnrichedModel) => React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  {
    key: "name",
    label: "Modelo",
    align: "left",
    value: (m) => m.name,
    render: (m) => (
      <div className="min-w-0">
        <Link
          href={`/modelos/${m.slug}`}
          className="font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {m.name}
        </Link>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{m.laboratoryName}</span>
          {m.weightType !== "PROPRIETARY" && (
            <WeightBadge
              weightType={m.weightType}
              license={m.license}
              compact
            />
          )}
          {m.canSelfHost && (
            <LocalBadge
              vramGb={getLocalRequirements(m)?.recommendedVramGb}
              compact
            />
          )}
        </div>
      </div>
    ),
  },
  {
    key: "quality",
    label: "Quality Index",
    align: "right",
    value: (m) => m.qualityIndex,
    render: (m) => (
      <span className="tabular font-semibold">{m.qualityIndex.toFixed(0)}</span>
    ),
  },
  {
    key: "code",
    label: "Código",
    align: "right",
    value: (m) => m.skills.code,
    render: (m) => <span className="tabular">{m.skills.code.toFixed(1)}</span>,
  },
  {
    key: "reasoning",
    label: "Razonam.",
    align: "right",
    value: (m) => m.skills.reasoning,
    render: (m) => (
      <span className="tabular">{m.skills.reasoning.toFixed(1)}</span>
    ),
  },
  {
    key: "writing",
    label: "Redacción",
    align: "right",
    value: (m) => m.skills.writing,
    render: (m) => <span className="tabular">{m.skills.writing.toFixed(1)}</span>,
  },
  {
    key: "inputPrice",
    label: "In $/1M",
    align: "right",
    value: (m) => getCheapestApiPricing(m)?.inputPer1M ?? null,
    render: (m) => {
      const p = getCheapestApiPricing(m);
      return p ? (
        <span className="tabular">${p.inputPer1M}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    key: "outputPrice",
    label: "Out $/1M",
    align: "right",
    value: (m) => getCheapestApiPricing(m)?.outputPer1M ?? null,
    render: (m) => {
      const p = getCheapestApiPricing(m);
      return p ? (
        <span className="tabular">${p.outputPer1M}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    key: "subscriptionPrice",
    label: "Suscripción",
    align: "right",
    value: (m) => getCheapestSubscription(m)?.monthlyPrice ?? null,
    render: (m) => {
      const s = getCheapestSubscription(m);
      return s?.monthlyPrice != null ? (
        <span className="tabular">${s.monthlyPrice}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    key: "tps",
    label: "tok/s",
    align: "right",
    value: (m) => m.speed.tps,
    render: (m) =>
      m.speed.tps != null ? (
        <span className="tabular">{m.speed.tps}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "ttft",
    label: "TTFT",
    align: "right",
    value: (m) => m.speed.ttft,
    render: (m) =>
      m.speed.ttft != null ? (
        <span className="tabular">{m.speed.ttft}s</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "context",
    label: "Context",
    align: "right",
    value: (m) => m.contextWindow ?? null,
    render: (m) => (
      <span className="tabular">
        {m.contextWindow != null ? formatTokens(m.contextWindow) : "—"}
      </span>
    ),
  },
  {
    key: "weights",
    label: "Licencia",
    align: "left",
    value: (m) => m.license ?? "Propietaria",
    render: (m) =>
      m.weightType === "PROPRIETARY" ? (
        <span className="text-muted-foreground">Propietaria</span>
      ) : (
        <span
          className={cn(
            "font-mono text-[10px]",
            m.hasOsiLicense
              ? "text-[var(--chart-5)]"
              : "text-[var(--privacy-caution)]",
          )}
          title={
            m.hasOsiLicense
              ? "Licencia OSI: uso comercial libre"
              : "Licencia con condiciones: revisa antes de uso comercial"
          }
        >
          {m.license}
        </span>
      ),
  },
  {
    key: "local",
    label: "VRAM local",
    align: "right",
    value: (m) => getLocalRequirements(m)?.recommendedVramGb ?? null,
    render: (m) => {
      const req = getLocalRequirements(m);
      if (!req?.recommendedVramGb) {
        return <span className="text-muted-foreground">—</span>;
      }
      return (
        <span className="tabular" title="VRAM recomendada para autoalojar">
          {req.recommendedVramGb} GB
        </span>
      );
    },
  },
  {
    key: "privacy",
    label: "Privacidad",
    align: "center",
    value: (m) =>
      getCheapestSubscription(m)?.trainsOnUserDataByDefault === true ? 1 : 0,
    render: (m) => (
      <PrivacyDot
        trainsOnUserData={
          getCheapestSubscription(m)?.trainsOnUserDataByDefault
        }
      />
    ),
  },
];

/**
 * Tabla densa y ordenable — Modo Técnico del Módulo A.
 */
export function TechnicalTable({ models }: { models: EnrichedModel[] }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("quality");
  const [sortDir, setSortDir] = React.useState<SortDirection>("desc");

  const sorted = React.useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[1];
    const factor = sortDir === "asc" ? 1 : -1;

    return [...models].sort((a, b) => {
      const av = column.value(a);
      const bv = column.value(b);

      // Los nulos siempre al final, en ambas direcciones.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv, "es") * factor;
      }
      return ((av as number) - (bv as number)) * factor;
    });
  }, [models, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Texto ascendente, números descendente (más útil por defecto).
      const column = COLUMNS.find((c) => c.key === key);
      const isText = column ? typeof column.value(models[0] ?? {}) === "string" : false;
      setSortDir(isText ? "asc" : "desc");
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map((column) => {
              const active = sortKey === column.key;
              return (
                <TableHead
                  key={column.key}
                  className={cn(
                    "whitespace-nowrap text-xs",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm transition-colors",
                      "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "text-foreground",
                    )}
                    aria-label={`Ordenar por ${column.label}`}
                  >
                    {column.label}
                    <span
                      className={cn(
                        "text-[9px] transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    >
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((model) => (
            <TableRow key={model.id} className="hover:bg-muted/40">
              {COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "py-2.5 text-xs",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                >
                  {column.render(model)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
