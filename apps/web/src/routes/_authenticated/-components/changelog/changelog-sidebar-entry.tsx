import { useLocalStorage } from "@repo/ui"
import { useChangelogEntries } from "../../../../domains/changelog/changelog.collection.ts"
import { ChangelogBanner } from "./changelog-banner.tsx"
import { WhatsNewButton } from "./whats-new-button.tsx"

const DISMISSED_ENTRY_STORAGE_KEY = "changelog-banner-dismissed-entry-id"

/**
 * Sidebar footer changelog entry: expanded {@link ChangelogBanner} for the latest
 * entry, or the compact {@link WhatsNewButton} popover when dismissed or when the
 * sidebar is collapsed.
 */
export function ChangelogSidebarEntry({ collapsed = false }: { collapsed?: boolean }) {
  const { entries, isLoading } = useChangelogEntries()
  const { value: dismissedEntryId, setValue: setDismissedEntryId } = useLocalStorage<string | null>({
    key: DISMISSED_ENTRY_STORAGE_KEY,
    defaultValue: null,
  })

  const latestEntry = entries[0]

  if (!isLoading && entries.length === 0) {
    return null
  }

  if (collapsed || !latestEntry || dismissedEntryId === latestEntry.id) {
    return <WhatsNewButton collapsed={collapsed} />
  }

  return (
    <ChangelogBanner
      title={latestEntry.title}
      description={latestEntry.summary}
      coverUrl={latestEntry.coverUrl}
      onCollapse={() => setDismissedEntryId(latestEntry.id)}
    />
  )
}
