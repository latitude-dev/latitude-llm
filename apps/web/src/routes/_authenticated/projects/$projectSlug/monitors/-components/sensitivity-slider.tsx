import { Slider, Text } from "@repo/ui"
import { HelpTooltip } from "./help-tooltip.tsx"

const SENSITIVITY_MIN = 1
const SENSITIVITY_MAX = 6
export const SENSITIVITY_DEFAULT = 3
const SENSITIVITY_HELP =
  "How far above the learned normal counts as a spike. Lower = more sensitive (alerts on smaller deviations, noisier); higher = quieter."

/**
 * Controlled 1–6 sensitivity slider, shared by the system `issue.escalating`
 * control and the saved-search `expected`-threshold form. `onChange` fires on
 * every drag tick; pass `onCommit` to persist only on release.
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
      <div className="flex items-center gap-1">
        <Text.H6M>Sensitivity</Text.H6M>
        <HelpTooltip>{SENSITIVITY_HELP}</HelpTooltip>
        <Text.H6 color="foregroundMuted">{value}</Text.H6>
      </div>
      <div className="flex items-center gap-3">
        <Text.H6 color="foregroundMuted" noWrap>
          Sensitive
        </Text.H6>
        <Slider
          className="max-w-56"
          min={SENSITIVITY_MIN}
          max={SENSITIVITY_MAX}
          step={1}
          value={[value]}
          {...(disabled ? { disabled: true } : {})}
          onValueChange={([next]) => onChange(next ?? value)}
          {...(onCommit ? { onValueCommit: ([next]: number[]) => onCommit(next ?? value) } : {})}
        />
        <Text.H6 color="foregroundMuted" noWrap>
          Quiet
        </Text.H6>
      </div>
    </div>
  )
}
