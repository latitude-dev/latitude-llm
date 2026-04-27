// Shared formatters used by the ink report + any stdout fallback.

export function formatPercent(n: number): string {
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "n/a"
}

export function formatCostUsd(value: number | "unknown"): string {
  return value === "unknown" ? "unknown" : `$${value.toFixed(4)}`
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}
