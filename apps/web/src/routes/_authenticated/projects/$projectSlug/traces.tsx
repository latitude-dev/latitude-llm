import { createFileRoute } from "@tanstack/react-router"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { ProjectExplorer } from "./-components/project-explorer.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/traces")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Traces</BreadcrumbText>,
  },
  component: TracesPage,
})

function TracesPage() {
  const { projectSlug } = Route.useParams()
  return <ProjectExplorer projectSlug={projectSlug} mode="traces" />
}
