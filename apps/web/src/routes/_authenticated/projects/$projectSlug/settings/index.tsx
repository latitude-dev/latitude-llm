import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectSlug/settings/general",
      params: { projectSlug: params.projectSlug },
    })
  },
  component: () => null,
})
