import { createFileRoute, redirect } from "@tanstack/react-router"

// Custom behaviors folded into the Behaviours section; keep old links working.
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/custom-behaviours/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectSlug/behaviours",
      params: { projectSlug: params.projectSlug },
      statusCode: 301,
    })
  },
})
