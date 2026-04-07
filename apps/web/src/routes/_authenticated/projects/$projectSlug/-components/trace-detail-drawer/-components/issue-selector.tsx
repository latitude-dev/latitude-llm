import { Icon, Select, type SelectOption, Text } from "@repo/ui"
import { Sparkles } from "lucide-react"
import { useListIssues } from "../../../../../../../domains/issues/issues.collection.ts"

export function IssueSelector({
  projectId,
  value,
  onChange,
}: {
  readonly projectId: string
  readonly value: string | null
  readonly onChange: (issueId: string | null) => void
}) {
  const { data: issues = [], isLoading } = useListIssues({ projectId })

  const options: SelectOption<string>[] = issues.map((issue) => ({
    label: issue.name,
    value: issue.id,
  }))

  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">Issue</Text.H6>
      <Select<string>
        name="issue"
        placeholder="Discover issue automatically"
        placeholderIcon={<Icon icon={Sparkles} size="sm" color="foregroundMuted" />}
        options={options}
        value={value ?? undefined}
        loading={isLoading && issues.length === 0}
        searchable
        searchPlaceholder="Search issues…"
        searchableEmptyMessage="No issues found"
        removable={value !== null}
        onChange={(id) => onChange(id ?? null)}
        side="bottom"
      />
    </div>
  )
}
