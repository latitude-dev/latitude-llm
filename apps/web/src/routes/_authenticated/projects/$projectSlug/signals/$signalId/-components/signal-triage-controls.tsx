import { Icon, Select, type SelectOption, Text, useToast } from "@repo/ui"
import {
  SIGNAL_PRIORITY_META,
  type SignalPriorityGroupId,
} from "../../../../../../../components/signals/signal-priority-meta.tsx"
import { MemberSelector } from "../../../../../../../components/member-selector.tsx"
import { useSignalDetail, useUpdateSignalTriage } from "../../../../../../../domains/signals/signals.collection.ts"
import type { UpdateSignalTriageRecord } from "../../../../../../../domains/signals/signals.functions.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"

type Priority = NonNullable<UpdateSignalTriageRecord["priority"]>

// Non-empty sentinel for the "cleared" option: Radix `Select.Item` forbids an
// empty-string value (it reserves "" for the placeholder/clear state).
const UNSET = "__unset__" as const

// Ascending urgency in the picker (Linear-style), derived from the shared
// priority meta so icons/labels match the list group headers and the palette.
const PRIORITY_OPTIONS: SelectOption<Priority | typeof UNSET>[] = (
  ["none", "low", "medium", "high", "urgent"] satisfies readonly SignalPriorityGroupId[]
).map((id) => ({
  label: SIGNAL_PRIORITY_META[id].label,
  value: id === "none" ? UNSET : id,
  icon: <Icon icon={SIGNAL_PRIORITY_META[id].icon} size="sm" color={SIGNAL_PRIORITY_META[id].iconColor} />,
}))

/**
 * Light-triage controls for the issue page: assignee + priority. Status stays
 * the existing resolve/ignore lifecycle (rendered by `SignalLifecycleActions`).
 * Reads current values from the issue detail and writes via `updateSignalTriage`.
 *
 * `compact` drops the floating field labels and renders the two pickers inline —
 * for the page header's action cluster, where the placeholders ("Unassigned" /
 * "No priority") already say what each control is, tracker-style.
 */
export function SignalTriageControls({
  projectId,
  signalId,
  compact = false,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly compact?: boolean
}) {
  const { toast } = useToast()
  const { data: issue, isLoading } = useSignalDetail({ projectId, signalId })
  const triage = useUpdateSignalTriage(projectId, signalId)

  const onError = (error: unknown) => toast({ variant: "destructive", description: toUserMessage(error) })

  const disabled = isLoading || issue === null || issue === undefined || triage.isPending

  const assigneePicker = (
    <MemberSelector
      value={issue?.assigneeId ?? null}
      disabled={disabled}
      onChange={(userId) => triage.mutate({ assigneeId: userId }, { onError })}
    />
  )

  const priorityPicker = (
    <Select
      name="issue-priority"
      options={PRIORITY_OPTIONS}
      value={issue?.priority ?? UNSET}
      placeholder="No priority"
      disabled={disabled}
      size="small"
      triggerClassName="rounded-lg px-2 shadow-none"
      onChange={(value) => triage.mutate({ priority: value === UNSET ? null : value }, { onError })}
    />
  )

  if (compact) {
    return (
      <div className="flex flex-row items-center gap-2">
        <div className="min-w-0 max-w-[160px]">{assigneePicker}</div>
        <div className="min-w-0 max-w-[140px]">{priorityPicker}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-row flex-wrap items-end gap-3">
      <div className="flex w-48 flex-col gap-1">
        <Text.H6 color="foregroundMuted">Assignee</Text.H6>
        {assigneePicker}
      </div>
      <div className="flex w-40 flex-col gap-1">
        <Text.H6 color="foregroundMuted">Priority</Text.H6>
        {priorityPicker}
      </div>
    </div>
  )
}
