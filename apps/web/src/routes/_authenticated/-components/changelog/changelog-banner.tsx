import { FULL_CHANGELOG_URL } from "@domain/changelog"
import { Button, cn, Icon, Text } from "@repo/ui"
import { ExternalLink, Minus } from "lucide-react"

/** Default cover when a Framer entry has no image (Figma `type=no-cover`). */
export const CHANGELOG_FALLBACK_COVER_URL = "/changelog/fallback-cover.png"

export interface ChangelogBannerProps {
  readonly title: string
  readonly description: string | null
  readonly coverUrl: string | null
  readonly onCollapse: () => void
  readonly className?: string
}

const hasCover = (coverUrl: string | null): coverUrl is string =>
  typeof coverUrl === "string" && coverUrl.trim().length > 0

/**
 * Sidebar changelog promo card. Shows the latest entry title, summary (2 lines),
 * optional cover image, and a link to the full marketing changelog.
 *
 * Spacing matches Figma changelog-banner: 8px text/button insets, 4px title–body
 * gap, 16px between the content block and CTA.
 */
export function ChangelogBanner({ title, description, coverUrl, onCollapse, className }: ChangelogBannerProps) {
  const coverSrc = hasCover(coverUrl) ? coverUrl : CHANGELOG_FALLBACK_COVER_URL

  return (
    <article className={cn("flex w-full flex-col gap-1 overflow-hidden rounded-2xl bg-secondary shadow-sm", className)}>
      <div className="flex w-full flex-col">
        <div className="relative h-[119px] w-full shrink-0">
          <img src={coverSrc} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" />
          <div className="absolute top-2 right-2 z-20">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse changelog"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/20 backdrop-blur-sm transition-colors hover:bg-black/35"
            >
              <Icon icon={Minus} size="sm" color="white" />
            </button>
          </div>
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
      </div>

      <div className="block w-full p-2 [&>button]:w-full">
        <Button
          variant="secondary-soft"
          size="full"
          className="w-full [&>div]:gap-1 [&>div>div]:gap-1"
          onClick={() => window.open(FULL_CHANGELOG_URL, "_blank", "noopener,noreferrer")}
        >
          Full changelog
          <Icon icon={ExternalLink} size="sm" color="foregroundMuted" />
        </Button>
      </div>
    </article>
  )
}
