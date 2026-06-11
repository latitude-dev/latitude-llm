import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/")({
  beforeLoad: ({ params, location }) => {
    // Forward the raw search params so older `/monitors?monitorSlug=…` deep
    // links (notifications, bookmarks) keep opening the drawer on the new tab.
    throw redirect({
      to: "/projects/$projectSlug/monitors/search",
      params: { projectSlug: params.projectSlug },
      search: location.search,
    })
  },
  component: () => null,
})
