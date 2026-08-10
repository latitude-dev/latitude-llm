import { customBehaviorFilterSetHasConditions, TOPICS_BEHAVIOR_SLUG } from "@domain/taxonomy"
import {
  TOPICS_BEHAVIOR_DESCRIPTION,
  TOPICS_BEHAVIOR_NAME,
} from "../../../../../../domains/taxonomy/behaviour-catalog.functions.ts"
import { useCustomBehaviorsList } from "../../../../../../domains/taxonomy/custom-behaviors.collection.ts"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { useFacetsList } from "../../../../../../domains/taxonomy/facets.collection.ts"

/** The main behavior a page belongs to: the topic behavior, or a facet's whole-project view. */
export interface MainBehaviour {
  readonly slug: string
  readonly name: string
  readonly description: string
  readonly facetId: string | null
  /** null on the topic behavior, which is the online-routed tree and has no row. */
  readonly record: CustomBehaviorRecord | null
}

export interface BehaviourScope {
  readonly main: MainBehaviour
  /** The filtered view being shown, or null on the main behavior itself. */
  readonly view: CustomBehaviorRecord | null
  /** Every filtered view of `main`, for the view switcher. */
  readonly views: readonly CustomBehaviorRecord[]
}

type BehaviourScopeResult =
  | { readonly status: "loading" }
  | { readonly status: "notFound" }
  /** The slug names a filtered view, which lives one level deeper. */
  | { readonly status: "redirect"; readonly behaviourSlug: string; readonly viewSlug: string }
  | { readonly status: "ready"; readonly scope: BehaviourScope }

const isView = (behaviour: CustomBehaviorRecord) => customBehaviorFilterSetHasConditions(behaviour.filterSet)

/** The tree a scope reads: the active view when there is one, else the main behavior's own. */
export const scopeTreeBehaviour = (scope: BehaviourScope): CustomBehaviorRecord | null =>
  scope.view ?? scope.main.record

/**
 * Resolve `/behaviours/:behaviourSlug[/views/:viewSlug]` against the project's
 * behaviors. The topic behavior has no row, so it resolves from the reserved
 * `lat-topics` slug; every other main behavior is the whole-project (unfiltered)
 * view of its facet, and the views under it are that facet's filtered ones.
 */
export function useBehaviourScope(
  projectId: string,
  behaviourSlug: string,
  viewSlug?: string | undefined,
): BehaviourScopeResult {
  const { data: behaviours, isLoading: behavioursLoading } = useCustomBehaviorsList(projectId)
  const { data: facets, isLoading: facetsLoading } = useFacetsList(projectId)

  if (behavioursLoading || facetsLoading) return { status: "loading" }

  const isTopics = behaviourSlug === TOPICS_BEHAVIOR_SLUG
  const named = isTopics ? null : behaviours.find((behaviour) => behaviour.slug === behaviourSlug)
  if (!isTopics && named === undefined) return { status: "notFound" }

  // A flat `/behaviours/:slug` that names a filtered view: send it to its nested URL.
  if (named && isView(named)) {
    const parent = behaviours.find((behaviour) => behaviour.facetId === named.facetId && !isView(behaviour))
    return {
      status: "redirect",
      behaviourSlug: named.facetId === null ? TOPICS_BEHAVIOR_SLUG : (parent?.slug ?? TOPICS_BEHAVIOR_SLUG),
      viewSlug: named.slug,
    }
  }

  const facetId = named?.facetId ?? null
  const facet = facetId === null ? undefined : facets.find((entry) => entry.id === facetId)
  const main: MainBehaviour = named
    ? {
        slug: named.slug,
        name: named.name,
        description: facet?.description ?? "",
        facetId,
        record: named,
      }
    : {
        slug: TOPICS_BEHAVIOR_SLUG,
        name: TOPICS_BEHAVIOR_NAME,
        description: TOPICS_BEHAVIOR_DESCRIPTION,
        facetId: null,
        record: null,
      }

  const views = behaviours.filter((behaviour) => isView(behaviour) && behaviour.facetId === main.facetId)
  if (viewSlug === undefined) return { status: "ready", scope: { main, view: null, views } }

  const view = views.find((candidate) => candidate.slug === viewSlug)
  if (view === undefined) return { status: "notFound" }
  return { status: "ready", scope: { main, view, views } }
}
