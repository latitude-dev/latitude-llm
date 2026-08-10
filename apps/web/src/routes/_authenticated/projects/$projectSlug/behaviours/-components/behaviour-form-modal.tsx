import { FacetId, type FilterSet } from "@domain/shared"
import { CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS, customBehaviorFilterSetHasConditions } from "@domain/taxonomy"
import { Button, cn, Icon, Input, Modal, Tooltip, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { useState } from "react"
import { FilterPortalContainerProvider } from "../../../../../../components/filters-builder/portal-container-context.tsx"
import { useBehaviourCatalog } from "../../../../../../domains/taxonomy/behaviour-catalog.collection.ts"
import type { BehaviourCatalogEntryRecord } from "../../../../../../domains/taxonomy/behaviour-catalog.functions.ts"
import {
  useCreateCustomBehavior,
  useUpdateCustomBehavior,
} from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"
import { FilterSessionsPreview } from "../../-components/filter-sessions-preview.tsx"
import type { useRouteProject } from "../../-route-data.ts"
import { BEHAVIOUR_CARD_CLASS, BEHAVIOUR_GRID_CLASS, BehaviourCardBody } from "./behaviour-catalog-card.tsx"
import type { MainBehaviour } from "./behaviour-scope.ts"

type RouteProject = ReturnType<typeof useRouteProject>

/** All a new view needs from its behavior: where to route, what to call it, which facet to garden. */
type ViewParent = Pick<MainBehaviour, "slug" | "name" | "facetId">

/**
 * Which behavior to narrow, shown as the same cards as the Behaviors home — the
 * groups teaser is what tells you whether this is the behavior you meant. A
 * behavior still on its first extraction has no cached answers to slice, so it
 * can't be picked yet.
 */
function BehaviourPicker({
  entries,
  onSelect,
}: {
  readonly entries: readonly BehaviourCatalogEntryRecord[]
  readonly onSelect: (entry: BehaviourCatalogEntryRecord) => void
}) {
  return (
    <div className={BEHAVIOUR_GRID_CLASS}>
      {entries.map((entry) => {
        const cooking = entry.status === "generating"
        const card = (
          <button
            type="button"
            disabled={cooking}
            onClick={() => onSelect(entry)}
            className={cn(BEHAVIOUR_CARD_CLASS, { "cursor-not-allowed opacity-60 hover:border-border": cooking })}
          >
            <BehaviourCardBody entry={entry} />
          </button>
        )
        if (!cooking)
          return (
            <div key={entry.slug} className="flex flex-col">
              {card}
            </div>
          )
        return (
          <Tooltip key={entry.slug} asChild side="bottom" trigger={<span className="flex flex-col">{card}</span>}>
            This behavior is still analyzing your sessions. You can filter it once it's ready.
          </Tooltip>
        )
      })}
    </div>
  )
}

/**
 * Create a filtered view of a behavior, or edit an existing view's name/filter.
 *
 * Two steps: which behavior to narrow, then the name plus the filter-and-sessions
 * preview (filters left, matching sessions right) so the user sees how the filter
 * moves session volume before saving. Step 1 is skipped whenever the parent is
 * already known — the caller passes `parent` from the behavior page, and the
 * Behaviors home omits it only while the project has more than one behavior to
 * choose from. A view always needs at least one filter: an unfiltered behavior is
 * the behavior itself. `full`/`screen` sizing is what lets the filters, sessions,
 * and an open session drawer sit side by side.
 */
export function BehaviourFormModal({
  project,
  behaviour,
  parent,
  initialFilterSet,
  onClose,
}: {
  readonly project: RouteProject
  /** Present → edit an existing view; absent → create a view. */
  readonly behaviour?: CustomBehaviorRecord
  /** The behavior being narrowed. Omit to ask for it in step 1. */
  readonly parent?: MainBehaviour
  readonly initialFilterSet?: FilterSet
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const create = useCreateCustomBehavior(project.id)
  const update = useUpdateCustomBehavior(project.id)
  // Only the picker needs the catalog, so a form opened from a behavior page (which
  // already knows its parent) doesn't fetch it.
  const needsPicker = parent === undefined && behaviour === undefined
  const { data: entries, isLoading: entriesLoading } = useBehaviourCatalog(project.id, { enabled: needsPicker })
  const [picked, setPicked] = useState<ViewParent | null>(parent ?? null)
  const [filterSet, setFilterSet] = useState<FilterSet>(behaviour?.filterSet ?? initialFilterSet ?? {})
  // Filter popovers portal here (inside the dialog) instead of document.body, or
  // the modal's focus scope makes them non-interactive.
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const hasFilters = customBehaviorFilterSetHasConditions(filterSet)
  const projectSlug = project.slug
  const isSaving = create.isPending || update.isPending
  // One behavior in the project means one possible parent: asking would be a
  // dead-end step, so the picker resolves itself once the catalog has loaded.
  const onlyBehaviour = !entriesLoading && entries.length === 1 ? entries[0] : undefined
  const target: ViewParent | null = picked ?? onlyBehaviour ?? null

  const form = useForm({
    defaultValues: { name: behaviour?.name ?? "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        if (behaviour) {
          return await update.mutateAsync({ id: behaviour.id, name: value.name.trim(), filterSet })
        }
        return await create.mutateAsync({
          name: value.name.trim(),
          filterSet,
          ...(target?.facetId ? { facetSelection: { kind: "facet" as const, facetId: FacetId(target.facetId) } } : {}),
        })
      },
      {
        onSuccess: (result: CustomBehaviorRecord) => {
          toast({ description: behaviour ? "View updated." : "View created. Analyzing matching sessions." })
          if (!target) return
          void navigate({
            to: "/projects/$projectSlug/behaviours/$behaviourSlug/views/$viewSlug",
            params: { projectSlug, behaviourSlug: target.slug, viewSlug: result.slug },
          })
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
      scrollable={false}
      size="full"
      height="screen"
      footerAlign="justify"
      onOpenChange={(next) => (next || isSaving ? undefined : onClose())}
      title={behaviour ? "Edit view" : "New view"}
      description={
        behaviour
          ? "A view is a saved subset of sessions, grouped by its behavior."
          : target
            ? `Narrow ${target.name} to a subset of sessions.`
            : "Which behavior do you want to look at a subset of?"
      }
      footer={
        <>
          {picked && needsPicker && entries.length > 1 ? (
            <Button variant="outline" onClick={() => setPicked(null)} disabled={isSaving}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-row gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            {target ? (
              <Button disabled={!hasFilters || isSaving} onClick={() => void form.handleSubmit()}>
                {isSaving ? <Icon icon={Loader2Icon} size="sm" className="animate-spin" /> : null}
                {behaviour ? "Save changes" : "Create view"}
              </Button>
            ) : null}
          </div>
        </>
      }
    >
      <div ref={setPortalContainer} />
      <FilterPortalContainerProvider container={portalContainer}>
        <div className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
          {target ? (
            <form.Field name="name">
              {(field) => (
                <Input
                  required
                  autoFocus
                  label="Name"
                  placeholder="e.g. Enterprise refunds"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  errors={fieldErrorsAsStrings(field.state.meta.errors)}
                />
              )}
            </form.Field>
          ) : null}
          {target ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
              <FilterSessionsPreview
                projectId={project.id}
                filters={filterSet}
                onFilterChange={setFilterSet}
                excludeFilterFields={CUSTOM_BEHAVIOR_EXCLUDED_FILTER_FIELDS}
              />
            </div>
          ) : entriesLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Icon icon={Loader2Icon} color="foregroundMuted" className="animate-spin" />
            </div>
          ) : (
            <div className="@container mx-auto flex w-full max-w-6xl flex-col overflow-y-auto">
              <BehaviourPicker entries={entries} onSelect={setPicked} />
            </div>
          )}
        </div>
      </FilterPortalContainerProvider>
    </Modal>
  )
}
