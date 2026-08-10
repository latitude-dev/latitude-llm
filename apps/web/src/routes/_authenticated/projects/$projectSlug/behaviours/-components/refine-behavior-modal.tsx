import { Alert, useToast } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { customBehaviorsListKey } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import {
  useInvalidateBehaviorQueries,
  useRefineBehavior,
} from "../../../../../../domains/taxonomy/facets.collection.ts"
import type { useRouteProject } from "../../-route-data.ts"
import { BehaviorAuthoringModal, type BehaviorDraft } from "./behavior-authoring.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * "Refine behavior": behavior instructions are write-once, so refining stops the
 * current garden, discards this behavior (its facet and everything keyed by it),
 * and creates a fresh one with the edited instructions, then navigates to the new
 * view. The form is prefilled from the behavior being refined.
 */
export function RefineBehaviorModal({
  project,
  customBehaviorId,
  initialDraft,
  onClose,
}: {
  readonly project: RouteProject
  readonly customBehaviorId: string
  readonly initialDraft: BehaviorDraft
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const refineBehavior = useRefineBehavior(project.id)
  const invalidateBehaviorQueries = useInvalidateBehaviorQueries(project.id)

  return (
    <BehaviorAuthoringModal
      title="Refine behavior"
      description="Editing the instructions re-analyzes every session. The current answers are discarded and this behavior starts over."
      submitLabel="Refine behavior"
      initialDraft={initialDraft}
      onClose={onClose}
      alert={
        <Alert
          variant="warning"
          description="Sessions already analyzed for this behavior will be discarded and re-extracted with the new instructions."
        />
      }
      action={(draft) => refineBehavior.mutateAsync({ customBehaviorId, ...draft })}
      onSuccess={async (result: CustomBehaviorRecord) => {
        // Seed the new view (dropping the discarded one) so its slug resolves the
        // instant we navigate, before the background list refetch lands.
        queryClient.setQueryData<readonly CustomBehaviorRecord[]>(customBehaviorsListKey(project.id), (old) => [
          result,
          ...(old ?? []).filter((behaviour) => behaviour.id !== customBehaviorId),
        ])
        toast({ description: "Behavior refined. Analyzing your sessions again." })
        await navigate({
          to: "/projects/$projectSlug/behaviours/$behaviourSlug",
          params: { projectSlug: project.slug, behaviourSlug: result.slug },
        })
        invalidateBehaviorQueries()
      }}
    />
  )
}
