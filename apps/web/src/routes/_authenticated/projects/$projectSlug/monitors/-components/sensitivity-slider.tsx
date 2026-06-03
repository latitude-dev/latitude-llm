import { Slider, Text } from "@repo/ui"

const SENSITIVITY_MIN = 1
const SENSITIVITY_MAX = 6
export const SENSITIVITY_DEFAULT = 3

/**
 * Controlled 1–6 sensitivity slider, shared by the system `issue.escalating`
 * control and the saved-search `expected`-threshold form. The selected value
 * sits centered above a full-width track, with `Sensitive`/`Quiet` end anchors
 * below. `onChange` fires on every drag tick; pass `onCommit` to persist only on release.
 */
export function SensitivitySlider({
  value,
  onChange,
  onCommit,
  disabled,
}: {
  readonly value: number
  readonly onChange: (value: number) => void
  readonly onCommit?: (value: number) => void
  readonly disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Equal-width thirds so the value is centered on the track regardless of
          the side labels' differing widths (justify-between would offset it). */}
      <div className="flex items-center">
        <Text.H6 color="foregroundMuted" noWrap className="flex-1">
          Sensitive
        </Text.H6>
        <Text.H5 display="block" align="center" className="flex-1">
          {value}
        </Text.H5>
        <Text.H6 color="foregroundMuted" noWrap align="right" className="flex-1">
          Quiet
        </Text.H6>
      </div>
      <Slider
        className="w-full"
        min={SENSITIVITY_MIN}
        max={SENSITIVITY_MAX}
        step={1}
        value={[value]}
        {...(disabled ? { disabled: true } : {})}
        onValueChange={([next]) => onChange(next ?? value)}
        {...(onCommit ? { onValueCommit: ([next]: number[]) => onCommit(next ?? value) } : {})}
      />
    </div>
  )
}
