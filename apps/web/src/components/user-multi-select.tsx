import {
  Avatar,
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  FormField,
  Text,
} from "@repo/ui"
import { type RefObject, useMemo, useRef } from "react"
import { useMemberByUserIdMap } from "../domains/members/members.collection.ts"
import type { MemberRecord } from "../domains/members/members.functions.ts"

interface UserMultiSelectProps {
  readonly value: readonly string[]
  readonly onChange: (userIds: string[]) => void
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly label?: string
  readonly portalContainer?: RefObject<HTMLElement | null>
}

type ActiveMember = MemberRecord & { userId: string }

interface DisplayMember {
  userId: string
  name: string | null
  email: string
  image: string | null
  isUnknown?: boolean
}

function displayNameForMember(m: Pick<DisplayMember, "name" | "email" | "isUnknown">): string {
  if (m.isUnknown) return "Unknown"
  const n = m.name?.trim()
  if (n) return n
  return m.email
}

export function UserMultiSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "Search members...",
  label,
  portalContainer,
}: UserMultiSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const memberByUserId = useMemberByUserIdMap()

  const activeMembers = useMemo((): ActiveMember[] => {
    const result: ActiveMember[] = []
    for (const member of memberByUserId.values()) {
      if (member.status === "active" && member.userId !== null) {
        result.push(member as ActiveMember)
      }
    }
    return result
  }, [memberByUserId])

  const selectedDisplayMembers = useMemo((): DisplayMember[] => {
    return value.map((userId) => {
      const member = activeMembers.find((m) => m.userId === userId)
      if (member) {
        return member
      }
      return { userId, name: null, email: userId, image: null, isUnknown: true }
    })
  }, [value, activeMembers])

  const availableMembers = useMemo(() => activeMembers.filter((m) => !value.includes(m.userId)), [activeMembers, value])

  return (
    <FormField label={label}>
      <Combobox
        multiple
        autoHighlight
        modal
        value={selectedDisplayMembers}
        onValueChange={(members: DisplayMember[]) => onChange(members.map((m) => m.userId))}
        items={availableMembers}
        itemToStringValue={(m) => displayNameForMember(m)}
        isItemEqualToValue={(a, b) => a.userId === b.userId}
        disabled={disabled}
      >
        <ComboboxChips ref={anchorRef}>
          <ComboboxValue>
            {(members: DisplayMember[]) => (
              <>
                {members.map((m) => (
                  <ComboboxChip key={m.userId}>
                    <Avatar name={displayNameForMember(m)} imageSrc={m.image} size="xs" />
                    {displayNameForMember(m)}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput placeholder={placeholder} />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchorRef} container={portalContainer?.current}>
          <ComboboxEmpty>No members found.</ComboboxEmpty>
          <ComboboxList>
            {(m: ActiveMember) => (
              <ComboboxItem key={m.userId} value={m}>
                <Avatar name={displayNameForMember(m)} imageSrc={m.image} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <Text.H5 ellipsis>{displayNameForMember(m)}</Text.H5>
                  {m.name && (
                    <Text.H6 color="foregroundMuted" ellipsis>
                      {m.email}
                    </Text.H6>
                  )}
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FormField>
  )
}
