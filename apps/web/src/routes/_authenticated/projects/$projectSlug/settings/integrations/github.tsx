import { Button, GithubIcon, Icon, Text, Tooltip } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useRouteProject } from "../../-route-data.ts"
import { GithubIntegrationManage } from "../-components/github-manage.tsx"
import { SettingsPage } from "../-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/integrations/github")({
  component: GithubIntegrationManagePage,
})

function GithubIntegrationManagePage() {
  const { projectSlug } = Route.useParams()
  const routeProject = useRouteProject()
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )
  const currentProject = project ?? routeProject

  const { data: allProjects } = useProjectsCollection()
  // The shared Showcase project is merged into this collection but isn't the org's.
  const projectCount = (allProjects ?? []).filter((row) => !row.isShowcase).length

  return (
    <SettingsPage
      title={
        <div className="flex min-w-0 flex-row items-center gap-2">
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button asChild variant="ghost" className="h-7 w-7 p-0" aria-label="Back to integrations">
                <Link to="/projects/$projectSlug/settings/integrations" params={{ projectSlug }}>
                  <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                </Link>
              </Button>
            }
          >
            Back to integrations
          </Tooltip>
          <Icon icon={GithubIcon} />
          <Text.H3M>GitHub</Text.H3M>
        </div>
      }
      description="Connection, repository binding, and monitoring for this project."
    >
      <GithubIntegrationManage
        projectId={currentProject.id}
        projectSlug={currentProject.slug}
        projectCount={projectCount}
      />
    </SettingsPage>
  )
}
