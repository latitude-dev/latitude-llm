import type { MonitorTarget } from "@domain/monitors"
import { Button, cn, Icon, Modal, Text, useToast } from "@repo/ui"
import { AlertTriangleIcon, CoinsIcon, GaugeIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react"
import { useState } from "react"
import { describeMonitorTarget, monitorTargetName } from "../../../../../../domains/monitors/monitor-target.ts"
import { useCreateMonitor } from "../../../../../../domains/monitors/monitors.collection.ts"
import { extractFieldErrors, toUserMessage } from "../../../../../../lib/errors.ts"
import { AdvancedMonitorCreateFields, type AdvancedMonitorCreateValue } from "./advanced-monitor-create-fields.tsx"
import {
  type AlertDraft,
  alertFieldErrorsFrom,
  draftToAlertDraft,
  draftToTarget,
  hasAlertFieldErrors,
  targetAlertDraft,
} from "./alert-form-helpers.ts"
import { type MonitorCreateMode, MonitorModeSwitch } from "./monitor-mode-switch.tsx"

interface UserMonitorPreset {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly icon: typeof AlertTriangleIcon
  readonly draft: AlertDraft
}

const targetWithFilter = (
  target: MonitorTarget,
  filterSet: NonNullable<MonitorTarget["filterSet"]>,
): MonitorTarget => ({
  ...target,
  filterSet: { ...(target.filterSet ?? {}), ...filterSet },
})

const expectedRelativeDraft = (
  target: MonitorTarget,
  kind: "monitor.threshold" | "monitor.escalating",
  overrides: Partial<AlertDraft>,
): AlertDraft =>
  targetAlertDraft(target, {
    kind,
    comparison: "timesMoreThan",
    baselineKind: "expected",
    amount: 3,
    windowAmount: 30,
    windowUnit: "minutes",
    ...overrides,
  })

const userMonitorPresets = (target: MonitorTarget): readonly UserMonitorPreset[] => {
  const allUsers = describeMonitorTarget(target)?.kind === "allUsers"
  const subject = allUsers ? "users" : "this user"
  return [
    {
      id: "errors",
      name: allUsers ? "Users are having errors" : "User is having errors",
      description: `Opens an incident when failed traces for ${subject} stay higher than expected.`,
      icon: AlertTriangleIcon,
      draft: expectedRelativeDraft(
        targetWithFilter(target, { status: [{ op: "eq", value: "error" }] }),
        "monitor.escalating",
        {
          metric: { kind: "count" },
          severity: "high",
        },
      ),
    },
    {
      id: "slow",
      name: allUsers ? "Users are seeing slow responses" : "User is seeing slow responses",
      description: `Opens an incident when median trace latency for ${subject} stays higher than expected.`,
      icon: GaugeIcon,
      draft: expectedRelativeDraft(target, "monitor.threshold", {
        metric: { kind: "median", field: "duration" },
        severity: "medium",
        windowAmount: 15,
      }),
    },
    {
      id: "activity-spike",
      name: "Activity spiked",
      description: `Opens an incident when session volume for ${subject} stays higher than expected.`,
      icon: TrendingUpIcon,
      draft: expectedRelativeDraft(target, "monitor.escalating", {
        metric: { kind: "count" },
        severity: "medium",
      }),
    },
    {
      id: "activity-drop",
      name: "Activity dropped",
      description: `Opens an incident when session volume for ${subject} stays lower than expected.`,
      icon: TrendingDownIcon,
      draft: expectedRelativeDraft(target, "monitor.escalating", {
        metric: { kind: "count" },
        direction: "below",
        severity: "medium",
        windowAmount: 60,
      }),
    },
    {
      id: "cost-spike",
      name: "Cost spiked",
      description: `Opens an incident when total cost for ${subject} stays higher than expected.`,
      icon: CoinsIcon,
      draft: expectedRelativeDraft(target, "monitor.threshold", {
        metric: { kind: "sum", field: "cost" },
        severity: "medium",
      }),
    },
  ]
}

export function UserMonitorCreateModal({
  projectId,
  projectSlug,
  target,
  onClose,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly target: MonitorTarget
  readonly onClose: () => void
}) {
  const create = useCreateMonitor(projectId)
  const { toast } = useToast()
  const presets = userMonitorPresets(target)
  const [mode, setMode] = useState<MonitorCreateMode>("recommended")
  const [selectedPresetId, setSelectedPresetId] = useState(presets[0]?.id ?? "")
  const [advancedValue, setAdvancedValue] = useState<AdvancedMonitorCreateValue>({
    name: "",
    description: "",
    nameError: undefined,
    alert: targetAlertDraft(target),
    alertErrors: {},
  })
  const targetName = monitorTargetName(target) ?? "this user"

  const modeSwitch = <MonitorModeSwitch mode={mode} onModeChange={setMode} />

  const createPreset = async () => {
    const preset = presets.find((entry) => entry.id === selectedPresetId)
    if (!preset) return
    const presetTarget = draftToTarget(preset.draft)
    try {
      await create.mutateAsync({
        name: `${preset.name} — ${targetName}`,
        description: preset.description,
        rule: draftToAlertDraft(preset.draft),
        ...(presetTarget ? { target: presetTarget } : {}),
      })
      toast({ description: "Monitor created." })
      onClose()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const createAdvanced = async () => {
    const trimmedName = advancedValue.name.trim()
    if (trimmedName.length === 0) {
      setAdvancedValue({ ...advancedValue, nameError: "Name is required" })
      return
    }
    const target = draftToTarget(advancedValue.alert)
    try {
      await create.mutateAsync({
        name: trimmedName,
        ...(advancedValue.description.trim() ? { description: advancedValue.description.trim() } : {}),
        rule: draftToAlertDraft(advancedValue.alert),
        ...(target ? { target } : {}),
      })
      toast({ description: "Monitor created." })
      onClose()
    } catch (error) {
      const fieldErrors = extractFieldErrors(error)
      const nameErr = fieldErrors?.name?.[0]
      const errors = alertFieldErrorsFrom(fieldErrors, null)
      if (nameErr || hasAlertFieldErrors(errors)) {
        setAdvancedValue({ ...advancedValue, ...(nameErr ? { nameError: nameErr } : {}), alertErrors: errors })
        return
      }
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  return (
    <Modal
      open
      dismissible
      size="large"
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="New user monitor"
      description={`Choose a recommended aggregate monitor for ${targetName}, or switch to the advanced form.`}
      footer={
        <Button
          disabled={create.isPending || (mode === "recommended" && !selectedPresetId)}
          isLoading={create.isPending}
          onClick={() => void (mode === "advanced" ? createAdvanced() : createPreset())}
        >
          {create.isPending ? "Creating" : "Create monitor"}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {modeSwitch}
        {mode === "advanced" ? (
          <AdvancedMonitorCreateFields
            value={advancedValue}
            onChange={setAdvancedValue}
            projectId={projectId}
            projectSlug={projectSlug}
          />
        ) : null}
        {mode === "recommended"
          ? presets.map((preset) => {
              const selected = preset.id === selectedPresetId
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={create.isPending}
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
                    { "border-primary bg-muted": selected, "border-border": !selected },
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon icon={preset.icon} size="sm" color="foregroundMuted" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Text.H5M>{preset.name}</Text.H5M>
                    <Text.H6 color="foregroundMuted">{preset.description}</Text.H6>
                  </div>
                </button>
              )
            })
          : null}
      </div>
    </Modal>
  )
}
