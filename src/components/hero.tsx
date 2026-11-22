import { ArrowDown, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

/**
 * Portada: explica la propuesta de valor y ancla a las tres secciones
 * principales.
 */
export function Hero({
  stats,
}: {
  stats: { models: number; labs: number; providers: number };
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/70">
      {/* Fondo sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--chart-1)_0%,transparent_55%)] opacity-[0.07]"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <Badge variant="secondary" className="mb-5 gap-1.5">
          <Sparkles className="size-3" aria-hidden />
          {formatNumber(stats.models)} modelos · {stats.labs} laboratorios ·{" "}
          {stats.providers} proveedores
        </Badge>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          El mejor modelo de IA, no el mejor{" "}
          <span className="text-muted-foreground">benchmark</span>
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground text-pretty sm:text-lg">
          Comparamos el rendimiento técnico con la{" "}
          <span className="text-foreground">realidad de lo que vas a pagar</span>{" "}
          y las condiciones de cada suscripción. Porque un modelo que gana las
          tablas puede ser el más caro de tu día a día.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" nativeButton={false} render={<a href="#catalogo" />}>
            Ver comparativa
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href="#calculadora" />}
          >
            <ArrowDown className="size-4" aria-hidden />
            Calcular qué me sale mejor
          </Button>
        </div>

        {/* Las tres promesas */}
        <div className="mt-14 grid gap-6 border-t border-border/60 pt-10 sm:grid-cols-3">
          <Promise
            title="Sin jerga"
            description="Cambia a Modo Práctico y lee: «capaz de leer ~400 páginas», «instantáneo», «top 15%»."
          />
          <Promise
            title="Coste real"
            description="Dinos cuánto usas y te decimos si te conviene una suscripción o el pago por uso."
          />
          <Promise
            title="Contexto y privacidad"
            description="Cuánto cabe de golpe y si el proveedor entrena con tus conversaciones."
          />
        </div>
      </div>
    </section>
  );
}

function Promise({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
