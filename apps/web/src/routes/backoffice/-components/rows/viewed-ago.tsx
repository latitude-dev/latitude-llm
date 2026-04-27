import { Icon, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { ClockIcon } from "lucide-react"

/**
 * Compact "viewed Xh ago" indicator for backoffice list rows.
 *
 * Used in the row components' trailing slot when the entity is in the
 * user's recently-viewed storage. Visually quieter than a date — a
 * small clock icon + relative time in muted text — so it sits next to
 * the chevron without competing for attention.
 */
export function ViewedAgo({ at }: { at: Date }) {
  return (
    <div className="flex items-center gap-1" title={`Viewed ${relativeTime(at)}`}>
      <Icon icon={ClockIcon} size="xs" color="foregroundMuted" />
      <Text.H6 color="foregroundMuted" noWrap>
        viewed {relativeTime(at)}
      </Text.H6>
    </div>
  )
}
