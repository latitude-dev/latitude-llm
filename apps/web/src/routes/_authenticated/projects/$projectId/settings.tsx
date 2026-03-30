import { Container, Label, Switch, Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { updateProjectMutation, useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"

export const Route = createFileRoute("/_authenticated/projects/$projectId/settings")({
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
  const { projectId } = Route.useParams()

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.id, projectId)).findOne(),
    [projectId],
  )

  if (!project) return null

  const handleKeepMonitoringChange = (checked: boolean) => {
    updateProjectMutation(projectId, { settings: { keepMonitoring: checked } })
  }

  return (
    <Container className="pt-14">
      <div className="flex flex-col gap-4">
        <Text.H4 weight="bold">Project Settings</Text.H4>
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <Label htmlFor="keep-monitoring">Monitor resolved issues</Label>
            <Text.H6 color="foregroundMuted">
              When enabled, evaluations monitoring active issues stay active even after a issue is resolved to detect
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
    </Container>
  )
}
