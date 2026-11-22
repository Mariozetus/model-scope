import Link from "next/link";
import { ArrowRight, Building2, Server } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getLaboratoriesWithModels,
  getProvidersWithModels,
} from "@/data/models";
import { formatTokens } from "@/lib/format";

export const metadata = {
  title: "Laboratorios y proveedores · ModelScope",
  description:
    "Qué modelos publica cada laboratorio y qué ofrece cada proveedor de inferencia o agregador.",
};

/**
 * Módulo E — Índice de laboratorios y proveedores (ADR 022).
 *
 * Es un ÍNDICE de navegación: no expone precios propios ni tablas de precios.
 * Solo responde a dos preguntas: ¿qué modelos da cada laboratorio? y ¿qué
 * ofrece cada proveedor?
 */
export default function LabsAndProvidersPage() {
  const laboratories = getLaboratoriesWithModels();
  const providers = getProvidersWithModels();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Laboratorios y proveedores
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Un <strong>laboratorio</strong> entrena y publica modelos. Un{" "}
          <strong>proveedor</strong> los sirve: agregadores e inferencia que
          te dan acceso a modelos que otros han entrenado.
        </p>
      </header>

      {/* ── Laboratorios ── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Building2 className="size-5" aria-hidden />
          Laboratorios
          <span className="text-sm font-normal text-muted-foreground">
            ({laboratories.length})
          </span>
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {laboratories.map(({ laboratory, models }) => (
            <Card key={laboratory.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{laboratory.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {laboratory.country && `${laboratory.country} · `}
                    {laboratory.foundedYear && `fundado en ${laboratory.foundedYear}`}
                  </p>
                </div>
                <Badge variant="secondary" className="tabular shrink-0">
                  {models.length} modelos
                </Badge>
              </div>

              <ul className="mt-4 space-y-1.5">
                {models.map((model) => (
                  <li key={model.id}>
                    <Link
                      href={`/modelos/${model.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 truncate">{model.name}</span>
                      <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                        {model.contextWindow != null
                          ? `${formatTokens(model.contextWindow)} ctx`
                          : model.weightType === "PROPRIETARY"
                            ? "solo API"
                            : "autoalojable"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {laboratory.websiteUrl && (
                <a
                  href={laboratory.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Sitio oficial
                  <ArrowRight className="size-3" aria-hidden />
                </a>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* ── Proveedores ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Server className="size-5" aria-hidden />
          Proveedores
          <span className="text-sm font-normal text-muted-foreground">
            ({providers.length})
          </span>
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {providers.map(({ provider, models }) => (
            <Card key={provider.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{provider.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {provider.kind === "AGGREGATOR"
                      ? "Agregador: enruta a varios proveedores"
                      : "Proveedor de inferencia"}
                    {provider.focusesOpenWeights && " · pesos abiertos"}
                  </p>
                </div>
                <Badge variant="secondary" className="tabular shrink-0">
                  {models.length} modelos
                </Badge>
              </div>

              <ul className="mt-4 space-y-1.5">
                {models.map((model) => (
                  <li key={model.id}>
                    <Link
                      href={`/modelos/${model.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 truncate">{model.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {model.laboratoryName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {provider.websiteUrl && (
                <a
                  href={provider.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Sitio oficial
                  <ArrowRight className="size-3" aria-hidden />
                </a>
              )}
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
