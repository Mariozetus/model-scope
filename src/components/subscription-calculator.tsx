"use client";

import * as React from "react";
import { Check, TrendingDown, Wallet, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMoney, formatNumber } from "@/lib/format";
import {
  DEFAULT_SESSION_TURNS,
  SESSION_TURNS_RANGE,
  WORK_PROFILES,
  WORK_PROFILE_KEYS,
  type WorkProfileKey,
} from "@/lib/domain/constants";
import { calculateSubscriptionVsUsage } from "@/lib/calculator/subscription-vs-usage";
import { analyzeQuota } from "@/lib/calculator/quota";
import type { EnrichedModel } from "@/data/models";
import { getCheapestApiPricing, getCheapestSubscription } from "@/data/models";
import { useMode } from "@/components/providers/mode-provider";

/**
 * Módulo C — Calculadora "¿Suscripción o Pago por Uso?".
 *
 * El usuario declara TRABAJO (perfil, frecuencia, cómo consume el material),
 * no tokens. Los tokens son la unidad interna del cálculo y la unidad de
 * medida del precio, nunca la unidad de una capacidad (ADR 017).
 */
export function SubscriptionCalculator({
  models,
}: {
  models: EnrichedModel[];
}) {
  const { mode } = useMode();
  const practical = mode === "practical";

  const [modelSlug, setModelSlug] = React.useState<string>(
    models[0]?.slug ?? "",
  );
  const [messagesPerDay, setMessagesPerDay] = React.useState(20);
  const [profile, setProfile] = React.useState<WorkProfileKey>("code-review");
  const [workingDays, setWorkingDays] = React.useState(22);
  const [sessionTurns, setSessionTurns] = React.useState(DEFAULT_SESSION_TURNS);

  const model = models.find((m) => m.slug === modelSlug) ?? models[0];

  const subscription = model ? getCheapestSubscription(model) : undefined;
  const apiPricing = model ? getCheapestApiPricing(model) : null;

  const result = React.useMemo(() => {
    if (!model || !subscription || !apiPricing) return null;
    return calculateSubscriptionVsUsage(
      {
        messagesPerDay,
        profile,
        workingDaysPerMonth: workingDays,
        sessionTurns,
      },
      {
        monthlyPrice: subscription.monthlyPrice ?? 0,
        annualPrice: subscription.annualPrice,
        quotaLevel: subscription.quotaLevel,
        quotaKind: subscription.quotaKind,
        quotaResetPeriod: subscription.quotaResetPeriod,
        estimatedMessageCap: subscription.estimatedMessageCap,
        resetWindowHours: subscription.resetWindowHours,
        fallbackModelOnLimit: subscription.fallbackModelOnLimit,
        includedTools: subscription.includedTools,
        freeTier: subscription.freeTier,
        freeTierQuotaNote: subscription.freeTierQuotaNote,
      },
      apiPricing,
      {
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        name: model.name,
      },
    );
  }, [
    model,
    subscription,
    apiPricing,
    messagesPerDay,
    profile,
    workingDays,
    sessionTurns,
  ]);

  const quota = React.useMemo(() => {
    if (!subscription) return null;
    return analyzeQuota(subscription, messagesPerDay);
  }, [subscription, messagesPerDay]);

  if (!model || !subscription || !apiPricing || !result) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Este modelo no tiene suscripción oficial comparables. Prueba con
          otro modelo del catálogo.
        </p>
      </Card>
    );
  }

  const winner = result.recommendation.winner;
  const subscriptionWins = winner === "subscription";
  const usageWins = winner === "usage";

  return (
    <section id="calculadora" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          ¿Suscripción o pago por uso?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajusta tu consumo real y te decimos qué te sale más rentable.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* ── Controles ── */}
        <Card className="space-y-6 p-5">
          <div className="space-y-2">
            <Label htmlFor="calc-model">Modelo</Label>
            <Select
              value={modelSlug}
              onValueChange={(v) => {
                if (v) setModelSlug(v);
              }}
            >
              <SelectTrigger id="calc-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.slug}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frecuencia */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="freq">Mensajes al día</Label>
              <span className="tabular text-sm font-semibold">
                {messagesPerDay}
              </span>
            </div>
            <Slider
              id="freq"
              min={5}
              max={100}
              step={5}
              value={messagesPerDay}
              onValueChange={(v) => setMessagesPerDay(v as number)}
            />
            <p className="text-xs text-muted-foreground">
              {formatNumber(messagesPerDay * workingDays)} mensajes al mes
              ({workingDays} días laborables)
            </p>
          </div>

          {/* Perfil de trabajo: QUÉ haces y con CUÁNTO material */}
          <div className="space-y-3">
            <Label htmlFor="profile">¿Qué tipo de trabajo haces?</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {WORK_PROFILE_KEYS.map((key, index) => {
                const item = WORK_PROFILES.find((p) => p.key === key)!;
                const active = profile === key;
                return (
                  <button
                    key={key}
                    type="button"
                    id={index === 0 ? "profile" : undefined}
                    onClick={() => setProfile(key)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    <div className="text-xs font-medium leading-tight">
                      {item.label}
                    </div>
                    {/* La referencia: sin ella, las cifras no significan nada */}
                    <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {item.reference}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tamaño de sesión — solo en Modo Técnico (ADR 018) */}
          {!practical && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="turns">Intercambios por sesión</Label>
                <span className="tabular text-sm font-semibold">
                  {sessionTurns}
                </span>
              </div>
              <Slider
                id="turns"
                min={SESSION_TURNS_RANGE.min}
                max={SESSION_TURNS_RANGE.max}
                step={SESSION_TURNS_RANGE.step}
                value={sessionTurns}
                onValueChange={(v) => setSessionTurns(v as number)}
              />
              <p className="text-xs text-muted-foreground">
                Una sesión es un bloque de intercambios sobre un tema, en una
                conversación. Define cuánto material cabe antes de que la
                conversación se agote.
              </p>
            </div>
          )}

          {/* Días laborables */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="days">Días laborables al mes</Label>
              <span className="tabular text-sm font-semibold">
                {workingDays}
              </span>
            </div>
            <Slider
              id="days"
              min={15}
              max={31}
              step={1}
              value={workingDays}
              onValueChange={(v) => setWorkingDays(v as number)}
            />
          </div>
        </Card>

        {/* ── Resultado ── */}
        <div className="space-y-4">
          {/* Veredicto */}
          <Card
            className={cn(
              "p-5",
              subscriptionWins && "border-[var(--chart-5)]/50",
              usageWins && "border-primary/50",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "rounded-full p-2",
                  subscriptionWins
                    ? "bg-[var(--chart-5)]/12 text-[var(--chart-5)]"
                    : usageWins
                      ? "bg-primary/12 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {subscriptionWins ? (
                  <Wallet className="size-4" aria-hidden />
                ) : usageWins ? (
                  <TrendingDown className="size-4" aria-hidden />
                ) : (
                  <Check className="size-4" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">
                  {subscriptionWins
                    ? `Te sale mejor la suscripción (${subscription.name})`
                    : usageWins
                      ? `Te sale mejor el pago por uso`
                      : "Empate técnico"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.recommendation.reason}
                </p>
                {result.recommendation.savingsPerMonth > 0 && (
                  <Badge variant="secondary" className="tabular mt-2">
                    Ahorro: {formatMoney(result.recommendation.savingsPerMonth)}/
                    mes
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Comparativa lado a lado */}
          <div className="grid gap-4 sm:grid-cols-2">
            <CostPanel
              title="Suscripción oficial"
              subtitle={subscription.name}
              monthlyCost={result.subscription.monthlyCost}
              perMessage={result.subscription.effectiveCostPerMessage}
              details={[
                result.subscription.quotaLimited
                  ? `${formatNumber(result.subscription.messagesPerMonthCapacity ?? 0)} msgs/mes de cuota`
                  : quota?.levelLabel ?? "Límite no publicado",
                result.subscription.overflowMessages > 0
                  ? `${formatNumber(result.subscription.overflowMessages)} msgs degradan a ${subscription.fallbackModelOnLimit ?? "modelo reducido"}`
                  : result.subscription.hasRealLimit
                    ? "Sin degradación por cuota con este volumen"
                    : "Sin degradación por cuota",
                result.subscription.includedTools.length > 0
                  ? `Incluye: ${result.subscription.includedTools.join(", ")}`
                  : "Sin herramientas extra",
              ]}
              highlighted={subscriptionWins}
            />

            <CostPanel
              title="Pago por uso (API)"
              subtitle={`${model.name} · mejor precio disponible`}
              monthlyCost={result.usage.monthlyCost}
              perMessage={result.usage.costPerMessage}
              details={[
                `Le envías: $${apiPricing.inputPer1M} por millón de tokens`,
                `Te devuelve: $${apiPricing.outputPer1M} por millón de tokens`,
                `${formatNumber(result.usage.tokensPerMonth)} tokens al mes`,
              ]}
              highlighted={usageWins}
            />
          </div>

          {/* ¿QUÉ RESTRICCIÓN TE VA A FRENAR? (ADR 018) */}
          <Card
            className={cn(
              "p-4",
              result.binding.constraint === "quota" &&
                "border-[var(--privacy-caution)]/50",
              result.binding.constraint === "context" &&
                "border-[var(--chart-2)]/50",
            )}
          >
            <h4 className="text-xs font-semibold text-muted-foreground">
              ¿Qué te va a frenar?
            </h4>
            <p className="mt-2 text-sm">{result.binding.labelEs}</p>

            {/* Sesiones: la unidad de trabajo (ADR 018) */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Figure
                label="Sesiones por conversación"
                value={
                  result.context.sessionsPerConversation != null
                    ? `~${formatNumber(result.context.sessionsPerConversation)}`
                    : "—"
                }
                hint={
                  result.context.fitDetail ||
                  `De "${WORK_PROFILES.find((p) => p.key === profile)?.label}"`
                }
              />
              <Figure
                label="Tokens por sesión"
                value={`~${formatNumber(result.context.tokensPerSession)}`}
                hint={`${sessionTurns} intercambios`}
              />
            </div>

            {result.context.fitLevel === "DOES_NOT_FIT" && (
              <p className="mt-3 text-xs font-medium text-[var(--privacy-caution)]">
                {result.context.fitLabel}
              </p>
            )}
          </Card>

          {/* Aviso de cuota */}
          {quota && !practical && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-xs",
                quota.degraded
                  ? "border-[var(--privacy-caution)]/50 bg-[var(--privacy-caution)]/8"
                  : "border-border bg-muted/40",
              )}
            >
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  quota.degraded
                    ? "text-[var(--privacy-caution)]"
                    : "text-muted-foreground",
                )}
                aria-hidden
              />
              <span className="text-muted-foreground">{quota.labelEs}</span>
            </div>
          )}

          {/* Mensajes por dólar */}
          <Card className="p-4">
            <h4 className="text-xs font-semibold text-muted-foreground">
              Mensajes reales por cada dólar
            </h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Figure
                label="Suscripción"
                value={
                  result.subscription.quotaLimited
                    ? `${formatNumber(
                        Math.round(result.messagesPerDollar.subscription),
                      )} msgs/$`
                    : "Ilimitado"
                }
                hint={
                  result.subscription.quotaLimited
                    ? "limitado por la cuota del plan"
                    : "sin límite de cuota"
                }
              />
              <Figure
                label="Pago por uso"
                value={`${formatNumber(
                  Math.round(result.messagesPerDollar.usage),
                )} msgs/$`}
                hint={`${formatMoney(result.usage.costPerMessage)} por mensaje`}
              />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function CostPanel({
  title,
  subtitle,
  monthlyCost,
  perMessage,
  details,
  highlighted,
}: {
  title: string;
  subtitle: string;
  monthlyCost: number;
  perMessage: number | null;
  details: string[];
  highlighted: boolean;
}) {
  return (
    <Card
      className={cn(
        "space-y-3 p-4 transition-colors",
        highlighted && "border-primary/60 bg-primary/[0.03]",
      )}
    >
      <div>
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div className="text-sm font-semibold">{subtitle}</div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-2xl font-bold tracking-tight">
          {formatMoney(monthlyCost)}
        </span>
        <span className="text-xs text-muted-foreground">/mes</span>
      </div>
      {perMessage != null && (
        <div className="tabular text-xs text-muted-foreground">
          ≈ {formatMoney(perMessage)} por mensaje
        </div>
      )}
      <ul className="space-y-1 border-t border-border/60 pt-3">
        {details.map((detail) => (
          <li
            key={detail}
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
          >
            <Check className="mt-0.5 size-3 shrink-0 text-[var(--chart-5)]" aria-hidden />
            <span className="min-w-0">{detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="tabular text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
