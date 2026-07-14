import type { VariantTimeRange } from "@domain/experiments"
import type { FilterCondition, FilterSet } from "@domain/shared"
import { Button, CloseTrigger, Input, Modal, Select, Text } from "@repo/ui"
import { useMemo, useState } from "react"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"

/** Session-filter keys that encode a time window rather than a population attribute. */
const TIME_FILTER_KEYS = new Set(["startTime", "endTime"])

/**
 * A saved search made with the time picker stores its window as `startTime` (`gte`/`lte`) conditions
 * inside the filter set. Experiments instead apply `variant.timeRange` as the ClickHouse window, and
 * the filter builder never surfaces `startTime` — so importing those keys verbatim would leave the
 * variant silently constrained by a hidden, un-editable window on top of its own range. Lift the
 * window out of the filter set into an absolute `timeRange`, and drop the time keys from the filters.
 */
function extractVariantTimeRange(filterSet: FilterSet): { filterSet: FilterSet; timeRange: VariantTimeRange } {
  let from: string | undefined
  let to: string | undefined
  let hasTimeKey = false
  const rest: Record<string, readonly FilterCondition[]> = {}
  for (const [key, conditions] of Object.entries(filterSet)) {
    if (!TIME_FILTER_KEYS.has(key)) {
      rest[key] = conditions
      continue
    }
    hasTimeKey = true
    for (const condition of conditions) {
      if (typeof condition.value !== "string") continue
      if (condition.op === "gte" || condition.op === "gt") from ??= condition.value
      else if (condition.op === "lte" || condition.op === "lt") to ??= condition.value
    }
  }
  if (!hasTimeKey) return { filterSet, timeRange: null }
  const timeRange: VariantTimeRange =
    from !== undefined ? { type: "absolute", fromIso: from, toIso: to ?? new Date().toISOString() } : null
  return { filterSet: rest, timeRange }
}

/** Rename a single variant. */
export function VariantRenameModal({
  currentName,
  onRename,
  onClose,
}: {
  readonly currentName: string
  readonly onRename: (name: string) => Promise<void>
  readonly onClose: () => void
}) {
  const [name, setName] = useState(currentName)
  const [isPending, setIsPending] = useState(false)

  const onSave = async () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setIsPending(true)
    try {
      await onRename(trimmed)
      onClose()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title="Rename variant"
      description="Change the name of this variant. It must be unique across variants."
      footer={
        <>
          <CloseTrigger />
          <Button disabled={isPending} isLoading={isPending} onClick={() => void onSave()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave()
        }}
      >
        <Input
          required
          autoFocus
          label="Name"
          placeholder="Variant B"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </form>
    </Modal>
  )
}

/** Confirm setting a variant as the experiment's baseline. */
export function VariantBaselineConfirmModal({
  onConfirm,
  onClose,
}: {
  readonly onConfirm: () => Promise<void>
  readonly onClose: () => void
}) {
  const [isPending, setIsPending] = useState(false)
  const run = async () => {
    setIsPending(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsPending(false)
    }
  }
  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title="Set as baseline"
      description="By making this variant the baseline, all other metrics will be compared against it."
      footer={
        <>
          <CloseTrigger />
          <Button disabled={isPending} isLoading={isPending} onClick={() => void run()}>
            Set as baseline
          </Button>
        </>
      }
    />
  )
}

/** Confirm removing a variant from the comparison. */
export function VariantRemoveConfirmModal({
  onConfirm,
  onClose,
}: {
  readonly onConfirm: () => Promise<void>
  readonly onClose: () => void
}) {
  const [isPending, setIsPending] = useState(false)
  const run = async () => {
    setIsPending(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsPending(false)
    }
  }
  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title="Remove variant"
      description="Remove this variant from the experiment. This cannot be undone."
      footer={
        <>
          <CloseTrigger />
          <Button variant="destructive" disabled={isPending} isLoading={isPending} onClick={() => void run()}>
            Remove
          </Button>
        </>
      }
    />
  )
}

/** Pick a saved search and apply its filters + query — either into an existing variant or as a new one. */
export function VariantImportFromSearchModal({
  projectId,
  onImport,
  onClose,
  title = "Import from a saved search",
  description = "Copy the filters and query from a saved search into this variant.",
  confirmLabel = "Import",
}: {
  readonly projectId: string
  readonly onImport: (filterSet: FilterSet, query: string | null, timeRange: VariantTimeRange) => Promise<void>
  readonly onClose: () => void
  readonly title?: string
  readonly description?: string
  readonly confirmLabel?: string
}) {
  const { data: searches, isLoading } = useSavedSearchesList(projectId)
  const [selectedId, setSelectedId] = useState("")
  const [isPending, setIsPending] = useState(false)

  const selected = useMemo(() => searches.find((search) => search.id === selectedId) ?? null, [searches, selectedId])

  const run = async () => {
    if (!selected) return
    setIsPending(true)
    try {
      const { filterSet, timeRange } = extractVariantTimeRange(selected.filterSet)
      await onImport(filterSet, selected.query, timeRange)
      onClose()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title={title}
      description={description}
      footer={
        <>
          <CloseTrigger />
          <Button disabled={!selected || isPending} isLoading={isPending} onClick={() => void run()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Text.H5M>Saved search</Text.H5M>
        <Select<string>
          name="variant-saved-search"
          width="full"
          contentWidth="trigger"
          options={searches.map((search) => ({ label: search.name, value: search.id }))}
          value={selectedId || undefined}
          placeholder="Select a saved search"
          onChange={(next) => setSelectedId(next)}
          searchable
          searchPlaceholder="Search saved searches…"
          searchableEmptyMessage="No saved searches found"
          loading={isLoading}
        />
      </div>
    </Modal>
  )
}
