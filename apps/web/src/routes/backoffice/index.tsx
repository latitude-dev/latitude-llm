import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/backoffice/")({
  loader: () => {
    throw redirect({ to: "/backoffice/search" })
  },
})
