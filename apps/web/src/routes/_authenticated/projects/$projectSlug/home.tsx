import { Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { useRouteProject } from "./-route-data.ts"
import { ProjectHomeDashboard } from "./home/-components/project-home-dashboard.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/home")({
  component: ProjectHomePage,
})

function ProjectHomePage() {
  const { projectSlug } = Route.useParams()
  const project = useRouteProject()

  return (
    <Layout>
      <Layout.Content>
        <Layout.List className="pt-6 pb-8">
          <div className="mb-6 flex min-w-0 flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Text.H4>Overview</Text.H4>
              <Text.H6 color="foregroundMuted">Your project overview over the past 7 days</Text.H6>
            </div>
          </div>
          <ProjectHomeDashboard projectId={project.id} projectSlug={projectSlug} />
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
