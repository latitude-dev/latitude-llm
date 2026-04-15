import { useRouterState } from "@tanstack/react-router"

type MatchStaticData = Record<string, unknown> | undefined

/**
 * Prefer selector-based router subscriptions in layout chrome.
 *
 * `useMatches()` subscribes the component to the router's full matches array,
 * and unscoped `useRouterState()` subscribes to the full router state. In
 * shared UI like sidebars and breadcrumbs, that means search-only updates can
 * rerender components even when the tiny value they care about has not changed.
 *
 * These helpers keep callers focused on the smallest router-derived value they
 * actually render, which lets TanStack Router preserve those components when
 * that selected value stays equal across a navigation.
 */
export function useHasMatchStaticData(predicate: (staticData: MatchStaticData) => boolean) {
  return useRouterState({
    select: (state) =>
      state.matches.some((match) => {
        return predicate(match.staticData as MatchStaticData)
      }),
  })
}

/**
 * Collects the ids of active matches whose `staticData` passes the predicate.
 * Returning match ids keeps the selected value stable and JSON-serializable.
 */
export function useMatchIdsWithStaticData(predicate: (staticData: MatchStaticData) => boolean) {
  return useRouterState({
    select: (state) =>
      state.matches.flatMap((match) => {
        return predicate(match.staticData as MatchStaticData) ? [match.id] : []
      }),
  })
}

/**
 * Same idea for pathname-only consumers: avoid subscribing to the full router
 * state when a component only needs the current pathname to render.
 */
export function usePathname() {
  return useRouterState({ select: (state) => state.location.pathname })
}
