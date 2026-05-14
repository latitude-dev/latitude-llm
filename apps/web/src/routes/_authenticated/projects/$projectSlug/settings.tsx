import { DEFAULT_ESCALATION_SENSITIVITY_K } from "@domain/issues"
import type { AlertIncidentKind } from "@domain/shared"
import {
  DetailSection,
  InfiniteTable,
  type InfiniteTableColumn,
  Input,
  Label,
  Slider,
  Switch,
  Text,
  Tooltip,
  useToast,
  useValueWithDefault,
} from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FolderIcon, ScanSearchIcon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"
import { useDebouncedCallback } from "use-debounce"
import { hasFeatureFlag } from "../../../../domains/feature-flags/feature-flags.functions.ts"
import { updateFlaggerMutation, useProjectFlaggers } from "../../../../domains/flaggers/flaggers.collection.ts"
import type { FlaggerRecord } from "../../../../domains/flaggers/flaggers.functions.ts"
import { updateProjectMutation, useProjectsCollection } from "../../../../domains/projects/projects.collection.ts"
import { ListingLayout as Layout } from "../../../../layouts/ListingLayout/index.tsx"
import { toUserMessage } from "../../../../lib/errors.ts"
import { createFormSubmitHandler } from "../../../../lib/form-server-action.ts"
import { BreadcrumbText } from "../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "./-route-data.ts"

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

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/settings")({
  staticData: {
    breadcrumb: () => <BreadcrumbText variant="current">Settings</BreadcrumbText>,
  },
  component: ProjectSettingsPage,
})

function ProjectSettingsPage() {
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
  const { data: flaggers = [], isLoading: isLoadingFlaggers } = useProjectFlaggers(currentProject.id)

  const flaggerColumns: InfiniteTableColumn<FlaggerRecord>[] = [
    {
      key: "flagger",
      header: "Title",
      width: 260,
      minWidth: 220,
      render: (flagger) => (
        <Text.H5 className="min-w-0" weight="medium" noWrap ellipsis>
          {flagger.name}
        </Text.H5>
      ),
    },
    {
      key: "description",
      header: "Description",
      width: 520,
      minWidth: 320,
      render: (flagger) => (
        <Tooltip
          asChild
          trigger={
            <span className="block min-w-0 truncate">
              <Text.H6 color="foregroundMuted" noWrap ellipsis>
                {flagger.description}
              </Text.H6>
            </span>
          }
        >
          <div className="flex max-w-md flex-col gap-2">
            <Text.H5 weight="medium">{flagger.description}</Text.H5>
            <Text.H6 color="foregroundMuted">{flagger.instructions}</Text.H6>
          </div>
        </Tooltip>
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
      width: 92,
      minWidth: 84,
      align: "end",
      render: (flagger) => (
        <Switch
          checked={flagger.enabled}
          onCheckedChange={(checked) => void handleFlaggerEnabledChange(flagger, checked)}
          aria-label={`Toggle ${flagger.name}`}
        />
      ),
    },
  ]

  const handleProjectRename = useDebouncedCallback((name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName === currentProject.name) return

    const transaction = updateProjectMutation(currentProject.id, { name: trimmedName })
    void transaction.isPersisted.promise
      .then(() => {
        toast({ description: "Project name updated" })
      })
      .catch((error) => {
        toast({ variant: "destructive", description: toUserMessage(error) })
      })
  }, 600)

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

  // Run the sensitivity save through the codebase's standard
  // `createFormSubmitHandler` wrapper so error extraction stays consistent
  // with other settings forms. The slider isn't a typical form (no
  // submit button, no field-level UI for errors), so the form is a thin
  // shell: `defaultValues` seeds from the current setting and the slider's
  // `onValueCommit` fires `setFieldValue` + `handleSubmit` once on release.
  const sensitivityForm = useForm({
    defaultValues: {
      escalationSensitivity:
        currentProject.settings.alertNotifications?.escalationSensitivity ?? DEFAULT_ESCALATION_SENSITIVITY_K,
    },
    onSubmit: createFormSubmitHandler<{ escalationSensitivity: number }, void>(
      async ({ escalationSensitivity }) => {
        const transaction = updateProjectMutation(currentProject.id, {
          settings: {
            ...currentProject.settings,
            alertNotifications: {
              ...(currentProject.settings.alertNotifications ?? {}),
              escalationSensitivity,
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
    sensitivityForm.setFieldValue("escalationSensitivity", value)
    void sensitivityForm.handleSubmit()
  }

  const handleAlertNotificationChange = async (kind: AlertIncidentKind, checked: boolean) => {
    if (savingAlertKind !== null) return

    setSavingAlertKind(kind)
    try {
      const transaction = updateProjectMutation(currentProject.id, {
        settings: {
          ...currentProject.settings,
          alertNotifications: { ...(currentProject.settings.alertNotifications ?? {}), [kind]: checked },
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

  const handleFlaggerEnabledChange = async (flagger: FlaggerRecord, checked: boolean) => {
    try {
      const transaction = updateFlaggerMutation({
        projectId: currentProject.id,
        id: flagger.id,
        slug: flagger.slug,
        enabled: checked,
      })
      await transaction.isPersisted.promise
      toast({ description: checked ? "Flagger enabled" : "Flagger disabled" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
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
        <Layout.List className="pt-2 gap-6">
          <DetailSection
            icon={<FolderIcon className="w-4 h-4" />}
            label="Project"
            contentClassName="max-h-none overflow-visible pl-1 pr-2 pt-2"
          >
            <Input
              key={currentProject.id}
              required
              type="text"
              label="Name"
              defaultValue={currentProject.name}
              onChange={(event) => handleProjectRename(event.target.value)}
              placeholder="Project name"
              aria-label="Project name"
            />
          </DetailSection>
          <DetailSection
            icon={<ShieldAlertIcon className="w-4 h-4" />}
            label="Issues"
            contentClassName="max-h-none overflow-visible px-2 pt-2"
          >
            <div className="flex w-full flex-col gap-4">
              <div className="flex w-full flex-row items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="keep-monitoring">Monitor resolved issues</Label>
                  <Text.H6 color="foregroundMuted">
                    When enabled, evaluations monitoring active issues stay active after the issues are resolved to
                    detect further regressions
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
                    const checked = currentProject.settings.alertNotifications?.[toggle.kind] ?? true
                    return (
                      <div
                        key={toggle.kind}
                        className="flex w-full flex-row items-center justify-between gap-4 border-t border-border pt-4"
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
                    value={
                      currentProject.settings.alertNotifications?.escalationSensitivity ??
                      DEFAULT_ESCALATION_SENSITIVITY_K
                    }
                    onChange={handleSensitivityChange}
                  />
                </>
              ) : null}
            </div>
          </DetailSection>
          <DetailSection
            icon={<ScanSearchIcon className="w-4 h-4" />}
            label="Flaggers"
            contentClassName="max-h-none overflow-visible px-2 pt-2"
          >
            <div className="flex w-full flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label>Flaggers</Label>
                <Text.H6 color="foregroundMuted">
                  Flaggers automatically inspect new traces for known failure patterns and create issues when they
                  detect regressions. Enable only the checks that matter for this project.
                </Text.H6>
              </div>
              <InfiniteTable
                data={flaggers}
                isLoading={isLoadingFlaggers}
                columns={flaggerColumns}
                getRowKey={(flagger) => flagger.id}
                blankSlate="No flaggers have been provisioned for this project yet"
                scrollAreaLayout="intrinsic"
              />
            </div>
          </DetailSection>
        </Layout.List>
      </Layout.Content>
    </Layout>
  )
}

interface EscalationSensitivityControlProps {
  readonly value: number
  readonly onChange: (value: number) => void
}

// Local presentational state so dragging the slider feels responsive while
// the actual save is debounced through the parent's `onChange`. The hook
// follows `value` whenever it changes externally (initial load, saved value
// coming back, project switch) while still letting local drags override it
// without a `useEffect` round-trip.
function EscalationSensitivityControl({ value, onChange }: EscalationSensitivityControlProps) {
  const [draft, setDraft] = useValueWithDefault(value)

  return (
    <div className="flex w-full flex-col gap-3 border-t border-border pt-4">
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
          // `onValueChange` fires on every tick while dragging; keep it local so
          // the thumb tracks the pointer smoothly. The actual save runs in
          // `onValueCommit`, which Radix fires only on pointer-up / keyboard
          // commit — so users only persist a value once they release the slider.
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
