import type { useRouteProject } from "../../-route-data.ts"
import { BehavioursTreeBody } from "./behaviours-page.tsx"

type RouteProject = ReturnType<typeof useRouteProject>

/**
 * The Behaviors screen as it shipped before behaviors became a catalog: the
 * whole-project topic tree, with no header and nothing to switch to. Served at
 * `/behaviours` while the `customBehaviors` flag is off, so an org that hasn't
 * been let into facets sees exactly what production shows today.
 */
export function LegacyBehavioursPage({ project }: { readonly project: RouteProject }) {
  return <BehavioursTreeBody project={project} customBehaviour={null} />
}
