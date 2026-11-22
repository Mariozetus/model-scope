import { cn } from "@/lib/utils";

/**
 * Barra de puntuación 0..10 con degradado.
 *
 * Modo Práctico: barra + etiqueta de percentil en lenguaje llano.
 * Modo Técnico: barra + valor numérico tabulado.
 */
export function ScoreBar({
  value,
  className,
  showValue = true,
  label,
  /** Texto auxiliar a la derecha (ej. "Top 15%"). */
  hint,
}: {
  value: number;
  className?: string;
  showValue?: boolean;
  label?: string;
  hint?: string;
}) {
  const clamped = Math.max(0, Math.min(10, value));
  const pct = (clamped / 10) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      {(label || showValue || hint) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
          )}
          <span className="flex items-baseline gap-1.5">
            {hint && (
              <span className="text-[11px] text-muted-foreground">{hint}</span>
            )}
            {showValue && (
              <span className="tabular text-xs font-semibold">
                {clamped.toFixed(1)}
              </span>
            )}
          </span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-label={label ?? "Puntuación"}
      >
        <div
          className="bar-fill h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
