import { DEFAULT_ESCALATION_SENSITIVITY_K } from "@domain/issues"
import type { AlertIncidentKind } from "@domain/shared"
import { Label, Slider, Switch, Text, useToast, useValueWithDefault } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { hasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.functions.ts"
import { updateProjectMutation, useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler } from "../../../../../lib/form-server-action.ts"
import { useRouteProject } from "../-route-data.ts"
import { SettingsPage } from "./-components/settings-page.tsx"

const NOTIFICATIONS_FEATURE_FLAG = "notifications"

interface AlertNotificationToggleConfig {
  readonly kind: AlertIncidentKind
  readonly label: string
  readonly description: string
}

// Order matches the lifecycle: discovery → recurrence → sustained spike.
const ALERT_NOTIFICATION_TOGGLES: readonly AlertNotificationToggleConfig[] = [
  {
    kind: "issue.new",
    label: "Notify when a new issue is discovered",
    description: "Send an in-app notification the first time an issue is detected in this project.",
  },
  {
    kind: "issue.regressed",
    label: "Notify when an issue regresses",
    description: "Send an in-app notification when a resolved issue starts producing occurrences again.",
  },
  {
    kind: "issue.escalating",
    label: "Notify when an issue starts or stops escalating",
    description:
      "Send an in-app notification when occurrence rate crosses the escalation threshold, and again when it returns to baseline.",
  },
]

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings/issues")({
  component: ProjectIssuesSettingsPage,
})

function ProjectIssuesSettingsPage() {
  const { projectSlug } = Route.useParams()
  const { toast } = useToast()
  const routeProject = useRouteProject()
  const [isSavingKeepMonitoring, setIsSavingKeepMonitoring] = useState(false)
  const [savingAlertKind, setSavingAlertKind] = useState<AlertIncidentKind | null>(null)

  const { data: notificationsEnabled = false } = useQuery({
    queryKey: ["feature-flag", NOTIFICATIONS_FEATURE_FLAG],
    queryFn: () => hasFeatureFlag({ data: { identifier: NOTIFICATIONS_FEATURE_FLAG } }),
  })

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

  const sensitivityForm = useForm({
    defaultValues: {
      sensitivity: currentProject.settings.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K,
    },
    onSubmit: createFormSubmitHandler<{ sensitivity: number }, void>(
      async ({ sensitivity }) => {
        const transaction = updateProjectMutation(currentProject.id, {
          settings: {
            ...currentProject.settings,
            escalation: {
              ...(currentProject.settings.escalation ?? {}),
              sensitivity,
            },
          },
        })
        await transaction.isPersisted.promise
      },
      {
        onSuccess: () => {
          toast({ description: "Escalation sensitivity updated" })
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  const handleSensitivityChange = (value: number) => {
    sensitivityForm.setFieldValue("sensitivity", value)
    void sensitivityForm.handleSubmit()
  }

  const handleAlertNotificationChange = async (kind: AlertIncidentKind, checked: boolean) => {
    if (savingAlertKind !== null) return

    setSavingAlertKind(kind)
    try {
      const transaction = updateProjectMutation(currentProject.id, {
        settings: {
          ...currentProject.settings,
          notifications: {
            ...(currentProject.settings.notifications ?? {}),
            incidents: {
              ...(currentProject.settings.notifications?.incidents ?? {}),
              [kind]: checked,
            },
          },
        },
      })
      await transaction.isPersisted.promise
      toast({ description: "Notification preference updated" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setSavingAlertKind(null)
    }
  }

  return (
    <SettingsPage title="Issues" description="Manage issues in your project">
      <div className="flex w-full flex-col gap-1">
        <div className="flex w-full flex-row items-center justify-between gap-4 rounded-lg bg-muted/30 p-4">
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
            loading={isSavingKeepMonitoring}
            onCheckedChange={(checked) => void handleKeepMonitoringChange(checked)}
          />
        </div>
        {notificationsEnabled ? (
          <>
            {ALERT_NOTIFICATION_TOGGLES.map((toggle) => {
              const inputId = `alert-notification-${toggle.kind}`
              const checked = currentProject.settings.notifications?.incidents?.[toggle.kind] ?? true
              return (
                <div
                  key={toggle.kind}
                  className="flex w-full flex-row items-center justify-between gap-4 rounded-lg bg-muted/30 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={inputId}>{toggle.label}</Label>
                    <Text.H6 color="foregroundMuted">{toggle.description}</Text.H6>
                  </div>
                  <Switch
                    id={inputId}
                    checked={checked}
                    loading={savingAlertKind === toggle.kind}
                    onCheckedChange={(next) => void handleAlertNotificationChange(toggle.kind, next)}
                  />
                </div>
              )
            })}
            <EscalationSensitivityControl
              value={currentProject.settings.escalation?.sensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K}
              onChange={handleSensitivityChange}
            />
          </>
        ) : null}
      </div>
    </SettingsPage>
  )
}

interface EscalationSensitivityControlProps {
  readonly value: number
  readonly onChange: (value: number) => void
}

function EscalationSensitivityControl({ value, onChange }: EscalationSensitivityControlProps) {
  const [draft, setDraft] = useValueWithDefault(value)

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg bg-muted/30 p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="escalation-sensitivity">Escalation sensitivity</Label>
        <Text.H6 color="foregroundMuted">
          Controls how aggressively the detector flags escalating issues. Lower values trigger sooner but produce more
          false positives; higher values wait for stronger signal.
        </Text.H6>
      </div>
      <div className="flex w-full flex-row items-center gap-4">
        <Slider
          id="escalation-sensitivity"
          min={1}
          max={6}
          step={1}
          value={[draft]}
          onValueChange={(values) => {
            const next = values[0] ?? value
            setDraft(next)
          }}
          onValueCommit={(values) => {
            const next = values[0] ?? value
            onChange(next)
          }}
          aria-label="Escalation sensitivity"
        />
        <Text.H5 weight="medium" className="w-8 text-right">
          {draft}
        </Text.H5>
      </div>
    </div>
  )
}
