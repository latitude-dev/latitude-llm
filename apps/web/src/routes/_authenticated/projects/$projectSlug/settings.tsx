import { Label, Switch, Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { updateProjectMutation, useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { project: routeProject } = Route.useRouteContext()

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject

  const handleKeepMonitoringChange = (checked: boolean) => {
    updateProjectMutation(currentProject.id, { settings: { keepMonitoring: checked } })
  }

  return (
    <Layout>
      <Layout.Content>
        <Layout.Actions>
          <Layout.ActionsRow>
            <Layout.ActionRowItem>
              <Text.H4 weight="bold">Settings</Text.H4>
            </Layout.ActionRowItem>
          </Layout.ActionsRow>
        </Layout.Actions>
        <Layout.List>
          <div className="flex flex-col gap-4 rounded-lg border boder-secondary bg-secondary p-6">
            <div className="flex w-full flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="keep-monitoring">Monitor resolved issues</Label>
                <Text.H6 color="foregroundMuted">
                  When enabled, evaluations monitoring active issues stay active after the issues are resolved to detect
                  further regressions
                </Text.H6>
              </div>
              <Switch
                id="keep-monitoring"
                checked={currentProject.settings.keepMonitoring ?? true}
                onCheckedChange={handleKeepMonitoringChange}
              />
            </div>
          </div>
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
