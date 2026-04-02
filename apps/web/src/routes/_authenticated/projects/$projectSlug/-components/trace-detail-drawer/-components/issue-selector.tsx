import { Button, Input, Select, type SelectOption, Text, Textarea } from "@repo/ui"
import { PlusIcon } from "lucide-react"
import { type SyntheticEvent, useState } from "react"
import { useCreateIssue, useListIssues } from "../../../../../../../domains/issues/issues.collection.ts"

function CreateIssueForm({
  projectId,
  onCreated,
  onCancel,
}: {
  readonly projectId: string
  readonly onCreated: (issueId: string) => void
  readonly onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const createMutation = useCreateIssue({ projectId })

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    createMutation.mutate(
      { projectId, name: name.trim(), description: description.trim() || undefined },
      { onSuccess: (issue) => onCreated(issue.id) },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-2">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Issue name"
        maxLength={128}
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
      />
      <div className="flex gap-1 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isLoading={createMutation.isPending} disabled={!name.trim()}>
          Create
        </Button>
      </div>
    </form>
  )
}

const READY_FOR_USAGE = false
export function IssueSelector({
  projectId,
  value,
  onChange,
}: {
  readonly projectId: string
  readonly value: string | null
  readonly onChange: (issueId: string | null) => void
}) {
  const [search, setSearch] = useState("")
  const [creatingNew, setCreatingNew] = useState(false)

  const nameFilter = search || undefined
  const { data: issues = [], isLoading } = useListIssues({ projectId, ...(nameFilter ? { nameFilter } : {}) })

  const options: SelectOption<string>[] = issues.map((issue) => ({
    label: issue.name,
    value: issue.id,
  }))

  const selectedName = issues.find((i) => i.id === value)?.name

  // TODO: Fix issue creation in the backend and re-enable this component. For now, we hide it to avoid confusion, but the code is here and ready to be used once the backend is ready.
  if (!READY_FOR_USAGE) return

  if (creatingNew) {
    return (
      <CreateIssueForm
        projectId={projectId}
        onCreated={(id) => {
          onChange(id)
          setCreatingNew(false)
        }}
        onCancel={() => setCreatingNew(false)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Text.H6 color="foregroundMuted">Issue</Text.H6>
      <Select<string>
        name="issue"
        placeholder="Link to issue…"
        options={options}
        value={value ?? undefined}
        searchable
        searchPlaceholder="Search issues…"
        searchableEmptyMessage="No issues found"
        searchLoading={isLoading}
        onSearch={setSearch}
        removable={value !== null}
        onChange={(id) => onChange(id ?? null)}
        side="bottom"
        footerAction={{
          label: "Create new issue",
          icon: <PlusIcon className="h-3.5 w-3.5" />,
          onClick: () => setCreatingNew(true),
        }}
      />
      {value && !selectedName && (
        <Text.H6 color="foregroundMuted" className="truncate">
          Issue linked
        </Text.H6>
      )}
    </div>
  )
}
