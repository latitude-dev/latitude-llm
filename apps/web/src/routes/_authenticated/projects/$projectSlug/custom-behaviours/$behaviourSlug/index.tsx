import { createFileRoute, redirect } from "@tanstack/react-router"

// Custom behaviors folded into the Behaviours section; keep old links working.
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/custom-behaviours/$behaviourSlug/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectSlug/behaviours/$behaviourSlug",
      params: { projectSlug: params.projectSlug, behaviourSlug: params.behaviourSlug },
      statusCode: 301,
    })
  },
})
