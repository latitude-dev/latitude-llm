import { useLocalStorage } from "@repo/ui"
import { useChangelogEntries } from "../../../../domains/changelog/changelog.collection.ts"
import { ChangelogBanner } from "./changelog-banner.tsx"
import {
  type ChangelogBannerDismissed,
  isChangelogBannerDismissed,
  parseDismissedBannerState,
  toDismissedBannerState,
} from "./changelog-utils.ts"
import { WhatsNewButton } from "./whats-new-button.tsx"

const DISMISSED_ENTRY_STORAGE_KEY = "changelog-banner-dismissed-entry-id"

/**
 * Sidebar footer changelog entry: expanded {@link ChangelogBanner} for the latest
 * entry, or the compact {@link WhatsNewButton} popover when dismissed or when the
 * sidebar is collapsed.
 *
 * Dismiss is scoped to the current latest entry (id + publishedAt). Publishing a
 * new Framer item or changing the latest entry's date re-expands the banner once
 * the changelog query picks up the update.
 */
export function ChangelogSidebarEntry({ collapsed = false }: { collapsed?: boolean }) {
  const { entries, isLoading } = useChangelogEntries()
  const { value: dismissedRaw, setValue: setDismissedRaw } = useLocalStorage<unknown>({
    key: DISMISSED_ENTRY_STORAGE_KEY,
    defaultValue: null,
  })

  const dismissed = parseDismissedBannerState(dismissedRaw)
  const setDismissed = (next: ChangelogBannerDismissed | null) => {
    setDismissedRaw(next)
  }

  const latestEntry = entries[0]
  const bannerDismissed = latestEntry !== undefined && isChangelogBannerDismissed(latestEntry, dismissed)

  if (!isLoading && entries.length === 0) {
    return null
  }

  if (collapsed || !latestEntry || bannerDismissed) {
    return <WhatsNewButton collapsed={collapsed} />
  }

  return (
    <ChangelogBanner
      title={latestEntry.title}
      description={latestEntry.summary}
      coverUrl={latestEntry.coverUrl}
      onCollapse={() => setDismissed(toDismissedBannerState(latestEntry))}
    />
  )
}
