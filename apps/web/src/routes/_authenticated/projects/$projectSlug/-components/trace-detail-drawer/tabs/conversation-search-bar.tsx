import { Button, cn, Icon, Input } from "@repo/ui"
import { SearchIcon, XIcon } from "lucide-react"

export const CONVERSATION_SEARCH_MAX_LENGTH = 500

export function ConversationSearchBar({
  value,
  onChange,
  className,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly className?: string
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Icon
        icon={SearchIcon}
        size="sm"
        color="foregroundMuted"
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search in conversation…"
        maxLength={CONVERSATION_SEARCH_MAX_LENGTH}
        aria-label="Search in conversation"
        className={cn("bg-muted/40 pl-8", value.length > 0 && "pr-8")}
      />
      {value.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear conversation search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2"
          onClick={() => onChange("")}
        >
          <Icon icon={XIcon} size="xs" />
        </Button>
      ) : null}
    </div>
  )
}
