import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/")({
  beforeLoad: ({ params, location }) => {
    // Older `/monitors?monitorSlug=…` deep links (notifications, bookmarks) now
    // resolve to the dedicated monitor page; everything else lands on the list.
    const monitorSlug = (location.search as { monitorSlug?: string }).monitorSlug
    if (monitorSlug) {
      throw redirect({
        to: "/projects/$projectSlug/monitors/$monitorSlug",
        params: { projectSlug: params.projectSlug, monitorSlug },
      })
    }
    throw redirect({
      to: "/projects/$projectSlug/monitors/search",
      params: { projectSlug: params.projectSlug },
      search: location.search,
    })
  },
  component: () => null,
})
