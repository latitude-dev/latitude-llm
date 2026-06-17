import { createFileRoute, redirect } from "@tanstack/react-router"

// Back-compat: the page moved to /signals. Redirect legacy /issues list URLs
// (bookmarks, already-sent links) and preserve their search params.
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/")({
  validateSearch: (search: Record<string, unknown>): Record<string, unknown> => search,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/projects/$projectSlug/signals",
      params: { projectSlug: params.projectSlug },
      search,
    })
  },
})
