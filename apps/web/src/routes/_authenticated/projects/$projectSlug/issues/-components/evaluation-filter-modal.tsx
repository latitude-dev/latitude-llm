import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, CloseTrigger, Modal, Text, useToast } from "@repo/ui"
import { type RefObject, useCallback, useMemo, useState } from "react"
import { MetadataFilter } from "../../../../../../components/filters-builder/metadata-filter/metadata-filter.tsx"
import { MultiSelectFilter } from "../../../../../../components/filters-builder/multi-select-filter.tsx"
import type { DistinctColumn } from "../../../../../../components/filters-builder/types.ts"
import {
  type EvaluationSummaryRecord,
  updateIssueEvaluationTriggerFilter,
} from "../../../../../../domains/evaluations/evaluation-alignment.functions.ts"
import { invalidateIssueQueries } from "../../../../../../domains/issues/issues.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

// Dimensions surfaced to users for evaluation scoping. Numeric/percentile
// dimensions (cost, duration, etc.) are intentionally excluded — they describe
// trace shape, not which agent/feature a trace belongs to, which is what users
// are scoping by.
const EVAL_FILTER_DIMENSIONS: ReadonlyArray<{ readonly field: DistinctColumn; readonly label: string }> = [
  { field: "tags", label: "Tags" },
  { field: "serviceNames", label: "Services" },
  { field: "models", label: "Models" },
  { field: "providers", label: "Providers" },
]

function getInValues(filter: FilterSet, field: string): readonly string[] {
  const cond = filter[field]?.find((c) => c.op === "in")
  return Array.isArray(cond?.value) ? cond.value.map(String) : []
}

function setMultiSelect(filter: FilterSet, field: string, values: readonly string[]): FilterSet {
  if (values.length === 0) {
    const { [field]: _, ...rest } = filter
    return rest
  }
  return { ...filter, [field]: [{ op: "in", value: [...values] }] }
}

function extractMetadataEntries(filter: FilterSet): { readonly key: string; readonly value: string }[] {
  const entries: { key: string; value: string }[] = []
  for (const [field, conditions] of Object.entries(filter)) {
    if (!field.startsWith("metadata.")) continue
    const key = field.slice("metadata.".length)
    for (const cond of conditions) {
      if (cond.op === "eq" && typeof cond.value === "string") {
        entries.push({ key, value: cond.value })
      }
    }
  }
  return entries
}

function applyMetadataEntries(filter: FilterSet, entries: readonly { key: string; value: string }[]): FilterSet {
  const next: Record<string, readonly FilterCondition[]> = {}
  for (const [key, value] of Object.entries(filter)) {
    if (!key.startsWith("metadata.")) next[key] = value
  }
  // `MetadataFilter` emits onChange on every keystroke, so partial rows with an
  // empty key/value reach us mid-typing. Persisting `metadata.` would be
  // rejected by `filterSetSchema` on save; drop incomplete rows instead.
  for (const entry of entries) {
    if (entry.key === "" || entry.value === "") continue
    next[`metadata.${entry.key}`] = [{ op: "eq", value: entry.value }]
  }
  return next
}

export function EvaluationFilterModal({
  evaluation,
  projectId,
  issueId,
  onClose,
}: {
  readonly evaluation: EvaluationSummaryRecord | null
  readonly projectId: string
  readonly issueId: string
  readonly onClose: () => void
}) {
  if (evaluation === null) return null
  return <EvaluationFilterModalForm evaluation={evaluation} projectId={projectId} issueId={issueId} onClose={onClose} />
}

function EvaluationFilterModalForm({
  evaluation,
  projectId,
  issueId,
  onClose,
}: {
  readonly evaluation: EvaluationSummaryRecord
  readonly projectId: string
  readonly issueId: string
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<FilterSet>(evaluation.trigger.filter)
  const [isSaving, setIsSaving] = useState(false)
  const [popoverContainerEl, setPopoverContainerEl] = useState<HTMLDivElement | null>(null)
  const popoverContainerRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({ current: popoverContainerEl }),
    [popoverContainerEl],
  )

  const metadataEntries = useMemo(() => extractMetadataEntries(draft), [draft])

  const handleMultiSelectChange = useCallback((field: DistinctColumn, values: string[]) => {
    setDraft((current) => setMultiSelect(current, field, values))
  }, [])

  const handleMetadataChange = useCallback((entries: { key: string; value: string }[]) => {
    setDraft((current) => applyMetadataEntries(current, entries))
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateIssueEvaluationTriggerFilter({
        data: {
          projectId,
          issueId,
          evaluationId: evaluation.id,
          filter: draft,
        },
      })
      await invalidateIssueQueries(projectId, issueId)
      toast({ description: "Scope updated." })
      // `onClose` unmounts the modal — no need (and no point) resetting
      // `isSaving` afterwards, so the reset lives in the failure path only.
      onClose()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      dismissible
      scrollable={false}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title="Scope evaluation"
      description="Run this evaluation only on traces matching the filters below. Leave empty to evaluate all traces."
      footer={
        <>
          <CloseTrigger />
          <Button onClick={() => void handleSave()} isLoading={isSaving}>
            Save
          </Button>
        </>
      }
    >
      <div className="relative">
        <div ref={setPopoverContainerEl} aria-hidden className="absolute left-0 top-0" />
        <div className="flex flex-col gap-5 pb-4">
          {EVAL_FILTER_DIMENSIONS.map(({ field, label }) => {
            const selected = getInValues(draft, field)
            return (
              <div key={field} className="flex flex-col gap-1.5">
                <Text.H6 color="foregroundMuted">{label}</Text.H6>
                <MultiSelectFilter
                  projectId={projectId}
                  column={field}
                  selected={selected}
                  onChange={(values) => handleMultiSelectChange(field, values)}
                  portalContainer={popoverContainerRef}
                />
              </div>
            )
          })}
          <div className="flex flex-col gap-1.5">
            <Text.H6 color="foregroundMuted">Metadata</Text.H6>
            <MetadataFilter entries={metadataEntries} onChange={handleMetadataChange} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
