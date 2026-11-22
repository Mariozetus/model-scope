"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_KEY = "ai-recommender:theme";
const THEME_EVENT = "ai-recommender:theme-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

function readTheme(): "light" | "dark" {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage no disponible.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Toggle de tema claro/oscuro.
 *
 * Sin `next-themes` para mantener las dependencias ligeras. El estado se
 * aplica directamente sobre <html class="dark"> y se persiste en localStorage.
 *
 * `useSyncExternalStore` evita el setState-en-effect y el desajuste de
 * hidratación: el servidor renderiza el icono neutro y el cliente adopta
 * el tema real al suscribirse.
 */
export function ThemeToggle() {
  const theme = React.useSyncExternalStore(
    subscribe,
    readTheme,
    () => "light" as const,
  );

  const isDark = theme === "dark";

  const toggle = () => {
    const next = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Ignorado: el tema funciona igual sin persistencia.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Cambiar tema"
      title="Cambiar tema"
      className="size-8"
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  );
}
