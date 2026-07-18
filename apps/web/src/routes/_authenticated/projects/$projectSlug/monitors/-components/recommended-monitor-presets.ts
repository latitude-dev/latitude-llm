import type { MonitorTarget } from "@domain/monitors"
import {
  AlertTriangleIcon,
  CoinsIcon,
  GaugeIcon,
  type LucideIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  ZapIcon,
} from "lucide-react"
import { describeMonitorTarget } from "../../../../../../domains/monitors/monitor-target.ts"
import { type AlertDraft, targetAlertDraft } from "./alert-form-helpers.ts"

interface RecommendedMonitorPreset {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly icon: LucideIcon
  readonly draft: AlertDraft
}

const escalatingCountDraft = (target: MonitorTarget, overrides: Partial<AlertDraft> = {}): AlertDraft =>
  targetAlertDraft(target, {
    kind: "monitor.escalating",
    comparison: "timesMoreThan",
    baselineKind: "expected",
    amount: 3,
    windowAmount: 15,
    windowUnit: "minutes",
    metric: { kind: "count" },
    ...overrides,
  })

const absoluteThresholdDraft = (target: MonitorTarget, overrides: Partial<AlertDraft>): AlertDraft =>
  targetAlertDraft(target, {
    kind: "monitor.threshold",
    comparison: "times",
    amount: 1,
    direction: "above",
    ...overrides,
  })

const targetWithFilter = (
  target: MonitorTarget,
  filterSet: NonNullable<MonitorTarget["filterSet"]>,
): MonitorTarget => ({
  ...target,
  filterSet: { ...(target.filterSet ?? {}), ...filterSet },
})

const failingToolTarget = (target: MonitorTarget): MonitorTarget =>
  targetWithFilter(target, { status: [{ op: "eq", value: "error" }] })

export const toolMonitorPresets = (target: MonitorTarget): readonly RecommendedMonitorPreset[] => {
  const allTools = describeMonitorTarget(target)?.kind === "allTools"
  if (allTools) {
    return [
      {
        id: "failures-increased",
        name: "Tool failures increased",
        description: "Opens an incident when failed tool calls stay higher than expected.",
        icon: AlertTriangleIcon,
        draft: escalatingCountDraft(failingToolTarget(target), { severity: "high" }),
      },
      {
        id: "latency-increased",
        name: "Tool latency increased",
        description: "Opens an incident when median latency across tool calls exceeds 2s.",
        icon: GaugeIcon,
        draft: absoluteThresholdDraft(target, {
          metric: { kind: "median", field: "duration" },
          amount: 2,
          severity: "medium",
        }),
      },
      {
        id: "usage-spike",
        name: "Tool usage spiked",
        description: "Opens an incident when total tool call volume stays higher than expected.",
        icon: TrendingUpIcon,
        draft: escalatingCountDraft(target, { severity: "medium", windowAmount: 30 }),
      },
      {
        id: "usage-drop",
        name: "Tool usage dropped",
        description: "Opens an incident when total tool call volume stays lower than expected.",
        icon: TrendingDownIcon,
        draft: escalatingCountDraft(target, {
          direction: "below",
          severity: "medium",
          windowAmount: 60,
        }),
      },
    ]
  }

  return [
    {
      id: "failing",
      name: "Tool is failing",
      description: "Opens an incident when failed calls for this tool stay higher than expected.",
      icon: AlertTriangleIcon,
      draft: escalatingCountDraft(failingToolTarget(target), { severity: "high" }),
    },
    {
      id: "slow",
      name: "Tool is slow",
      description: "Opens an incident when median latency exceeds 2s.",
      icon: GaugeIcon,
      draft: absoluteThresholdDraft(target, {
        metric: { kind: "median", field: "duration" },
        amount: 2,
        severity: "medium",
      }),
    },
    {
      id: "usage-spike",
      name: "Usage spiked",
      description: "Opens an incident when call volume stays higher than expected.",
      icon: TrendingUpIcon,
      draft: escalatingCountDraft(target, { severity: "medium" }),
    },
    {
      id: "usage-drop",
      name: "Usage dropped",
      description: "Opens an incident when call volume stays lower than expected.",
      icon: TrendingDownIcon,
      draft: escalatingCountDraft(target, {
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
      draft: escalatingCountDraft(target, { severity: "high", amount: 2 }),
    },
  ]
}

export const userMonitorPresets = (target: MonitorTarget): readonly RecommendedMonitorPreset[] => {
  const allUsers = describeMonitorTarget(target)?.kind === "allUsers"
  const subject = allUsers ? "users" : "this user"
  return [
    {
      id: "errors",
      name: allUsers ? "Users are having errors" : "User is having errors",
      description: `Opens an incident when failed traces for ${subject} stay higher than expected.`,
      icon: AlertTriangleIcon,
      draft: escalatingCountDraft(targetWithFilter(target, { status: [{ op: "eq", value: "error" }] }), {
        severity: "high",
        windowAmount: 30,
      }),
    },
    {
      id: "slow",
      name: allUsers ? "Users are seeing slow responses" : "User is seeing slow responses",
      description: `Opens an incident when median trace latency for ${subject} exceeds 2s.`,
      icon: GaugeIcon,
      draft: absoluteThresholdDraft(target, {
        metric: { kind: "median", field: "duration" },
        amount: 2,
        severity: "medium",
      }),
    },
    {
      id: "activity-spike",
      name: "Activity spiked",
      description: `Opens an incident when session volume for ${subject} stays higher than expected.`,
      icon: TrendingUpIcon,
      draft: escalatingCountDraft(target, { severity: "medium", windowAmount: 30 }),
    },
    {
      id: "activity-drop",
      name: "Activity dropped",
      description: `Opens an incident when session volume for ${subject} stays lower than expected.`,
      icon: TrendingDownIcon,
      draft: escalatingCountDraft(target, {
        direction: "below",
        severity: "medium",
        windowAmount: 60,
      }),
    },
    {
      id: "cost-spike",
      name: "Cost spiked",
      description: `Opens an incident when total cost for ${subject} exceeds $10 in the evaluation window.`,
      icon: CoinsIcon,
      draft: absoluteThresholdDraft(target, {
        metric: { kind: "sum", field: "cost" },
        amount: 10,
        severity: "medium",
      }),
    },
  ]
}
