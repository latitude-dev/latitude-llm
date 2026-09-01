import { createFileRoute, useSearch } from "@tanstack/react-router"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { ProjectHomePage } from "./-components/project-home-page.tsx"
import { ProjectExplorer } from "./-components/project-explorer.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Home</BreadcrumbText>,
  },
  component: ProjectIndexPage,
})

function ProjectIndexPage() {
  const { projectSlug } = Route.useParams()
  const tab = useSearch({
    strict: false,
    select: (search) => (typeof search.tab === "string" ? search.tab : undefined),
  })

  if (tab === "sessions" || tab === "traces") {
    return <ProjectExplorer projectSlug={projectSlug} />
  }

  return <ProjectHomePage projectSlug={projectSlug} />
}
