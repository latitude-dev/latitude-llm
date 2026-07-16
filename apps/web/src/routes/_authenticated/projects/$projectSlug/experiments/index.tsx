import { createFileRoute } from "@tanstack/react-router"
import { ExperimentsBreadcrumb, ExperimentsListPage } from "./-components/experiments-list-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/experiments/")({
  staticData: {
    breadcrumb: ExperimentsBreadcrumb,
  },
  component: ExperimentsListPage,
})
