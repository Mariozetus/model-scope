/**
 * Formateadores compartidos por la UI.
 */

/** Tokens legibles: 200000 → "200k". */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null) return "—";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return String(tokens);
}

/** Dinero en USD. */
export function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount === 0) return "Gratis";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  if (amount % 1 === 0) return `$${amount.toFixed(0)}`;
  return `$${amount.toFixed(2)}`;
}

/** Número con separador de miles en formato español. */
export function formatNumber(n: number): string {
  return n.toLocaleString("es-ES");
}

/** Porcentaje con decimales opcionales. */
export function formatPercent(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Fecha ISO → "12 mar 2025". */
export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
