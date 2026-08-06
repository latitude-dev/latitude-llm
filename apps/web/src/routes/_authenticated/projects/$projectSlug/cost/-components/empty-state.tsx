import { Icon, Text } from "@repo/ui"
import type { LucideIcon } from "lucide-react"

/**
 * A chart or table's "no data in this window" state: an icon over a centered message,
 * sized to sit inside the same card a populated chart would fill. Shared so every empty
 * state in this section reads as one family instead of each panel inventing its own.
 */
export function EmptyState({ icon, message }: { readonly icon: LucideIcon; readonly message: string }) {
  return (
    <div className="flex min-h-[120px] w-full flex-col items-center justify-center gap-2 px-4 py-3">
      <Icon icon={icon} size="lg" color="foregroundMuted" />
      <Text.H6 align="center" display="block" color="foregroundMuted">
        {message}
      </Text.H6>
    </div>
  )
}
