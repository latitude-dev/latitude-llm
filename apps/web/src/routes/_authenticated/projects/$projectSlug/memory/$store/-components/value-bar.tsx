export function ValueBar({
  fraction,
  muted,
  tone = "primary",
}: {
  readonly fraction: number
  readonly muted?: boolean
  readonly tone?: "primary" | "destructive"
}) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded bg-muted">
      <div
        className={`absolute inset-y-0 left-0 rounded ${
          muted ? "bg-muted-foreground/40" : tone === "destructive" ? "bg-destructive/60" : "bg-primary/70"
        }`}
        style={{ width: `${Math.min(100, Math.max(2, fraction * 100))}%` }}
      />
    </div>
  )
}
