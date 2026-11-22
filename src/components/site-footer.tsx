export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">ModelScope</p>
            <p className="mt-1 max-w-prose text-xs text-muted-foreground">
              Comparador independiente de modelos de IA. No estamos
              afiliados a ningún laboratorio ni proveedor.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-[var(--privacy-caution)]">
                ⚠ Datos de referencia
              </span>{" "}
              — precios y benchmarks de muestra del MVP. Conecta una fuente
              real (OpenRouter / Artificial Analysis) antes de publicar.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
