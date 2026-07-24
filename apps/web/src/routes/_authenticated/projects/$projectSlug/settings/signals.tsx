import { Label, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { updateProjectMutation, useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useRouteProject } from "../-route-data.ts"
import { GithubProjectSyncSettings } from "./-components/github-project-sync.tsx"
import { ProjectDispatchOverrides } from "./-components/project-dispatch-overrides.tsx"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/signals")({
  component: ProjectSignalsSettingsPage,
})

function ProjectSignalsSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [isSavingKeepMonitoring, setIsSavingKeepMonitoring] = useState(false)

  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project }) => eq(project.slug, projectSlug)).findOne(),
    [projectSlug],
  )

  const currentProject = project ?? routeProject

  const handleKeepMonitoringChange = async (checked: boolean) => {
    if (isSavingKeepMonitoring) return

    setIsSavingKeepMonitoring(true)
    try {
      const transaction = updateProjectMutation(currentProject.id, {
        settings: { ...currentProject.settings, keepMonitoring: checked },
      })
      await transaction.isPersisted.promise
      toast({ description: "Monitoring preference updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingKeepMonitoring(false)
    }
  }

  return (
    <SettingsPage title="Signals" description="Manage signals in your project">
      <div className="flex w-full flex-col gap-1">
        <div className="flex w-full flex-row items-center justify-between gap-4 rounded-lg bg-muted/30 p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="keep-monitoring">Monitor resolved signals</Label>
            <Text.H6 color="foregroundMuted">
              When enabled, evaluations monitoring active signals stay active after the signals are resolved to detect
              further regressions
            </Text.H6>
          </div>
          <Switch
            id="keep-monitoring"
            checked={currentProject.settings.keepMonitoring ?? true}
            loading={isSavingKeepMonitoring}
            onCheckedChange={(checked) => void handleKeepMonitoringChange(checked)}
          />
        </div>
      </div>
      <ProjectDispatchOverrides projectId={currentProject.id} />
      <GithubProjectSyncSettings projectId={currentProject.id} />
    </SettingsPage>
  )
}
