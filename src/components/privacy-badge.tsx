import { ShieldCheck, ShieldAlert, ShieldQuestion, Cpu, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Model } from "@/lib/domain/types";

export type PrivacyLevel = "safe" | "caution" | "unsafe" | "unknown";

/**
 * Semáforo de privacidad: indica si el proveedor usa las conversaciones
 * del usuario para entrenar futuros modelos por defecto.
 */
export function PrivacyBadge({
  trainsOnUserData,
  className,
  compact = false,
}: {
  trainsOnUserData: boolean | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  const level: PrivacyLevel =
    trainsOnUserData === true
      ? "unsafe"
      : trainsOnUserData === false
        ? "safe"
        : "unknown";

  const config = {
    safe: {
      icon: ShieldCheck,
      label: "No entrena con tus chats",
      dot: "bg-[var(--privacy-safe)]",
      text: "text-[var(--privacy-safe)]",
    },
    unsafe: {
      icon: ShieldAlert,
      label: "Entrena con tus chats por defecto",
      dot: "bg-[var(--privacy-unsafe)]",
      text: "text-[var(--privacy-unsafe)]",
    },
    unknown: {
      icon: ShieldQuestion,
      label: "Política de datos no verificada",
      dot: "bg-[var(--privacy-caution)]",
      text: "text-[var(--privacy-caution)]",
    },
  }[level];

  const Icon = config.icon;

  if (compact) {
    return (
      <span
        title={config.label}
        aria-label={config.label}
        className={cn("inline-flex items-center", className)}
      >
        <Icon className={cn("size-3.5", config.text)} aria-hidden />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", config.text)} aria-hidden />
      <span>{config.label}</span>
    </span>
  );
}

/** Punto de color para tablas densas. */
export function PrivacyDot({
  trainsOnUserData,
  className,
}: {
  trainsOnUserData: boolean | null | undefined;
  className?: string;
}) {
  const color =
    trainsOnUserData === true
      ? "bg-[var(--privacy-unsafe)]"
      : trainsOnUserData === false
        ? "bg-[var(--privacy-safe)]"
        : "bg-[var(--privacy-caution)]";

  const title =
    trainsOnUserData === true
      ? "Entrena con tus chats por defecto"
      : trainsOnUserData === false
        ? "No entrena con tus chats por defecto"
        : "Política de datos no verificada";

  return (
    <span
      title={title}
      aria-label={title}
      className={cn("inline-block size-2 rounded-full", color, className)}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// BADGES DE PESOS Y LICENCIA
// ─────────────────────────────────────────────────────────────

/**
 * Distingue tres situaciones que la prensa mezcla constantamente:
 *
 *  - PROPRIETARIO: no hay pesos; solo API o suscripción.
 *  - PESOS ABIERTOS RESTRINGIDOS: pesos descargables, pero con licencia
 *    propietaria que puede imponer condiciones (ej. Llama 4 Community).
 *  - PESOS ABIERTOS PERMISIVOS: licencia OSI (MIT, Apache-2.0) → uso
 *    comercial, modificación y redistribución sin condiciones.
 */
export function WeightBadge({
  weightType,
  license,
  className,
  compact = false,
}: {
  weightType: Model["weightType"];
  license?: string;
  className?: string;
  compact?: boolean;
}) {
  if (weightType === "PROPRIETARY") {
    if (compact) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        <Scale className="size-3 shrink-0" aria-hidden />
        Propietario · sin pesos
      </span>
    );
  }

  const permissive = weightType === "OPEN_WEIGHTS_PERMISSIVE";

  if (compact) {
    return (
      <span
        title={
          permissive
            ? `Pesos abiertos · licencia ${license} (permite uso comercial)`
            : `Pesos abiertos · licencia ${license} (con condiciones)`
        }
        aria-label={
          permissive
            ? `Pesos abiertos con licencia ${license}, permite uso comercial`
            : `Pesos abiertos con licencia ${license}, con condiciones`
        }
        className={cn("inline-flex items-center", className)}
      >
        <Scale
          className={cn(
            "size-3.5",
            permissive
              ? "text-[var(--chart-5)]"
              : "text-[var(--privacy-caution)]",
          )}
          aria-hidden
        />
      </span>
    );
  }

  return (
    <span
      title={
        permissive
          ? `Licencia ${license}: permite uso comercial, modificación y redistribución`
          : `Licencia ${license}: pesos descargables pero con condiciones de uso`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        permissive
          ? "border-[var(--chart-5)]/30 bg-[var(--chart-5)]/10 text-[var(--chart-5)]"
          : "border-[var(--privacy-caution)]/30 bg-[var(--privacy-caution)]/10 text-[var(--privacy-caution)]",
        className,
      )}
    >
      <Scale className="size-3 shrink-0" aria-hidden />
      Pesos abiertos · {license}
      {permissive && (
        <span className="opacity-80">· uso comercial libre</span>
      )}
    </span>
  );
}

/** Badge de ejecución local / self-hosted. */
export function LocalBadge({
  vramGb,
  className,
  compact = false,
}: {
  vramGb?: number | null;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        title={
          vramGb
            ? `Se puede ejecutar en local (${vramGb} GB de VRAM recomendados)`
            : "Se puede ejecutar en local"
        }
        aria-label="Se puede ejecutar en local"
        className={cn("inline-flex items-center", className)}
      >
        <Cpu className="size-3.5 text-chart-1" aria-hidden />
      </span>
    );
  }

  return (
    <span
      title="Se puede autoalojar: el modelo se ejecuta en tu propia infraestructura"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-chart-1/30 bg-chart-1/10 px-2 py-0.5 text-[11px] font-medium text-chart-1",
        className,
      )}
    >
      <Cpu className="size-3 shrink-0" aria-hidden />
      Ejecución local
      {vramGb ? ` · ~${vramGb} GB VRAM` : ""}
    </span>
  );
}
