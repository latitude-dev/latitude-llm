import { createFileRoute } from "@tanstack/react-router"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { ProjectHomePage } from "./-components/project-home-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Home</BreadcrumbText>,
  },
  component: ProjectHomeRoute,
})

function ProjectHomeRoute() {
  return <ProjectHomePage />
}
