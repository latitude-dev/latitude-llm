import { isShowcaseProjectSlug } from "@domain/shared"
import type { ProjectRecord } from "./projects.functions.ts"

/** Display name for the shared Showcase entry in the switcher and project chrome. */
export const SHOWCASE_PROJECT_NAME = "Latitude Demo"

/**
 * Appends the (optional) resolved Showcase row to the org-scoped project list.
 * The server projects repository stays pure/org-scoped — the Showcase lives in a
 * different org, so it is merged here at the client collection, never injected
 * into `listProjects`. `showcase` is `null` when no showcase exists or the org's
 * `wantsShowcase` is false (the resolver 404s → the server fn returns null), so
 * the entry appears only for opted-in orgs once a showcase has been built.
 */
export function mergeShowcaseProject(
  projects: readonly ProjectRecord[],
  showcase: ProjectRecord | null,
): ProjectRecord[] {
  return showcase ? [...projects, showcase] : [...projects]
}

/**
 * Decides how the `$projectSlug` loader resolves a project. The reserved
 * Showcase slug routes through the cross-org showcase resolver (and scopes
 * descendant reads to the showcase org); every other slug resolves org-scoped.
 * A missing/unauthorized showcase throws so the route's catch redirects to `/`.
 */
export async function loadProjectRouteData({
  slug,
  loadShowcaseProject,
  loadProjectBySlug,
}: {
  readonly slug: string
  readonly loadShowcaseProject: () => Promise<ProjectRecord | null>
  readonly loadProjectBySlug: (slug: string) => Promise<ProjectRecord>
}): Promise<{ project: ProjectRecord; isShowcase: boolean }> {
  if (isShowcaseProjectSlug(slug)) {
    const project = await loadShowcaseProject()
    if (!project) throw new Error("Showcase unavailable")
    return { project, isShowcase: true }
  }

  const project = await loadProjectBySlug(slug)
  return { project, isShowcase: false }
}
