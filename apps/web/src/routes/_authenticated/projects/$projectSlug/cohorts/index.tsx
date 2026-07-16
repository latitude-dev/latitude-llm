import { createFileRoute, redirect } from "@tanstack/react-router"

// Cohorts live inside the Behaviours section; this path is a friendly redirect.
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/cohorts/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectSlug/behaviours",
      params: { projectSlug: params.projectSlug },
      statusCode: 301,
    })
  },
})
