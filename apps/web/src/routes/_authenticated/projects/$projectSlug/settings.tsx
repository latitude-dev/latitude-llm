import { Container, Label, Switch, Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { updateProjectMutation, useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { projectSlug } = Route.useParams()

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  if (!project) return null

  const handleKeepMonitoringChange = (checked: boolean) => {
    updateProjectMutation(project.id, { settings: { keepMonitoring: checked } })
  }

  return (
    <Container className="pt-14">
      <div className="flex flex-col gap-4">
        <Text.H4 weight="bold">Project Settings</Text.H4>
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <Label htmlFor="keep-monitoring">Keep monitoring after resolution</Label>
            <Text.H6 color="foregroundMuted">
              When enabled, linked evaluations stay active after an issue is resolved to detect regressions.
            </Text.H6>
          </div>
          <Switch
            id="keep-monitoring"
            checked={project.settings.keepMonitoring ?? true}
            onCheckedChange={handleKeepMonitoringChange}
          />
        </div>
      </div>
    </Container>
  )
}
