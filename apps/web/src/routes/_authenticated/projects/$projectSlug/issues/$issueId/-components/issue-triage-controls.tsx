import { Select, type SelectOption, Text, useToast } from "@repo/ui"
import { useMemo } from "react"
import { useIssueDetail, useUpdateIssueTriage } from "../../../../../../../domains/issues/issues.collection.ts"
import type { UpdateIssueTriageRecord } from "../../../../../../../domains/issues/issues.functions.ts"
import { useMembersCollection } from "../../../../../../../domains/members/members.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"

type Priority = NonNullable<UpdateIssueTriageRecord["priority"]>

const UNSET = "" as const

const PRIORITY_OPTIONS: SelectOption<Priority | typeof UNSET>[] = [
  { label: "No priority", value: UNSET },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
]

/**
 * Light-triage controls for the issue page: assignee + priority. Status stays
 * the existing resolve/ignore lifecycle (rendered by `IssueLifecycleActions`).
 * Reads current values from the issue detail and writes via `updateIssueTriage`.
 */
export function IssueTriageControls({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  const { toast } = useToast()
  const { data: issue, isLoading } = useIssueDetail({ projectId, issueId })
  const { data: members } = useMembersCollection()
  const triage = useUpdateIssueTriage(projectId, issueId)

  const assigneeOptions = useMemo<SelectOption<string>[]>(() => {
    const memberOptions = (members ?? [])
      .filter((member) => member.status === "active" && member.userId)
      .map((member) => ({
        label: member.name?.trim() || member.email,
        value: member.userId as string,
      }))
    return [{ label: "Unassigned", value: UNSET }, ...memberOptions]
  }, [members])

  const onError = (error: unknown) => toast({ variant: "destructive", description: toUserMessage(error) })

  const disabled = isLoading || issue === null || issue === undefined || triage.isPending

  return (
    <div className="flex flex-row flex-wrap items-end gap-3">
      <div className="flex w-48 flex-col gap-1">
        <Text.H6 color="foregroundMuted">Assignee</Text.H6>
        <Select
          name="issue-assignee"
          options={assigneeOptions}
          value={issue?.assigneeId ?? UNSET}
          placeholder="Unassigned"
          searchable
          disabled={disabled}
          onChange={(value) => triage.mutate({ assigneeId: value === UNSET ? null : value }, { onError })}
        />
      </div>
      <div className="flex w-40 flex-col gap-1">
        <Text.H6 color="foregroundMuted">Priority</Text.H6>
        <Select
          name="issue-priority"
          options={PRIORITY_OPTIONS}
          value={issue?.priority ?? UNSET}
          placeholder="No priority"
          disabled={disabled}
          onChange={(value) => triage.mutate({ priority: value === UNSET ? null : value }, { onError })}
        />
      </div>
    </div>
  )
}
