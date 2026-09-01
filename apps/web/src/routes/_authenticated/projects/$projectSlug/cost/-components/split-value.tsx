/**
 * A formatted "$12.34" or "56.1%" headline value with its unit muted and the digits
 * left at full contrast. Anything else — a plain count, a ratio, a dash — renders
 * unchanged, so callers can pass any formatter's output through this uniformly.
 */
export function SplitValue({ formatted }: { readonly formatted: string }) {
  if (formatted.startsWith("$")) {
    return (
      <>
        <span className="text-muted-foreground">$</span>
        {formatted.slice(1)}
      </>
    )
  }
  if (formatted.endsWith("%")) {
    return (
      <>
        {formatted.slice(0, -1)}
        <span className="text-muted-foreground">%</span>
      </>
    )
  }
  return <>{formatted}</>
}
