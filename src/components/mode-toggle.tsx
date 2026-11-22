"use client";

import { cn } from "@/lib/utils";
import { useMode, type ViewMode } from "@/components/providers/mode-provider";

/**
 * Interruptor global Práctico ↔ Técnico.
 *
 * Se muestra en la cabecera, siempre visible, para que el usuario siempre
 * sepa en qué nivel de detalle está viendo los datos.
 */
export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useMode();

  const options: Array<{ value: ViewMode; label: string; hint: string }> = [
    {
      value: "practical",
      label: "Práctico",
      hint: "Lenguaje llano, sin jerga técnica",
    },
    {
      value: "technical",
      label: "Técnico",
      hint: "Precios exactos, benchmarks y latencias",
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Nivel de detalle de la interfaz"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border bg-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => setMode(option.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
