import {
  Avatar,
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  Icon,
  Text,
} from "@repo/ui"
import { CircleUserRoundIcon } from "lucide-react"
import { type RefObject, useMemo, useRef, useState } from "react"
import { useMembersCollection } from "../domains/members/members.collection.ts"
import { useAuthenticatedUser } from "../routes/_authenticated/-route-data.ts"

interface MemberOption {
  readonly key: string
  readonly userId: string | null
  readonly label: string
  readonly searchText: string
  readonly imageSrc: string | null
}

const ME_KEY = "@me"

interface MemberSelectorProps {
  readonly value: string | null
  readonly onChange: (userId: string | null) => void
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly portalContainer?: RefObject<HTMLElement | null>
}

/**
 * Single-select picker for assigning an organization member. The first item is a "Me" shortcut that
 * resolves to the current user; the rest of the list is every active org member, with a muted
 * "(You)" suffix when the row points at the current user.
 */
export function MemberSelector({
  value,
  onChange,
  placeholder = "Unassigned",
  disabled,
  portalContainer,
}: MemberSelectorProps) {
  const me = useAuthenticatedUser()
  const { data: members } = useMembersCollection()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const memberOptions = useMemo<MemberOption[]>(() => {
    const rows = members ?? []
    return rows
      .filter((m) => m.status === "active" && m.userId)
      .map((m) => {
        const displayName = m.name?.trim() && m.name.trim().length > 0 ? m.name.trim() : m.email
        return {
          key: m.userId as string,
          userId: m.userId,
          label: displayName,
          searchText: `${displayName} ${m.email}`.toLowerCase(),
          imageSrc: m.image,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [members])

  const items = useMemo<MemberOption[]>(
    () => [{ key: ME_KEY, userId: null, label: "Me", searchText: "me yourself", imageSrc: null }, ...memberOptions],
    [memberOptions],
  )

  const selectedOption = value ? (memberOptions.find((m) => m.userId === value) ?? null) : null

  const [inputValue, setInputValue] = useState("")

  return (
    <Combobox
      autoHighlight
      modal
      value={selectedOption}
      onValueChange={(picked: MemberOption | null) => {
        setInputValue("")
        if (!picked) {
          onChange(null)
          return
        }
        if (picked.key === ME_KEY) {
          onChange(me.id)
          return
        }
        onChange(picked.userId)
      }}
      items={items}
      itemToStringValue={(item: MemberOption) => item.searchText}
      isItemEqualToValue={(a: MemberOption, b: MemberOption) => a.key === b.key}
      disabled={disabled}
    >
      <Button asChild variant="outline" size="sm" disabled={disabled} className="w-full justify-between">
        <ComboboxTrigger ref={triggerRef}>
          <SelectedTrigger selected={selectedOption} placeholder={placeholder} />
        </ComboboxTrigger>
      </Button>
      <ComboboxContent anchor={triggerRef} container={portalContainer?.current}>
        <ComboboxInput
          placeholder="Search members..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <ComboboxList>
          {(item: MemberOption) => <MemberOptionRow item={item} isMe={item.userId === me.id} />}
        </ComboboxList>
        <ComboboxEmpty>No members found.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  )
}

function SelectedTrigger({
  selected,
  placeholder,
}: {
  readonly selected: MemberOption | null
  readonly placeholder: string
}) {
  if (!selected) {
    return <Text.H5 color="foregroundMuted">{placeholder}</Text.H5>
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar size="xs" name={selected.label} imageSrc={selected.imageSrc} />
      <Text.H5 ellipsis noWrap>
        {selected.label}
      </Text.H5>
    </span>
  )
}

function MemberOptionRow({ item, isMe }: { readonly item: MemberOption; readonly isMe: boolean }) {
  return (
    <ComboboxItem value={item}>
      {item.key === ME_KEY ? (
        <Icon icon={CircleUserRoundIcon} size="sm" color="foregroundMuted" />
      ) : (
        <Avatar size="xs" name={item.label} imageSrc={item.imageSrc} />
      )}
      <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
      {item.key !== ME_KEY && isMe ? <Text.H6 color="foregroundMuted">(You)</Text.H6> : null}
    </ComboboxItem>
  )
}
