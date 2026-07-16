import type { FilterSet } from "@domain/shared"
import { CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS, customBehaviorFilterSetHasConditions } from "@domain/taxonomy"
import { Button, Input, Modal, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { useState } from "react"
import {
  useCreateCustomBehavior,
  useUpdateCustomBehavior,
} from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
import { FilterSessionsPreview } from "../../-components/filter-sessions-preview.tsx"
import type { useRouteProject } from "../../-route-data.ts"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * Create/edit a custom behavior in a full-screen modal: name + the reusable
 * filter-and-sessions preview (filters left, matching sessions right,
 * click-to-detail). Purely a filter editor — a fresh behavior's readiness (it
 * clusters once enough matching sessions accumulate) is explained by the
 * waiting state on the behavior view, not here. `full`/`screen` sizing is what
 * lets the filters, sessions, and an open session drawer sit side by side on a
 * 13" screen.
 */
export function BehaviourFormModal({
  project,
  behaviour,
  initialFilterSet,
  onClose,
}: {
  readonly project: RouteProject
  /** Present → edit; absent → create. */
  readonly behaviour?: CustomBehaviorRecord
  /** Seeds the create form's filters (excluded fields already stripped). */
  readonly initialFilterSet?: FilterSet
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const create = useCreateCustomBehavior(project.id)
  const update = useUpdateCustomBehavior(project.id)
  const [filterSet, setFilterSet] = useState<FilterSet>(behaviour?.filterSet ?? initialFilterSet ?? {})
  const hasFilters = customBehaviorFilterSetHasConditions(filterSet)
  const projectSlug = project.slug
  const isSaving = create.isPending || update.isPending

  const form = useForm({
    defaultValues: { name: behaviour?.name ?? "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        if (behaviour) {
          return await update.mutateAsync({ id: behaviour.id, name: value.name.trim(), filterSet })
        }
        return await create.mutateAsync({ name: value.name.trim(), filterSet })
      },
      {
        onSuccess: (result: CustomBehaviorRecord) => {
          toast({ description: behaviour ? "Custom behavior updated." : "Custom behavior created." })
          void navigate({
            to: "/projects/$projectSlug/behaviours/$behaviourSlug",
            params: { projectSlug, behaviourSlug: result.slug },
          })
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
        resetOnSuccess: false,
      },
    ),
  })

  return (
    <Modal.Root open onOpenChange={(next) => (next || isSaving ? undefined : onClose())}>
      <Modal.Content size="full" height="screen" dismissible>
        <div className="flex shrink-0 flex-col gap-3 px-6 pt-6">
          <Text.H4M>{behaviour ? "Edit behavior" : "New behavior"}</Text.H4M>
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
        </div>
        <div className="min-h-0 flex-1 px-6 pt-6 pb-6">
          <div className="h-full overflow-hidden rounded-xl border border-border">
            <FilterSessionsPreview
              projectId={project.id}
              filters={filterSet}
              onFilterChange={setFilterSet}
              excludeFilterFields={CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-row justify-end gap-2 rounded-b-2xl border-border border-t bg-background-gray px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button disabled={!hasFilters || isSaving} onClick={() => void form.handleSubmit()}>
            {isSaving ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
            {behaviour ? "Save changes" : "Create"}
          </Button>
        </div>
      </Modal.Content>
    </Modal.Root>
  )
}
