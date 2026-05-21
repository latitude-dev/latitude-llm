import { Icon, Text } from "@repo/ui"
import type { LucideProps } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

/**
 * Compact row for a single third-party integration on the
 * `/settings/integrations` page. Today's only consumer is Slack, but
 * the shape is reusable for future vendors (Telegram, Discord,
 * GitHub Apps) — same icon + title + subtitle + action layout, only
 * the contents change.
 *
 * Designed for scannability: each integration occupies a single
 * bordered row regardless of state (connected or not). Marketing /
 * feature-pitch content lives elsewhere (docs, onboarding) — this
 * surface is for operators managing connections.
 */
export function IntegrationCard({
  icon,
  title,
  subtitle,
  actions,
}: {
  readonly icon: ComponentType<LucideProps>
  readonly title: string
  readonly subtitle?: string
  readonly actions?: ReactNode
}) {
  return (
    <div className="flex flex-row items-center justify-between gap-4 rounded-lg border border-border p-4">
      <div className="flex min-w-0 flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon icon={icon} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text.H5 weight="semibold">{title}</Text.H5>
          {subtitle ? (
            <Text.H6 color="foregroundMuted" className="truncate">
              {subtitle}
            </Text.H6>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}
