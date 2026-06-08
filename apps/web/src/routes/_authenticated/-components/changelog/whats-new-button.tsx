import { FULL_CHANGELOG_URL } from "@domain/changelog"
import { cn, Icon, Popover, PopoverContent, PopoverTrigger, Text } from "@repo/ui"
import { ExternalLink, Megaphone, X } from "lucide-react"
import { useState } from "react"
import { useChangelogEntries } from "../../../../domains/changelog/changelog.collection.ts"
import type { ChangelogEntryRecord } from "../../../../domains/changelog/changelog.functions.ts"
import { changelogEntryUrl } from "./changelog-utils.ts"

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })

function ChangelogRow({
  entry,
  expanded,
  onActivate,
  onDeactivate,
}: {
  entry: ChangelogEntryRecord
  expanded: boolean
  onActivate: () => void
  onDeactivate: () => void
}) {
  return (
    <li>
      <a
        href={changelogEntryUrl(entry)}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={onActivate}
        onMouseLeave={onDeactivate}
        onFocus={onActivate}
        onBlur={onDeactivate}
        className="flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
      >
        <div className="flex w-full items-center gap-2">
          <Text.H5M ellipsis className="min-w-0 flex-1">
            {entry.title}
          </Text.H5M>
          <Text.H6 color="foregroundMuted" className="shrink-0">
            {dateFormatter.format(new Date(entry.publishedAt))}
          </Text.H6>
        </div>
        {entry.summary ? (
          <div
            className={cn("grid transition-[grid-template-rows] duration-200 ease-out", {
              "grid-rows-[1fr]": expanded,
              "grid-rows-[0fr]": !expanded,
            })}
          >
            <div className="overflow-hidden">
              <Text.H6 color="foregroundMuted" className="whitespace-normal pt-1">
                {entry.summary}
              </Text.H6>
            </div>
          </div>
        ) : null}
      </a>
    </li>
  )
}

function WhatsNewContent({ onClose }: { onClose: () => void }) {
  const { entries } = useChangelogEntries()
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Text.H5M color="foregroundMuted">What's new</Text.H5M>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-0.5 transition-colors hover:bg-muted">
          <Icon icon={X} size="xs" color="foregroundMuted" />
        </button>
      </div>
      <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-1" onMouseLeave={() => setActiveEntryId(null)}>
        {entries.map((entry) => (
          <ChangelogRow
            key={entry.id}
            entry={entry}
            expanded={activeEntryId === entry.id}
            onActivate={() => setActiveEntryId(entry.id)}
            onDeactivate={() => setActiveEntryId((current) => (current === entry.id ? null : current))}
          />
        ))}
      </ul>
      <a
        href={FULL_CHANGELOG_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 transition-colors hover:bg-muted"
      >
        <Text.H6 color="foregroundMuted" weight="medium">
          Full changelog
        </Text.H6>
        <Icon icon={ExternalLink} size="xs" color="foregroundMuted" />
      </a>
    </div>
  )
}

/**
 * Compact sidebar-footer "What's new" popover. Used when the changelog banner is
 * collapsed or the sidebar is narrow.
 */
export function WhatsNewButton({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false)
  const { entries, isLoading } = useChangelogEntries()

  if (!isLoading && entries.length === 0) {
    return null
  }

  const triggerClassName = cn("rounded-lg transition-colors hover:bg-muted", {
    "flex h-10 w-10 items-center justify-center": collapsed,
    "flex w-full items-center gap-2 px-2 py-2 text-left": !collapsed,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          title={collapsed ? "What's new" : undefined}
          aria-label="What's new"
        >
          <Icon icon={Megaphone} size="sm" className="text-muted-foreground" />
          {!collapsed ? (
            <Text.H5M color="foregroundMuted" ellipsis className="min-w-0 flex-1">
              What's new
            </Text.H5M>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        sideOffset={8}
        className="w-[320px] p-0"
      >
        {open ? <WhatsNewContent onClose={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  )
}
