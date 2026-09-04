import { type FilterSet, SCORE_FILTER_FIELDS } from "@domain/shared"
import { Slider, Text } from "@repo/ui"
import { type RefObject, useMemo, useState } from "react"
import { FilterBuilder } from "../../../../../../../components/filters-builder/filter-builder.tsx"

/**
 * Inline scope editor: which traces the detector runs on (`filters`, optional) and how many of
 * them (`sampling`). Filters use the same builder experiment variants use, so a scope imported from
 * a saved search is editable here instead of carrying fields the editor cannot show. `traces` mode,
 * not `sessions`: the live pre-gate matches the triggering trace, so session-only fields
 * (`moments`, `topics`, `hasLlmActivity`) would never apply. Score filters are excluded for the same
 * reason — the signal's own evaluation is what writes scores, so a session reaching the pre-gate has
 * none to be gated on.
 */
export function SignalScopeEditor({
  projectId,
  value,
  onChange,
  sampling,
  onSamplingChange,
  detectorKind,
}: {
  readonly projectId: string
  readonly value: FilterSet
  readonly onChange: (next: FilterSet) => void
  readonly sampling: number
  readonly onSamplingChange: (next: number) => void
  readonly detectorKind: "rule" | "judge" | "script"
}) {
  const [popoverContainerEl, setPopoverContainerEl] = useState<HTMLDivElement | null>(null)
  const popoverContainerRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({ current: popoverContainerEl }),
    [popoverContainerEl],
  )
  const hasActiveFilters = Object.keys(value).length > 0

  return (
    <div className="relative">
      <div ref={setPopoverContainerEl} aria-hidden className="absolute left-0 top-0" />
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col gap-1">
          <Text.H5>Which sessions should be checked?</Text.H5>
          <Text.H6 color="foregroundMuted">
            {hasActiveFilters
              ? "Only sessions matching these filters run through the evaluation. Everything else is ignored."
              : "Right now every session in your project runs through this evaluation. Add a filter to narrow it down, say only the `checkout` service or a specific model."}
          </Text.H6>
        </div>

        <FilterBuilder
          mode="traces"
          projectId={projectId}
          value={value}
          onChange={onChange}
          excludeFields={SCORE_FILTER_FIELDS}
          portalContainer={popoverContainerRef}
        />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <Text.H5>How many of them?</Text.H5>
            <Text.H5M>{sampling}%</Text.H5M>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[sampling]}
            onValueChange={(values) => onSamplingChange(values[0] ?? 0)}
          />
          <Text.H6 color="foregroundMuted">
            {sampling === 0
              ? "0% pauses this signal, so no sessions are checked."
              : detectorKind === "rule"
                ? "Conditions are free and instant, so checking 100% of matching sessions is usually right."
                : detectorKind === "judge"
                  ? "Each check sends the session to an LLM, which costs money and time. If you get a lot of traffic, checking a slice of it still catches the pattern for much less."
                  : "A custom script might call an LLM, depending on what it does. If yours does, checking a slice keeps costs down and still catches the pattern."}
          </Text.H6>
        </div>
      </div>
    </div>
  )
}
