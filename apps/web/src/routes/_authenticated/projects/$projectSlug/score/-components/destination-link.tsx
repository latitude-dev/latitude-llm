import { Icon, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, BellRingIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { CauseDestination } from "./agent-score-mock.ts"

/**
 * Every lost point has to land on a page that already exists, which is the whole point of
 * naming the groups after the sidebar. The mock links to the section; the real page would
 * carry the cause's filter in the search params.
 */
export function DestinationLink({
  projectSlug,
  destination,
}: {
  readonly projectSlug: string
  readonly destination: CauseDestination
}) {
  const label: ReactNode = (
    <span className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-primary">
      <Text.H6 color="inherit" noWrap>
        {destination.label}
      </Text.H6>
      <Icon icon={ArrowUpRightIcon} size="xs" />
    </span>
  )
  const params = { projectSlug }
  const aria = `Open ${destination.label}`

  switch (destination.section) {
    case "tools":
      return (
        <Link to="/projects/$projectSlug/tools" params={params} aria-label={aria}>
          {label}
        </Link>
      )
    case "memory":
      return (
        <Link to="/projects/$projectSlug/memory" params={params} aria-label={aria}>
          {label}
        </Link>
      )
    case "cost":
      return (
        <Link to="/projects/$projectSlug/cost" params={params} aria-label={aria}>
          {label}
        </Link>
      )
    case "signals":
      return (
        <Link to="/projects/$projectSlug/signals" params={params} aria-label={aria}>
          {label}
        </Link>
      )
    case "behaviours":
      return (
        <Link to="/projects/$projectSlug/behaviours" params={params} aria-label={aria}>
          {label}
        </Link>
      )
    default:
      return (
        <Link to="/projects/$projectSlug" params={params} aria-label={aria}>
          {label}
        </Link>
      )
  }
}

/** The fix path the app already has for a metric-shaped cause: a threshold that opens an incident. */
export function MonitorLink({ projectSlug }: { readonly projectSlug: string }) {
  return (
    <Link to="/projects/$projectSlug/monitors" params={{ projectSlug }} aria-label="Create a monitor for this cause">
      <span className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-primary">
        <Icon icon={BellRingIcon} size="xs" />
        <Text.H6 color="inherit" noWrap>
          Create monitor
        </Text.H6>
      </span>
    </Link>
  )
}
