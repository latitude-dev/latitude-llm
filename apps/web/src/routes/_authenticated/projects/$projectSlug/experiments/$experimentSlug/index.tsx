import { createFileRoute } from "@tanstack/react-router"
import { ExperimentBreadcrumb, ExperimentDetailPage } from "../-components/experiment-detail-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/experiments/$experimentSlug/")({
  staticData: {
    breadcrumb: ExperimentBreadcrumb,
  },
  component: ExperimentDetailPage,
})
