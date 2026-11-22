"use client";

import * as React from "react";

export type ViewMode = "practical" | "technical";

interface ModeContextValue {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggle: () => void;
}

const ModeContext = React.createContext<ModeContextValue | null>(null);

const STORAGE_KEY = "ai-recommender:view-mode";

/**
 * Suscripción al almacenamiento local.
 *
 * Usamos `useSyncExternalStore` en lugar de un `useEffect` con `setState`:
 * leer el estado persistido no es un "efecto de sincronización", es leer
 * una fuente externa, y esta API lo hace sin renderizados en cascada y sin
 * desajustes de hidratación (el servidor devuelve `defaultMode` y el
 * cliente se re-suscribe tras el montaje).
 */
function subscribeToStoredMode(callback: () => void) {
  window.addEventListener("storage", callback);
  // Evento propio para notificar cambios hecho en la misma pestaña.
  window.addEventListener(MODE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(MODE_EVENT, callback);
  };
}

const MODE_EVENT = "ai-recommender:mode-change";

function readStoredMode(): ViewMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "practical" || stored === "technical") return stored;
  } catch {
    // localStorage bloqueado (modo privado) — se usa el default.
  }
  return "practical";
}

function writeStoredMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // La sesión funciona igual sin persistencia.
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}

/**
 * Interruptor global de complejidad ("Modo Práctico" vs "Modo Técnico").
 *
 * Persistencia en localStorage. Se aplica un atributo `data-mode` en <html>
 * para que el CSS pueda reaccionar sin depender del cliente.
 */
export function ModeProvider({
  children,
  defaultMode = "practical",
}: {
  children: React.ReactNode;
  defaultMode?: ViewMode;
}) {
  const [override, setOverride] = React.useState<ViewMode | null>(null);

  const storedMode = React.useSyncExternalStore(
    subscribeToStoredMode,
    readStoredMode,
    () => defaultMode,
  );

  const mode = override ?? storedMode;

  const setMode = React.useCallback((next: ViewMode) => {
    setOverride(next);
    writeStoredMode(next);
    document.documentElement.dataset.mode = next;
  }, []);

  const toggle = React.useCallback(() => {
    setMode(mode === "practical" ? "technical" : "practical");
  }, [mode, setMode]);

  // Refleja el modo en <html> sin esperar al primer render de cliente.
  React.useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const value = React.useMemo(
    () => ({ mode, setMode, toggle }),
    [mode, setMode, toggle],
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

/** Hook de acceso al modo global. */
export function useMode(): ModeContextValue {
  const context = React.useContext(ModeContext);
  if (!context) {
    throw new Error("useMode debe usarse dentro de <ModeProvider>");
  }
  return context;
}
