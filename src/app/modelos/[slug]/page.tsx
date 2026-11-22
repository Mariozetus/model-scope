import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AccessChannelsTable,
  ProviderComparison,
  SkillRadar,
  SpecSheet,
} from "@/components/model-detail";
import { PrivacyBadge, WeightBadge, LocalBadge } from "@/components/privacy-badge";
import { getModelBySlug, getAllModelsSorted, getLocalRequirements } from "@/data/models";
import { formatDate, formatTokens } from "@/lib/format";

/** Genera las rutas estáticas para todos los modelos del catálogo. */
export function generateStaticParams() {
  return getAllModelsSorted().map((model) => ({ slug: model.slug }));
}

/**
 * La página accede a `params` para resolver el modelo, así que no puede
 * ser un shell instantáneo con Cache Components. Lo declaramos explícito
 * en vez de envolverlo en Suspense: el contenido es una ficha completa,
 * no tiene sentido servir un esqueleto y rellenarlo después.
 */
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/modelos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const model = getModelBySlug(slug);
  if (!model) return { title: "Modelo no encontrado" };

  return {
    title: model.name,
    description:
      model.practicalSummary ??
      model.summary ??
      `Ficha técnica, benchmarks y vías de acceso de ${model.name}.`,
  };
}

export default async function ModelPage({ params }: PageProps<"/modelos/[slug]">) {
  const { slug } = await params;
  const model = getModelBySlug(slug);

  if (!model) notFound();

  const subscription = model.subscriptions?.[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2"
        nativeButton={false}
        render={<Link href="/" />}
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver al catálogo
      </Button>

      {/* Cabecera */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{model.laboratoryName}</Badge>
          <WeightBadge
            weightType={model.weightType}
            license={model.license}
          />
          {model.canSelfHost && (
            <LocalBadge
              vramGb={getLocalRequirements(model)?.recommendedVramGb}
            />
          )}
          {model.releasedAt && (
            <span className="text-xs text-muted-foreground">
              {formatDate(model.releasedAt)}
            </span>
          )}
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {model.name}
        </h1>

        {model.practicalSummary && (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty">
            {model.practicalSummary}
          </p>
        )}

        {subscription && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PrivacyBadge trainsOnUserData={subscription.trainsOnUserDataByDefault} />
            {model.contextWindow != null && (
              <span className="text-xs text-muted-foreground">
                Contexto: {formatTokens(model.contextWindow)} tokens ·{" "}
                {model.capacity.shortLabel}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Cuerpo */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <AccessChannelsTable model={model} />
          <ProviderComparison model={model} />
        </div>

        <aside className="space-y-6">
          <SkillRadar model={model} />
          <SpecSheet model={model} />
        </aside>
      </div>
    </div>
  );
}
