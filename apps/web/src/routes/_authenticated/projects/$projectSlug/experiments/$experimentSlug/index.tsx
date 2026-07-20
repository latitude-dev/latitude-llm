import { createFileRoute } from "@tanstack/react-router"
import { ExperimentBreadcrumb, ExperimentDetailPage } from "../-components/experiment-detail-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/experiments/$experimentSlug/")({
  // Set on the post-creation redirect so the detail page opens every variant's filters once; the
  // page strips it on mount so a later refresh shows the default collapsed filters.
  validateSearch: (search: Record<string, unknown>): { created?: true } =>
    search.created === true ? { created: true } : {},
  staticData: {
    breadcrumb: ExperimentBreadcrumb,
  },
  component: ExperimentDetailPage,
})
