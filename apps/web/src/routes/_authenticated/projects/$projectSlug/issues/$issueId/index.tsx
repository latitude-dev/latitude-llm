import { createFileRoute, redirect } from "@tanstack/react-router"

// Back-compat: the page moved to /signals/$signalId. Redirect legacy
// /issues/$issueId full-page deep links (the `?issueId=` drawer link is handled
// by the signals list route's beforeLoad).
export const Route = createFileRoute("/_authenticated/projects/$projectSlug/issues/$issueId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectSlug/signals/$signalId",
      params: { projectSlug: params.projectSlug, signalId: params.issueId },
    })
  },
})
