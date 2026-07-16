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
  Text,
} from "@repo/ui"
import { CheckIcon, ChevronDown, CircleDashedIcon, UserRoundIcon } from "lucide-react"
import { useMemo } from "react"
import { useProjectMembersCollection } from "../../../../../../domains/members/members.collection.ts"
import { compareMemberLabelsCurrentUserFirst } from "../../../../../../domains/members/pick-users-from-members.ts"
import { useAuthenticatedUser } from "../../../../../../routes/_authenticated/-route-data.ts"

/** Signals-list assignee filter token: a member userId or the unassigned sentinel. */
export const UNASSIGNED_FILTER_TOKEN = "unassigned"

interface AssigneeFilterOption {
  readonly token: string
  readonly label: string
  readonly imageSrc: string | null
  readonly isMe: boolean
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
  const me = useAuthenticatedUser()
  const { data: members } = useProjectMembersCollection()

  const memberOptions = useMemo<AssigneeFilterOption[]>(() => {
    const rows = members ?? []
    return rows
      .filter((m) => m.status === "active" && m.userId)
      .map((m) => {
        const displayName = m.name?.trim() && m.name.trim().length > 0 ? m.name.trim() : m.email
        const userId = m.userId as string
        return { token: userId, label: displayName, imageSrc: m.image, isMe: userId === me.id }
      })
      .sort((a, b) =>
        compareMemberLabelsCurrentUserFirst(
          me.id,
          { memberUserId: a.token, label: a.label },
          {
            memberUserId: b.token,
            label: b.label,
          },
        ),
      )
  }, [members, me.id])

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
        <Button variant={selected.size > 0 ? "secondary" : "outline"}>
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
          isMe={false}
          leading={<Icon icon={CircleDashedIcon} size="sm" color="foregroundMuted" />}
          checked={selected.has(UNASSIGNED_FILTER_TOKEN)}
          onToggle={() => toggle(UNASSIGNED_FILTER_TOKEN)}
        />
        {memberOptions.map((option) => (
          <AssigneeFilterRow
            key={option.token}
            label={option.label}
            isMe={option.isMe}
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
  isMe,
  leading,
  checked,
  onToggle,
}: {
  readonly label: string
  readonly isMe: boolean
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
      {isMe ? <Text.H6 color="foregroundMuted">(You)</Text.H6> : null}
      {checked && <Icon icon={CheckIcon} size="sm" />}
    </DropdownMenuItem>
  )
}
