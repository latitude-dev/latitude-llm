import { DEFAULT_ESCALATION_SENSITIVITY } from "@domain/shared"
import { Label, Select, Switch, Text, useToast } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { updateProjectMutation, useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/signals")({
  component: ProjectSignalsSettingsPage,
})

/**
 * `k` in the seasonal detector: a signal escalates when its last hour exceeds
 * its own expected rate by this many standard deviations. Lower trips sooner.
 */
const SENSITIVITY_OPTIONS = [
  { value: "1", label: "1 · escalates on the smallest rise" },
  { value: "2", label: "2 · escalates on a small rise" },
  { value: "3", label: "3 · balanced (default)" },
  { value: "4", label: "4 · escalates on a clear spike" },
  { value: "5", label: "5 · escalates on a large spike" },
  { value: "6", label: "6 · escalates on an extreme spike" },
]

function ProjectSignalsSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [isSavingKeepMonitoring, setIsSavingKeepMonitoring] = useState(false)
  const [isSavingSensitivity, setIsSavingSensitivity] = useState(false)

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

  const handleSensitivityChange = async (value: string) => {
    if (isSavingSensitivity) return

    setIsSavingSensitivity(true)
    try {
      const transaction = updateProjectMutation(currentProject.id, {
        settings: {
          ...currentProject.settings,
          escalation: { ...currentProject.settings.escalation, sensitivity: Number(value) },
        },
      })
      await transaction.isPersisted.promise
      toast({ description: "Escalation sensitivity updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingSensitivity(false)
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

        <div className="flex w-full flex-row items-center justify-between gap-4 rounded-lg bg-muted/30 p-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="escalation-sensitivity">Escalation sensitivity</Label>
            <Text.H6 color="foregroundMuted">
              How big a spike has to be before a signal escalates and alerts you, compared to its own normal rate for
              that hour and weekday. Lower values escalate sooner.
            </Text.H6>
          </div>
          <div className="w-64 shrink-0">
            <Select
              name="escalation-sensitivity"
              options={SENSITIVITY_OPTIONS}
              value={String(currentProject.settings.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY)}
              disabled={isSavingSensitivity}
              onChange={(value) => void handleSensitivityChange(String(value))}
            />
          </div>
        </div>
      </div>
    </SettingsPage>
  )
}
