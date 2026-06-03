import { type SegmentBarItem, Text } from "@repo/ui"

/**
 * The hover tooltip body shared by the usage (tokens/cost) rows and the duration
 * row: a swatch + label + formatted value per segment, then a Total line and an
 * optional footnote.
 */
export function SegmentBreakdownRows({
  segments,
  formatValue,
  footer,
}: {
  readonly segments: readonly SegmentBarItem[]
  readonly formatValue: (value: number) => string
  readonly footer?: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      {segments.map((s) => (
        <div key={s.label} className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-row items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <Text.H6 color="foregroundMuted">{s.label}</Text.H6>
          </div>
          <Text.H6 color="foreground">{formatValue(s.value)}</Text.H6>
        </div>
      ))}

      <hr className="border-t border-border" />

      <div className="flex flex-row items-center justify-between gap-4">
        <Text.H6 color="foregroundMuted">Total</Text.H6>
        <Text.H6 color="foreground">{formatValue(total)}</Text.H6>
      </div>

      {footer && (
        <Text.H6 color="foregroundMuted" italic>
          {footer}
        </Text.H6>
      )}
    </div>
  )
}
