import { Button, cn, Icon, Text, type TextColor } from "@repo/ui"
import { Minus } from "lucide-react"

/** Default cover when an entry has no image (Figma `type=no-cover`). */
export const CHANGELOG_FALLBACK_COVER_URL = "/changelog/fallback-cover.png"

export interface ChangelogBannerProps {
  readonly title: string
  readonly description: string | null
  readonly coverUrl: string | null
  readonly entryUrl: string
  readonly onCollapse: () => void
  readonly className?: string
}

const hasCover = (coverUrl: string | null): coverUrl is string =>
  typeof coverUrl === "string" && coverUrl.trim().length > 0

/**
 * Sidebar changelog promo card. Shows the latest entry title, summary (2 lines),
 * optional cover image, and links to the entry on the marketing site when clicked.
 */
export function ChangelogBanner({
  title,
  description,
  coverUrl,
  entryUrl,
  onCollapse,
  className,
}: ChangelogBannerProps) {
  const coverSrc = hasCover(coverUrl) ? coverUrl : CHANGELOG_FALLBACK_COVER_URL
  const collapseIconColor: TextColor = hasCover(coverUrl) ? "foreground" : "white"

  return (
    <article className={cn("relative flex w-full flex-col overflow-hidden rounded-2xl bg-secondary", className)}>
      <a
        href={entryUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full flex-col transition-colors hover:bg-muted/50"
      >
        <div className="relative h-[119px] w-full shrink-0">
          <img src={coverSrc} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" />
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 p-3">
          <Text.H4M display="block" ellipsis>
            {title}
          </Text.H4M>
          {description ? (
            <Text.H6 color="foregroundMuted" display="block" lineClamp={2}>
              {description}
            </Text.H6>
          ) : null}
        </div>
      </a>

      <div className="absolute top-2 right-2 z-20">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onCollapse}
          aria-label="Collapse changelog"
        >
          <Icon icon={Minus} size="sm" color={collapseIconColor} />
        </Button>
      </div>
    </article>
  )
}
