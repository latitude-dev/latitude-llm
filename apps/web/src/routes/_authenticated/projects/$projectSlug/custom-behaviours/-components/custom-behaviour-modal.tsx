import type { FilterSet } from "@domain/shared"
import { CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE, customBehaviorFilterSetHasConditions } from "@domain/taxonomy"
import { Badge, Button, CloseTrigger, Icon, Input, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { AlertTriangleIcon } from "lucide-react"
import { useState } from "react"
import { summarizeFilterSet } from "../../../../../../components/filters-builder/filter-summary.ts"
import { FiltersBuilderFields } from "../../../../../../components/filters-builder/filters-builder-fields.tsx"
import {
  useCreateCustomBehavior,
  useCustomBehaviorPreview,
  useUpdateCustomBehavior,
} from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
import { useDebounce } from "../../../../../../lib/hooks/useDebounce.ts"

function ActiveFilterSummary({ filterSet }: { readonly filterSet: FilterSet }) {
  const labels = summarizeFilterSet(filterSet)
  if (labels.length === 0) {
    return <Text.H6 color="warningMutedForeground">{CUSTOM_BEHAVIOR_EMPTY_FILTER_MESSAGE}</Text.H6>
  }
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      <Text.H6 color="foregroundMuted">Filtering by:</Text.H6>
      {labels.map((label) => (
        <Badge key={label} variant="muted" size="small">
          {label}
        </Badge>
      ))}
    </div>
  )
}

function PreviewStrip({ projectId, filterSet }: { readonly projectId: string; readonly filterSet: FilterSet }) {
  const [debounced, setDebounced] = useState(filterSet)
  useDebounce(() => setDebounced(filterSet), 400, [filterSet])
  const { data, isLoading, isError } = useCustomBehaviorPreview(projectId, debounced)

  if (isError) {
    return <Text.H6 color="foregroundMuted">Couldn't load the preview. Save is still available.</Text.H6>
  }
  if (isLoading || !data) {
    return <Text.H6 color="foregroundMuted">Calculating eligible sessions…</Text.H6>
  }

  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">
        {`Over the last 7 days: ${data.observationCount.toLocaleString()} observations across ${data.sessionCount.toLocaleString()} sessions match this filter.`}
      </Text.H6>
      {!data.isReady ? (
        <div className="flex flex-row items-center gap-1.5">
          <Icon icon={AlertTriangleIcon} size="sm" color="warningMutedForeground" />
          <Text.H6 color="warningMutedForeground">
            Needs at least {data.minObservations} observations before a taxonomy can be generated.
          </Text.H6>
        </div>
      ) : null}
    </div>
  )
}

export function CustomBehaviourModal({
  projectId,
  behaviour,
  onClose,
}: {
  readonly projectId: string
  /** Present → edit; null → create. */
  readonly behaviour: CustomBehaviorRecord | null
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const create = useCreateCustomBehavior(projectId)
  const update = useUpdateCustomBehavior(projectId)
  const [filterSet, setFilterSet] = useState<FilterSet>(behaviour?.filterSet ?? {})
  const hasFilters = customBehaviorFilterSetHasConditions(filterSet)

  const form = useForm({
    defaultValues: { name: behaviour?.name ?? "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        if (behaviour) {
          await update.mutateAsync({ id: behaviour.id, name: value.name.trim(), filterSet })
        } else {
          await create.mutateAsync({ name: value.name.trim(), filterSet })
        }
      },
      {
        onSuccess: () => {
          toast({ description: behaviour ? "Custom behavior updated." : "Custom behavior created." })
          onClose()
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
        resetOnSuccess: false,
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      size="large"
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={behaviour ? "Edit custom behavior" : "New custom behavior"}
      description="Name this behavior and pick the sessions it clusters. Behavior clustering runs over the last 7 days."
      footer={
        <>
          <CloseTrigger />
          <Button disabled={!hasFilters} onClick={() => void form.handleSubmit()}>
            {behaviour ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              required
              autoFocus
              label="Name"
              placeholder="e.g. Refund requests"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>

        <div className="flex flex-col gap-1">
          <Text.H5M>Filters</Text.H5M>
          <ActiveFilterSummary filterSet={filterSet} />
          <div className="flex flex-col rounded-md border px-3 max-h-[42vh] overflow-y-auto">
            <FiltersBuilderFields
              mode="sessions"
              projectId={projectId}
              filters={filterSet}
              onFiltersChange={setFilterSet}
              excludeFields={["topics"]}
            />
          </div>
        </div>

        <PreviewStrip projectId={projectId} filterSet={filterSet} />
      </form>
    </Modal>
  )
}
