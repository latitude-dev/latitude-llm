import { useMatch } from "@tanstack/react-router"

const PROJECT_ROUTE_ID = "/_authenticated/projects/$projectSlug"

interface CurrentProject {
  readonly id: string
  readonly slug: string
  readonly name: string
}

/**
 * The active project resolved from the `$projectSlug` route's cached loader data, or null
 * when not inside a project. Read via `useMatch` (not `useParams` + a collection lookup) so
 * it works from the globally-mounted palette and stays correct when the URL slug drifts from
 * the project's current slug — matching how the breadcrumb and project layout resolve it.
 */
export function useCurrentProject(): CurrentProject | null {
  const project = useMatch({
    from: PROJECT_ROUTE_ID,
    shouldThrow: false,
    select: (match) => match.loaderData?.project,
  })
  return project ?? null
}
