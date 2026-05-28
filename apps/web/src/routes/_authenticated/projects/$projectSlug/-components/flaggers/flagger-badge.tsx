import { Badge, Tooltip } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "lucide-react"
import { useProjectFlaggers } from "../../../../../../domains/flaggers/flaggers.collection.ts"

const humanizeFlaggerSlug = (slug: string) =>
  slug.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

interface FlaggerBadgeProps {
  readonly projectId: string
  readonly projectSlug: string | undefined
  readonly slug: string
}

/**
 * Names the automatic flagger a feature surfaces (annotation, issue occurrence,
 * etc.) and, when we know the current project slug, links to its row in
 * project settings. Falls back to a humanized slug when the flagger isn't in
 * the project's provisioned list (e.g. it was de-provisioned after the
 * annotation was created).
 */
export function FlaggerBadge({ projectId, projectSlug, slug }: FlaggerBadgeProps) {
  const { data: flaggers = [] } = useProjectFlaggers(projectId)
  const flagger = flaggers.find((candidate) => candidate.slug === slug)
  const name = flagger?.name ?? humanizeFlaggerSlug(slug)
  const label = `${name} flagger`

  if (!projectSlug) {
    return (
      <Badge variant="secondary" size="small">
        {label}
      </Badge>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <Link
          data-no-navigate
          to="/projects/$projectSlug/settings/flaggers"
          params={{ projectSlug }}
          search={{ flagger: slug }}
          aria-label={`Open the ${name} flagger settings`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex"
        >
          <Badge
            variant="secondary"
            size="small"
            className="cursor-pointer hover:bg-muted"
            iconProps={{ icon: ArrowUpRightIcon, color: "foregroundMuted", placement: "end" }}
          >
            {label}
          </Badge>
        </Link>
      }
    >
      Flagged automatically by the {name} flagger — open its settings
    </Tooltip>
  )
}
