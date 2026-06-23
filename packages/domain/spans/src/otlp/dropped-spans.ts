/**
 * Spans that are pure noise or redundant with data already carried elsewhere,
 * and must not be ingested. Keeping the rules here keeps source-specific quirks
 * out of the generic transform.
 */
const DROPPED_SPANS: ReadonlyArray<{ readonly scope: string; readonly name: string }> = [
  // OpenClaw's diagnostics-otel emits a standalone `openclaw.model.usage` span in
  // its own (unparented) trace, duplicating per-call usage that already rides on
  // the model.call spans inside the run trace (read in resolvers/usage.ts). Drop
  // it so it doesn't surface as an orphan one-span trace/session.
  { scope: "openclaw", name: "openclaw.model.usage" },
]

export function isDroppedSpan(scopeName: string, spanName: string): boolean {
  return DROPPED_SPANS.some((rule) => rule.scope === scopeName && rule.name === spanName)
}
