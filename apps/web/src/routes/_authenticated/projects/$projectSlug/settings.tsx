import { Label, Switch, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { updateProjectMutation } from "../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { project } = Route.useRouteContext()

  const handleKeepMonitoringChange = (checked: boolean) => {
    updateProjectMutation(project.id, { settings: { keepMonitoring: checked } })
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
                checked={project.settings.keepMonitoring ?? true}
                onCheckedChange={handleKeepMonitoringChange}
              />
            </div>
          </div>
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}
