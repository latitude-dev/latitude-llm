import type { MonitorTarget } from "@domain/monitors"
import { Button, cn, Icon, Modal, Text, useToast } from "@repo/ui"
import { AlertTriangleIcon, GaugeIcon, TrendingDownIcon, TrendingUpIcon, ZapIcon } from "lucide-react"
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

interface ToolMonitorPreset {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly icon: typeof AlertTriangleIcon
  readonly draft: AlertDraft
}

const presetDraft = (target: MonitorTarget, overrides: Partial<AlertDraft>): AlertDraft =>
  targetAlertDraft(target, {
    kind: "metric.escalating",
    comparison: "timesMoreThan",
    baselineKind: "expected",
    amount: 3,
    windowAmount: 15,
    windowUnit: "minutes",
    ...overrides,
  })

const toolMonitorPresets = (target: MonitorTarget): readonly ToolMonitorPreset[] => {
  const allTools = describeMonitorTarget(target)?.kind === "allTools"
  if (allTools) {
    return [
      {
        id: "failures-increased",
        name: "Tool failures increased",
        description: "Opens an incident when the overall tool error rate stays higher than expected.",
        icon: AlertTriangleIcon,
        draft: presetDraft(target, { metric: { kind: "errorRate" }, severity: "high" }),
      },
      {
        id: "latency-increased",
        name: "Tool latency increased",
        description: "Opens an incident when p95 latency across tool calls stays higher than expected.",
        icon: GaugeIcon,
        draft: presetDraft(target, { metric: { kind: "p95", field: "duration" }, severity: "medium" }),
      },
      {
        id: "usage-spike",
        name: "Tool usage spiked",
        description: "Opens an incident when total tool call volume stays higher than expected.",
        icon: TrendingUpIcon,
        draft: presetDraft(target, { metric: { kind: "count" }, severity: "medium", windowAmount: 30 }),
      },
      {
        id: "usage-drop",
        name: "Tool usage dropped",
        description: "Opens an incident when total tool call volume stays lower than expected.",
        icon: TrendingDownIcon,
        draft: presetDraft(target, {
          metric: { kind: "count" },
          direction: "below",
          severity: "medium",
          windowAmount: 60,
        }),
      },
      {
        id: "cost-spike",
        name: "Tool cost spiked",
        description: "Opens an incident when total tool-call cost stays higher than expected.",
        icon: ZapIcon,
        draft: presetDraft(target, { metric: { kind: "sum", field: "cost" }, severity: "medium", windowAmount: 30 }),
      },
    ]
  }

  return [
    {
      id: "failing",
      name: "Tool is failing",
      description: "Opens an incident when the tool's error rate stays higher than expected.",
      icon: AlertTriangleIcon,
      draft: presetDraft(target, { metric: { kind: "errorRate" }, severity: "high" }),
    },
    {
      id: "slow",
      name: "Tool is slow",
      description: "Opens an incident when p95 latency stays higher than expected.",
      icon: GaugeIcon,
      draft: presetDraft(target, { metric: { kind: "p95", field: "duration" }, severity: "medium" }),
    },
    {
      id: "usage-spike",
      name: "Usage spiked",
      description: "Opens an incident when call volume stays higher than expected.",
      icon: TrendingUpIcon,
      draft: presetDraft(target, { metric: { kind: "count" }, severity: "medium" }),
    },
    {
      id: "usage-drop",
      name: "Usage dropped",
      description: "Opens an incident when call volume stays lower than expected.",
      icon: TrendingDownIcon,
      draft: presetDraft(target, {
        metric: { kind: "count" },
        direction: "below",
        severity: "medium",
        windowAmount: 30,
      }),
    },
    {
      id: "overusing",
      name: "Agent is overusing it",
      description: "Opens an incident when calls stay unusually elevated, a common sign of loops or retries.",
      icon: ZapIcon,
      draft: presetDraft(target, { metric: { kind: "count" }, severity: "high", amount: 2 }),
    },
  ]
}

export function ToolMonitorCreateModal({
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
  const presets = toolMonitorPresets(target)
  const [mode, setMode] = useState<MonitorCreateMode>("recommended")
  const [selectedPresetId, setSelectedPresetId] = useState(presets[0]?.id ?? "")
  const [advancedValue, setAdvancedValue] = useState<AdvancedMonitorCreateValue>({
    name: "",
    description: "",
    nameError: undefined,
    alert: targetAlertDraft(target),
    alertErrors: {},
  })
  const targetName = monitorTargetName(target) ?? "this tool"

  const modeSwitch = <MonitorModeSwitch mode={mode} onModeChange={setMode} />

  const createPreset = async () => {
    const preset = presets.find((entry) => entry.id === selectedPresetId)
    if (!preset) return
    const alertTarget = draftToTarget(preset.draft)
    try {
      await create.mutateAsync({
        name: `${preset.name} — ${targetName}`,
        description: preset.description,
        alerts: [draftToAlertDraft(preset.draft)],
        ...(alertTarget ? { target: alertTarget } : {}),
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
        alerts: [draftToAlertDraft(advancedValue.alert)],
        ...(target ? { target } : {}),
      })
      toast({ description: "Monitor created." })
      onClose()
    } catch (error) {
      const fieldErrors = extractFieldErrors(error)
      const nameErr = fieldErrors?.name?.[0]
      const errors = alertFieldErrorsFrom(fieldErrors, 0)
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
      title="New tool monitor"
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
