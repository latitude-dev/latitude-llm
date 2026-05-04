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
import { CircleDashedIcon, CircleUserRoundIcon } from "lucide-react"
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

const UNASSIGNED_KEY = "@unassigned"
const ME_KEY = "@me"

const UNASSIGNED_OPTION: MemberOption = {
  key: UNASSIGNED_KEY,
  userId: null,
  label: "Unassigned",
  searchText: "unassigned none nobody",
  imageSrc: null,
}

const ME_OPTION: MemberOption = {
  key: ME_KEY,
  userId: null,
  label: "Me",
  searchText: "me yourself",
  imageSrc: null,
}

interface MemberSelectorProps {
  readonly value: string | null
  readonly onChange: (userId: string | null) => void
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly disabled?: boolean
  readonly portalContainer?: RefObject<HTMLElement | null>
}

/**
 * Single-select picker for assigning an organization member. The list is `Unassigned` → `Me`
 * (current-user shortcut) → every active org member with a muted `(You)` suffix on the row that
 * points at the current user. The trigger displays the selected option's avatar/icon + label.
 *
 * `open` / `onOpenChange` make the popup controllable so other UI (e.g. a row's kebab menu) can
 * open the picker programmatically without imperative refs.
 */
export function MemberSelector({
  value,
  onChange,
  open,
  onOpenChange,
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

  const items = useMemo<MemberOption[]>(() => [UNASSIGNED_OPTION, ME_OPTION, ...memberOptions], [memberOptions])

  // Map `value` (the userId stored on the saved search) to the matching option, falling back to the
  // Unassigned option when null. This keeps the trigger styled like every other selection state and
  // lets `autoHighlight` highlight the right item on open without an additional `'always'` mode.
  const selectedOption = value
    ? (memberOptions.find((m) => m.userId === value) ?? UNASSIGNED_OPTION)
    : UNASSIGNED_OPTION

  const [inputValue, setInputValue] = useState("")

  return (
    <Combobox
      autoHighlight
      modal
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      value={selectedOption}
      onValueChange={(picked: MemberOption | null) => {
        setInputValue("")
        if (!picked || picked.key === UNASSIGNED_KEY) {
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
          <SelectedTrigger selected={selectedOption} />
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

function SelectedTrigger({ selected }: { readonly selected: MemberOption }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <OptionLeading item={selected} mutedIcon />
      <Text.H5 ellipsis noWrap color={selected.key === UNASSIGNED_KEY ? "foregroundMuted" : "foreground"}>
        {selected.label}
      </Text.H5>
    </span>
  )
}

function MemberOptionRow({ item, isMe }: { readonly item: MemberOption; readonly isMe: boolean }) {
  return (
    <ComboboxItem value={item}>
      <OptionLeading item={item} />
      <Text.H5 className="flex-1 truncate">{item.label}</Text.H5>
      {item.key !== ME_KEY && item.key !== UNASSIGNED_KEY && isMe ? (
        <Text.H6 color="foregroundMuted">(You)</Text.H6>
      ) : null}
    </ComboboxItem>
  )
}

function OptionLeading({ item, mutedIcon = false }: { readonly item: MemberOption; readonly mutedIcon?: boolean }) {
  if (item.key === UNASSIGNED_KEY) {
    return <Icon icon={CircleDashedIcon} size="default" color="foregroundMuted" />
  }
  if (item.key === ME_KEY) {
    return mutedIcon ? (
      <Icon icon={CircleUserRoundIcon} size="default" color="foregroundMuted" />
    ) : (
      <Icon icon={CircleUserRoundIcon} size="default" />
    )
  }
  return <Avatar size="xs" name={item.label} imageSrc={item.imageSrc} />
}
