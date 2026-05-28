import { FULL_CHANGELOG_URL } from "@domain/changelog"
import { cn, DotIndicator, Icon, Popover, PopoverContent, PopoverTrigger, Text } from "@repo/ui"
import { ExternalLink, Megaphone } from "lucide-react"
import { useState } from "react"
import { useChangelogEntries } from "../../../../domains/changelog/changelog.collection.ts"
import type { ChangelogEntryRecord } from "../../../../domains/changelog/changelog.functions.ts"

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
const RECENT_ENTRY_WINDOW_MS = 48 * 60 * 60 * 1000

const changelogEntryUrl = (entry: ChangelogEntryRecord) => `${FULL_CHANGELOG_URL}/${entry.slug}`

const isRecentlyPublished = (entry: ChangelogEntryRecord, now: number) => {
  const publishedAt = new Date(entry.publishedAt).getTime()
  const age = now - publishedAt
  return !Number.isNaN(publishedAt) && age >= 0 && age <= RECENT_ENTRY_WINDOW_MS
}

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

function WhatsNewContent() {
  const { entries } = useChangelogEntries()
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)

  return (
    <div className="flex flex-col">
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
 * Sidebar-footer "What's new" entry point. Renders nothing when no changelog
 * entries are available (Framer unconfigured or unreachable).
 */
export function WhatsNewButton({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false)
  const { entries, isLoading } = useChangelogEntries()
  const now = Date.now()
  const hasRecentEntry = entries.some((entry) => isRecentlyPublished(entry, now))

  if (!isLoading && entries.length === 0) {
    return null
  }

  const triggerClassName = cn("relative rounded-lg transition-colors hover:bg-muted", {
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
          {hasRecentEntry ? (
            <DotIndicator variant="primary" size="md" ping className={cn({ "absolute right-2 top-2": collapsed })} />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        sideOffset={8}
        className="w-[320px] p-0"
      >
        {open ? <WhatsNewContent /> : null}
      </PopoverContent>
    </Popover>
  )
}
