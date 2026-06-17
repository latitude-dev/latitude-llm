import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/traces")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/projects/$projectSlug",
      params: { projectSlug: params.projectSlug },
      search: { ...(location.search as Record<string, unknown>), tab: "traces" },
    })
  },
  component: () => null,
})
