import {
  Avatar,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@repo/ui"
import { CheckIcon, ChevronDown, CircleDashedIcon, UserRoundIcon } from "lucide-react"
import { useMemo } from "react"
import { useMembersCollection } from "../../../../../../domains/members/members.collection.ts"

/** Issues-list assignee filter token: a member userId or the unassigned sentinel. */
export const UNASSIGNED_FILTER_TOKEN = "unassigned"

interface AssigneeFilterOption {
  readonly token: string
  readonly label: string
  readonly imageSrc: string | null
}

/**
 * Multi-select assignee filter for the issues list. Route-local on purpose:
 * it encodes the issues filter's `"unassigned"` sentinel, which would be
 * noise on the general-purpose `MemberSelector`.
 */
export function AssigneeFilter({
  value,
  onChange,
}: {
  readonly value: readonly string[]
  readonly onChange: (next: readonly string[]) => void
}) {
  const { data: members } = useMembersCollection()

  const memberOptions = useMemo<AssigneeFilterOption[]>(() => {
    const rows = members ?? []
    return rows
      .filter((m) => m.status === "active" && m.userId)
      .map((m) => {
        const displayName = m.name?.trim() && m.name.trim().length > 0 ? m.name.trim() : m.email
        return { token: m.userId as string, label: displayName, imageSrc: m.image }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [members])

  const selected = useMemo(() => new Set(value), [value])

  const toggle = (token: string) => {
    const next = new Set(selected)
    if (next.has(token)) {
      next.delete(token)
    } else {
      next.add(token)
    }
    onChange([...next])
  }

  const triggerLabel = useMemo(() => {
    if (selected.size === 0) return "Assignee"
    if (selected.size > 1) return `${selected.size} assignees`
    if (selected.has(UNASSIGNED_FILTER_TOKEN)) return "Unassigned"
    const only = memberOptions.find((option) => selected.has(option.token))
    return only?.label ?? "1 assignee"
  }, [memberOptions, selected])

  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <Button variant={selected.size > 0 ? "secondary" : "outline"} size="sm">
          <Icon icon={UserRoundIcon} size="sm" />
          {triggerLabel}
          <Icon icon={ChevronDown} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Filter by assignee</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AssigneeFilterRow
          label="Unassigned"
          leading={<Icon icon={CircleDashedIcon} size="sm" color="foregroundMuted" />}
          checked={selected.has(UNASSIGNED_FILTER_TOKEN)}
          onToggle={() => toggle(UNASSIGNED_FILTER_TOKEN)}
        />
        {memberOptions.map((option) => (
          <AssigneeFilterRow
            key={option.token}
            label={option.label}
            leading={<Avatar size="xs" name={option.label} imageSrc={option.imageSrc} />}
            checked={selected.has(option.token)}
            onToggle={() => toggle(option.token)}
          />
        ))}
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])} className="cursor-pointer justify-center">
              Clear filter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  )
}

function AssigneeFilterRow({
  label,
  leading,
  checked,
  onToggle,
}: {
  readonly label: string
  readonly leading: React.ReactNode
  readonly checked: boolean
  readonly onToggle: () => void
}) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={checked}
      onSelect={(event) => {
        event.preventDefault()
        onToggle()
      }}
      className="cursor-pointer gap-2"
    >
      {leading}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked && <Icon icon={CheckIcon} size="sm" />}
    </DropdownMenuItem>
  )
}
