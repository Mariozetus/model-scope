"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import {
  getWorkProfile,
  type WorkProfileKey,
} from "@/lib/domain/constants";
import {
  recommend,
  type BudgetTier,
  type RecommendationCandidate,
  type WizardAnswers,
  type WizardNeed,
} from "@/lib/recommender/wizard";
import type { EnrichedModel } from "@/data/models";
import {
  getCheapestApiPricing,
  getCheapestSubscription,
  getLocalRequirements,
} from "@/data/models";

const STEP_NEED: Array<{
  key: WizardNeed;
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    key: "programar",
    label: "Programar",
    description: "Escribir, revisar y depurar código",
    emoji: "⌨️",
  },
  {
    key: "escribir",
    label: "Escribir y redactar",
    description: "Textos, resúmenes, traducción, tono",
    emoji: "✍️",
  },
  {
    key: "analizar-pdfs",
    label: "Analizar PDFs largos",
    description: "Documentos extensos, informes, contratos",
    emoji: "📄",
  },
  {
    key: "razonar",
    label: "Razonamiento complejo",
    description: "Problemas difíciles, matemática, estrategia",
    emoji: "🧠",
  },
  {
    key: "barato",
    label: "Gratis / Barato",
    description: "Priorizar el precio sobre el máximo rendimiento",
    emoji: "💸",
  },
  {
    key: "local",
    label: "Usar en mi equipo",
    description: "Ejecutarlo en local: privacidad total, sin coste por token",
    emoji: "🖥️",
  },
];

/**
 * Perfil de trabajo: qué hace el usuario y con cuánto material.
 *
 * ADR 021: es un ÚNICO eje. Antes había dos multiplicadores que se
 * contradecían y las cifras no significaban nada para el usuario.
 */
const STEP_PROFILE: Array<{
  key: WorkProfileKey;
  label: string;
  reference: string;
}> = [
  {
    key: "quick-question",
    label: "Preguntas rápidas",
    reference: "«¿Cómo centro un div?» — una duda de 3 líneas",
  },
  {
    key: "code-review",
    label: "Código",
    reference: "un PR de ~500 líneas que revisar o corregir",
  },
  {
    key: "repo-work",
    label: "Repos y documentos",
    reference: "el proyecto entero — decenas de miles de líneas",
  },
];

const STEP_BUDGET: Array<{
  key: BudgetTier;
  label: string;
  description: string;
}> = [
  { key: "free", label: "$0", description: "Solo opciones gratuitas" },
  { key: "under10", label: "Menos de $10", description: "Planes muy económicos" },
  { key: "twenty", label: "~$20", description: "El precio habitual de un plan" },
  { key: "unlimited", label: "Sin límite", description: "Priorizo calidad" },
];

const STEP_PRIVACY: Array<{
  key: WizardAnswers["privacy"];
  label: string;
  description: string;
  emoji: string;
}> = [
  {
    key: "no-importa",
    label: "No me importa",
    description: "Priorizo precio y rendimiento",
    emoji: "🔓",
  },
  {
    key: "me-importa",
    label: "Me importa",
    description: "Que no usen mis chats para entrenar",
    emoji: "🔒",
  },
];

/**
 * Módulo D — Asistente Recomendador (wizard de 3 pasos).
 */
export function RecommenderWizard({
  models,
}: {
  models: EnrichedModel[];
}) {
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<WizardAnswers>({
    need: "programar",
    budget: "twenty",
    privacy: "no-importa",
  });
  const [profile, setProfile] = React.useState<WorkProfileKey>("code-review");
  const [done, setDone] = React.useState(false);

  const candidates = React.useMemo(
    () => buildCandidates(models, profile),
    [models, profile],
  );

  const profiles = React.useMemo(
    () => new Map(models.map((m) => [m.id, m.skills])),
    [models],
  );

  const results = React.useMemo(
    () => (done ? recommend(candidates, answers, profiles, 3) : []),
    [done, candidates, answers, profiles],
  );

  const reset = () => {
    setDone(false);
    setStep(0);
  };

  if (done) {
    return (
      <section id="recomendador" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Tu recomendación
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Las 3 mejores combinaciones de modelo + proveedor para lo que
              has contado.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>
            Empezar de nuevo
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {results.map((result, index) => (
            <Card
              key={`${result.modelId}-${result.channelName}`}
              className={cn(
                "flex flex-col gap-3 p-5",
                index === 0 && "border-primary/60 ring-1 ring-primary/20",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {index === 0 && (
                    <Badge className="mb-2">
                      <Sparkles className="size-3" aria-hidden /> Mejor opción
                    </Badge>
                  )}
                  <Link
                    href={`/modelos/${result.modelSlug}`}
                    className="text-base font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    {result.modelName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {result.laboratoryName} · {result.channelKindLabel}
                  </p>
                </div>
                <span className="tabular shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                  {result.score.toFixed(0)}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="tabular text-xl font-bold">
                  {result.channelKind === "local"
                    ? "$0"
                    : formatMoney(result.monthlyCost)}
                </span>
                {result.channelKind !== "local" && result.monthlyCost > 0 && (
                  <span className="text-xs text-muted-foreground">/mes</span>
                )}
                {result.channelKind === "local" && (
                  <span className="text-xs text-muted-foreground">
                    por token (marginal)
                  </span>
                )}
              </div>

              {result.channelKind === "local" && (
                <div className="rounded-lg border border-chart-1/30 bg-chart-1/[0.06] px-2.5 py-2 text-[11px] text-muted-foreground">
                  {result.localVramGb ? (
                    <>
                      Necesitas{" "}
                      <strong className="tabular font-medium text-foreground">
                        ~{result.localVramGb} GB de VRAM
                      </strong>
                      . Pagas tu hardware, no por token.
                    </>
                  ) : (
                    "Pagas tu hardware, no por token."
                  )}
                </div>
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                {result.why}
              </p>

              <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3">
                <span className="text-xs font-medium">{result.channelName}</span>
                {result.speedLabel && (
                  <Badge variant="outline" className="text-[10px]">
                    {result.speedLabel}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="recomendador" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          ¿Qué modelo necesitas?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuatro preguntas rápidas y te digo qué contratar.
        </p>
      </div>

      {/* Progreso */}
      <div className="flex items-center gap-3">
        <Progress value={((step + 1) / 4) * 100} className="h-1.5 flex-1" />
        <span className="tabular text-xs text-muted-foreground">
          {step + 1} / 4
        </span>
      </div>

      <Card className="p-6">
        {step === 0 && (
          <StepContent
            title="¿Qué necesitas hacer?"
            subtitle="Elige la tarea principal."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STEP_NEED.map((option) => (
                <OptionCard
                  key={option.key}
                  active={answers.need === option.key}
                  emoji={option.emoji}
                  label={option.label}
                  description={option.description}
                  onClick={() =>
                    setAnswers((a) => ({ ...a, need: option.key }))
                  }
                />
              ))}
            </div>
          </StepContent>
        )}

        {step === 1 && (
          <StepContent
            title="¿Con cuánto material trabajas?"
            subtitle="Esto decide cuánto te va a costar y cuántas conversaciones necesitarás."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {STEP_PROFILE.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setProfile(option.key)}
                  aria-pressed={profile === option.key}
                  className={cn(
                    "relative rounded-xl border p-4 text-left transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    profile === option.key
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  {profile === option.key && (
                    <span className="absolute top-3 right-3 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <Check className="size-3" aria-hidden />
                    </span>
                  )}
                  <div className="text-sm font-semibold">{option.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {option.reference}
                  </div>
                </button>
              ))}
            </div>
          </StepContent>
        )}

        {step === 2 && (
          <StepContent
            title="¿Cuánto quieres gastar al mes?"
            subtitle="Solo es una guía: ajustaremos el cálculo a tu uso real."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEP_BUDGET.map((option) => (
                <OptionCard
                  key={option.key}
                  active={answers.budget === option.key}
                  label={option.label}
                  description={option.description}
                  onClick={() =>
                    setAnswers((a) => ({ ...a, budget: option.key }))
                  }
                />
              ))}
            </div>
          </StepContent>
        )}

        {step === 3 && (
          <StepContent
            title="¿Te importa la privacidad de tus datos?"
            subtitle="Si el proveedor entrena con tus conversaciones, lo sabrás."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {STEP_PRIVACY.map((option) => (
                <OptionCard
                  key={option.key}
                  active={answers.privacy === option.key}
                  emoji={option.emoji}
                  label={option.label}
                  description={option.description}
                  onClick={() =>
                    setAnswers((a) => ({ ...a, privacy: option.key }))
                  }
                />
              ))}
            </div>
          </StepContent>
        )}

        {/* Navegación */}
        <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Atrás
          </Button>

          {step < 3 ? (
            <Button onClick={() => setStep((s) => Math.min(3, s + 1))}>
              Siguiente
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={() => setDone(true)}>
              <Sparkles className="size-4" aria-hidden />
              Ver recomendación
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
}

function StepContent({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function OptionCard({
  active,
  label,
  description,
  emoji,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  emoji?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative rounded-xl border p-4 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      {active && (
        <span className="absolute top-3 right-3 rounded-full bg-primary p-0.5 text-primary-foreground">
          <Check className="size-3" aria-hidden />
        </span>
      )}
      <div className="text-sm font-semibold">
        {emoji && <span aria-hidden>{emoji} </span>}
        {label}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

/**
 * Construye los candidatos del recomendador: cada modelo × sus vías de acceso
 * (suscripción oficial y API barata), con su coste mensual estimado.
 *
 * ADR 023: el recomendador es la puerta de entrada del comparador. El coste
 * de la vía API se estima con el perfil de trabajo declarado, no con una
 * constante — así el ranking refleja el trabajo que el usuario hace.
 */
function buildCandidates(
  models: EnrichedModel[],
  profile: WorkProfileKey,
): RecommendationCandidate[] {
  const candidates: RecommendationCandidate[] = [];
  const work = getWorkProfile(profile);

  for (const model of models) {
    const subscription = getCheapestSubscription(model);
    const apiPricing = getCheapestApiPricing(model);

    if (subscription && subscription.monthlyPrice != null) {
      candidates.push({
        modelId: model.id,
        modelName: model.name,
        laboratoryName: model.laboratoryName,
        modelSlug: model.slug,
        channelKind: "subscription",
        channelKindLabel: "Suscripción oficial",
        channelName: subscription.name,
        monthlyCost: subscription.monthlyPrice,
        privacySafe: subscription.trainsOnUserDataByDefault === false,
        speedLabel: model.speed.labelEs,
        contextLabel: model.materialCapacity?.label ?? model.capacity.shortLabel,
      });
    }

    if (apiPricing) {
      // Coste mensual estimado de la API con el perfil de trabajo declarado:
      // 20 mensajes/día × 22 días.
      const messagesPerMonth = 20 * 22;
      const monthlyCost =
        (messagesPerMonth * work.inputTokens / 1_000_000) *
          apiPricing.inputPer1M +
        (messagesPerMonth * work.outputTokens / 1_000_000) *
          apiPricing.outputPer1M;

      candidates.push({
        modelId: model.id,
        modelName: model.name,
        laboratoryName: model.laboratoryName,
        modelSlug: model.slug,
        channelKind: "api",
        channelKindLabel: "Pago por uso",
        channelName: "API (precio más bajo disponible)",
        monthlyCost: Math.round(monthlyCost * 100) / 100,
        privacySafe: true,
        speedLabel: model.speed.labelEs,
        contextLabel: model.materialCapacity?.label ?? model.capacity.shortLabel,
      });
    }

    // Opción local / autoalojada (solo modelos con pesos abiertos).
    const localChannel = model.localChannels?.[0];
    if (localChannel) {
      const req = getLocalRequirements(model);
      candidates.push({
        modelId: model.id,
        modelName: model.name,
        laboratoryName: model.laboratoryName,
        modelSlug: model.slug,
        channelKind: "local",
        channelKindLabel: "Ejecución local",
        channelName: localChannel.name,
        // El coste marginal por token es cero; el hardware se paga aparte.
        monthlyCost: 0,
        privacySafe: true,
        speedLabel: model.speed.labelEs,
        contextLabel: model.materialCapacity?.label ?? model.capacity.shortLabel,
        localVramGb: req?.recommendedVramGb ?? req?.minVramGb ?? null,
        license: model.license,
      });
    }
  }

  return candidates;
}
