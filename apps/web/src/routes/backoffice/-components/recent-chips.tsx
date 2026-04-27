import { Avatar, Icon, Text } from "@repo/ui"
import { extractLeadingEmoji, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { Building2Icon } from "lucide-react"
import { useRecentBackofficeViews, type RecentBackofficeView } from "../-lib/recently-viewed.ts"

const VISIBLE_COUNT = 6

/**
 * Quick-nav strip showing the 6 most-recently-viewed backoffice
 * entities. Renders below the omnibox when the search input is empty —
 * the page's primary "you have nothing typed yet" state.
 *
 * Each chip is an anchor straight to the entity's detail page.
 * Storage is browser-only; during SSR this renders nothing (the parent
 * uses a fixed-height container so there's no layout flicker).
 *
 * The component renders no header / "Recently viewed" label by
 * default — when there's nothing, it should disappear cleanly. The
 * caller is responsible for the section heading if it wants one.
 */
export function RecentChips() {
  const recent = useRecentBackofficeViews()
  if (recent.length === 0) return null

  const visible = recent.slice(0, VISIBLE_COUNT)
  return (
    <section className="flex flex-col gap-3" aria-label="Recently viewed">
      <div className="flex items-center gap-3">
        <Text.H6 weight="semibold" color="foregroundMuted" noWrap>
          Recently viewed
        </Text.H6>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((view) => (
          <RecentChip key={`${view.kind}:${view.id}`} view={view} />
        ))}
      </div>
    </section>
  )
}

/**
 * Each chip is a typed TanStack `<Link>`. Branching on `kind` per chip
 * keeps the typed-route guarantee (params validated against the route
 * registry) instead of bypassing it with a string `<a href>` — which
 * also avoids triggering full-document navigations in dev. The visual
 * shell is identical across kinds; only the route target differs.
 */
function RecentChip({ view }: { view: RecentBackofficeView }) {
  const className = [
    "group flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-1.5 pr-3",
    "transition-colors hover:bg-muted/60",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "max-w-[18rem]",
  ].join(" ")
  const title = `${view.primary}${view.secondary ? ` · ${view.secondary}` : ""} · viewed ${relativeTime(new Date(view.viewedAt))}`

  const inner = (
    <>
      <RecentChipLeading view={view} />
      <Text.H6 weight="medium" ellipsis noWrap>
        {chipLabel(view)}
      </Text.H6>
    </>
  )

  if (view.kind === "user") {
    return (
      <Link to="/backoffice/users/$userId" params={{ userId: view.id }} className={className} title={title}>
        {inner}
      </Link>
    )
  }
  if (view.kind === "organization") {
    return (
      <Link
        to="/backoffice/organizations/$organizationId"
        params={{ organizationId: view.id }}
        className={className}
        title={title}
      >
        {inner}
      </Link>
    )
  }
  // project
  return (
    <Link to="/backoffice/projects/$projectId" params={{ projectId: view.id }} className={className} title={title}>
      {inner}
    </Link>
  )
}

/**
 * Avatar / icon for a recent chip. Mirrors the `leading` slot
 * convention from the row components but at chip-scale (smaller
 * avatar, no project-emoji block).
 */
function RecentChipLeading({ view }: { view: RecentBackofficeView }) {
  if (view.kind === "user") {
    return <Avatar name={view.primary} size="xs" />
  }
  if (view.kind === "organization") {
    return <Avatar name={view.primary} size="xs" />
  }
  // project — surface the leading emoji if there is one, else a
  // generic project glyph.
  const [emoji] = extractLeadingEmoji(view.primary)
  if (emoji) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-background text-xs leading-none">
        {emoji}
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-background">
      <Icon icon={Building2Icon} size="xs" color="foregroundMuted" />
    </span>
  )
}

const chipLabel = (view: RecentBackofficeView): string => {
  if (view.kind !== "project") return view.primary
  const [, rest] = extractLeadingEmoji(view.primary)
  return rest || view.primary
}
