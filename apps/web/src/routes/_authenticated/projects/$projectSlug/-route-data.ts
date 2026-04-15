import { getRouteApi } from "@tanstack/react-router"

/**
 * Centralizes access to the project layout route's loader data.
 *
 * This keeps the `getRouteApi("/_authenticated/projects/$projectSlug")`
 * string in one place and lets descendant routes consume the parent loader
 * data without importing the parent `Route` module directly.
 */
const projectRoute = getRouteApi("/_authenticated/projects/$projectSlug")

/** Reads the active project from the parent route's cached loader data. */
export function useRouteProject() {
  return projectRoute.useLoaderData({ select: (data) => data.project })
}
