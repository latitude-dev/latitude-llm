import { createFileRoute } from "@tanstack/react-router"
import { BreadcrumbText } from "../../../-components/breadcrumb-ui.tsx"
import { ProjectExplorer } from "../-components/project-explorer.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/sessions/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Sessions</BreadcrumbText>,
  },
  component: SessionsPage,
})

function SessionsPage() {
  const { projectSlug } = Route.useParams()
  return <ProjectExplorer projectSlug={projectSlug} />
}
