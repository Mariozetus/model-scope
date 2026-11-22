"use client";

import * as React from "react";
import { ModelCard } from "@/components/model-card";
import { TechnicalTable } from "@/components/technical-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMode } from "@/components/providers/mode-provider";
import { cn } from "@/lib/utils";
import type { EnrichedModel } from "@/data/models";
import type { UseCase } from "@/lib/domain/types";

/** Filtros por intención del Modo Práctico (glosario del brief). */
const INTENT_FILTERS: Array<{
  key: UseCase | "all";
  label: string;
  emoji?: string;
}> = [
  { key: "all", label: "Todos" },
  { key: "code", label: "Programar", emoji: "⌨️" },
  { key: "writing", label: "Escribir y redactar", emoji: "✍️" },
  { key: "pdf-analysis", label: "Analizar PDFs largos", emoji: "📄" },
  { key: "reasoning", label: "Razonamiento complejo", emoji: "🧠" },
  { key: "cheap", label: "Gratis / Barato", emoji: "💸" },
  { key: "local", label: "Usar en local", emoji: "🖥️" },
];

/**
 * Módulo A — Catálogo comparativo curado.
 *
 * Filtra por intención (Modo Práctico) o por criterio técnico
 * (Modo Técnico), y alterna entre tarjetas y tabla densa.
 */
export function Catalog({
  featured,
  all,
}: {
  featured: EnrichedModel[];
  all: EnrichedModel[];
}) {
  const { mode } = useMode();
  const practical = mode === "practical";

  const [intent, setIntent] = React.useState<UseCase | "all">("all");
  const [showAll, setShowAll] = React.useState(false);

  const source = showAll ? all : featured;

  const filtered = React.useMemo(() => {
    if (intent === "all") return source;
    return source.filter((m) => m.useCases.includes(intent));
  }, [source, intent]);

  // En modo técnico, el filtro por intención sigue aplicando pero etiquetado
  // por habilidad numérica, no por tag editorial.
  const sorted = React.useMemo(() => {
    if (intent === "all") return filtered;
    const weight: Record<string, keyof EnrichedModel["skills"]> = {
      code: "code",
      writing: "writing",
      "pdf-analysis": "long-context",
      reasoning: "reasoning",
      cheap: "reasoning",
      local: "reasoning",
    };
    const dim = weight[intent];
    return [...filtered].sort((a, b) => b.skills[dim] - a.skills[dim]);
  }, [filtered, intent]);

  return (
    <section id="catalogo" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Comparativa de modelos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {practical
              ? `${sorted.length} modelos seleccionados según tu necesidad`
              : `${sorted.length} modelos · datos técnicos ordenables`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!practical && (
            <Badge variant="outline" className="tabular">
              {filtered.length}/{all.length}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Ver Top destacados" : "Ver todos los modelos"}
          </Button>
        </div>
      </div>

      {/* Filtros por intención */}
      <div className="flex flex-wrap gap-2">
        {INTENT_FILTERS.map((filter) => {
          const active = intent === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setIntent(filter.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {filter.emoji && <span aria-hidden>{filter.emoji} </span>}
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún modelo del catálogo actual cumple este filtro.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setIntent("all")}
          >
            Quitar filtro
          </Button>
        </div>
      ) : practical ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>
      ) : (
        <TechnicalTable models={sorted} />
      )}
    </section>
  );
}
