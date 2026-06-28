import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/monitors/signals")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/projects/$projectSlug/monitors/search",
      params: { projectSlug: params.projectSlug },
      search: location.search,
    })
  },
  component: () => null,
})
