import { customBehaviorFilterSetHasConditions, FACET_PRESETS, type FacetSelection } from "@domain/taxonomy"
import { Alert, Button, Icon, Modal, Text, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { EyeIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { useCustomBehaviorsList } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import {
  useCreateAuthoredBehavior,
  useCreateFacetBehavior,
  useFacetsList,
} from "../../../../../../domains/taxonomy/facets.collection.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import type { useRouteProject } from "../../-route-data.ts"
import { BehaviorAuthoringModal, type BehaviorDraft, EMPTY_BEHAVIOR_DRAFT } from "./behavior-authoring.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * "New behavior": pick a preset, view a preset that already exists, fork a preset
 * into an editable form, or author a custom behavior from scratch. Creating a
 * behavior materializes its whole-project view, which gardens and becomes the tree
 * you review, so on success we navigate straight to it. A preset can exist at most
 * once per project (reserved slug), so an already-created preset offers "View"
 * instead of a second create.
 */
export function NewBehaviorModal({
  project,
  onClose,
}: {
  readonly project: RouteProject
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const createFacetBehavior = useCreateFacetBehavior(project.id)
  const createAuthoredBehavior = useCreateAuthoredBehavior(project.id)
  const { data: facets } = useFacetsList(project.id)
  const { data: behaviours } = useCustomBehaviorsList(project.id)
  const [authoring, setAuthoring] = useState<BehaviorDraft | null>(null)
  const isSaving = createFacetBehavior.isPending || createAuthoredBehavior.isPending

  // Map each existing facet's reserved slug to its whole-project view slug so a
  // preset that's already created links to it instead of offering a duplicate.
  const viewSlugByFacetSlug = useMemo(() => {
    const facetIdBySlug = new Map(facets.map((facet) => [facet.slug, facet.id]))
    const wholeProjectSlugByFacetId = new Map(
      behaviours
        .filter((behaviour) => behaviour.facetId != null && !customBehaviorFilterSetHasConditions(behaviour.filterSet))
        .map((behaviour) => [behaviour.facetId as string, behaviour.slug]),
    )
    const out = new Map<string, string>()
    for (const [slug, facetId] of facetIdBySlug) {
      const viewSlug = wholeProjectSlugByFacetId.get(facetId)
      if (viewSlug) out.set(slug, viewSlug)
    }
    return out
  }, [facets, behaviours])

  const goToView = (slug: string) =>
    void navigate({
      to: "/projects/$projectSlug/behaviours/$behaviourSlug",
      params: { projectSlug: project.slug, behaviourSlug: slug },
    })

  const submit = (facetSelection: FacetSelection) => {
    createFacetBehavior.mutate(
      { facetSelection },
      {
        onSuccess: (result: CustomBehaviorRecord) => {
          toast({ description: "Behavior created. Analyzing your sessions." })
          goToView(result.slug)
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
      },
    )
  }

  const forkPreset = (slug: string) => {
    const preset = FACET_PRESETS.find((entry) => entry.slug === slug)
    if (!preset) return
    setAuthoring({ name: preset.name, description: preset.description, instructions: preset.instructions })
  }

  if (authoring) {
    return (
      <BehaviorAuthoringModal
        title="New behavior"
        description="Name the question you want your sessions grouped by, then say how to answer it from a conversation."
        submitLabel="Create behavior"
        initialDraft={authoring}
        onClose={onClose}
        onBack={() => setAuthoring(null)}
        alert={
          <Alert
            variant="default"
            description="Creating a behavior analyzes every session through it. This runs for a few minutes, then you review the groups it produces."
          />
        }
        action={(draft) => createAuthoredBehavior.mutateAsync(draft)}
        onSuccess={(result: CustomBehaviorRecord) => {
          toast({ description: "Behavior created. Analyzing your sessions." })
          goToView(result.slug)
        }}
      />
    )
  }

  return (
    <Modal
      open
      dismissible
      scrollable
      size="large"
      onOpenChange={(next) => (next || isSaving ? undefined : onClose())}
      title="New behavior group"
      description="A behavior groups your sessions by a question other than topic: what the user wanted, how it ended, why they got stuck."
      footer={
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FACET_PRESETS.map((preset) => {
          const existingViewSlug = viewSlugByFacetSlug.get(preset.slug)
          return (
            <div key={preset.slug} className="flex flex-col justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex flex-col gap-1">
                <Text.H5M>{preset.name}</Text.H5M>
                <Text.H6 color="foregroundMuted">{preset.description}</Text.H6>
              </div>
              <div className="flex flex-row items-center gap-2">
                {existingViewSlug ? (
                  <Button size="sm" onClick={() => goToView(existingViewSlug)} disabled={isSaving}>
                    <Icon icon={EyeIcon} size="sm" />
                    View
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => submit({ kind: "preset", presetSlug: preset.slug })}
                    disabled={isSaving}
                  >
                    Use
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => forkPreset(preset.slug)} disabled={isSaving}>
                  Customize
                </Button>
              </div>
            </div>
          )
        })}
        <button
          type="button"
          disabled={isSaving}
          onClick={() => setAuthoring(EMPTY_BEHAVIOR_DRAFT)}
          className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed text-muted-foreground transition-colors hover:bg-muted"
        >
          <Icon icon={PlusIcon} size="md" />
          <Text.H6 color="foregroundMuted">From scratch</Text.H6>
        </button>
      </div>
    </Modal>
  )
}
