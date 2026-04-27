import { Avatar, Badge, Text } from "@repo/ui"
import { extractLeadingEmoji, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import type { AdminProjectSearchDto } from "../../../../domains/admin/search.functions.ts"
import { useRecentlyViewedAt } from "../../-lib/recently-viewed.ts"
import { Row } from "./row.tsx"
import { ViewedAgo } from "./viewed-ago.tsx"

/**
 * Listing row for a backoffice project.
 *
 * `organizationName` is optional — when omitted, the row shows only
 * the project slug in the secondary line. Used to suppress the
 * redundant org chip when the row is rendered inside that very org's
 * detail page.
 */
export interface ProjectRowProps {
  readonly project: Pick<AdminProjectSearchDto, "id" | "name" | "slug"> & {
    readonly organizationName?: string
    readonly createdAt?: string
  }
  readonly trailing?: ReactNode
}

function ProjectIcon({ name }: { name: string }) {
  const [emoji, rest] = extractLeadingEmoji(name)
  if (emoji) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <span className="text-base leading-none">{emoji}</span>
      </div>
    )
  }
  return <Avatar name={rest || name} size="lg" />
}

export function ProjectRow({ project, trailing }: ProjectRowProps) {
  const [, nameWithoutEmoji] = extractLeadingEmoji(project.name)
  const displayName = nameWithoutEmoji || project.name

  // Trailing precedence: explicit prop > "viewed Xh ago" > created-at.
  // See `UserRow` for the full rationale.
  const viewedAt = useRecentlyViewedAt("project", project.id)
  const resolvedTrailing =
    trailing !== undefined
      ? trailing
      : viewedAt
        ? <ViewedAgo at={viewedAt} />
        : project.createdAt
          ? <Text.H6 color="foregroundMuted" noWrap>{relativeTime(project.createdAt)}</Text.H6>
          : undefined

  return (
    <Link to="/backoffice/projects/$projectId" params={{ projectId: project.id }} className="block">
      <Row
        leading={<ProjectIcon name={project.name} />}
        primary={
          <Text.H5 weight="medium" ellipsis noWrap>
            {displayName}
          </Text.H5>
        }
        secondary={
          <>
            {project.organizationName ? <Badge variant="muted">{project.organizationName}</Badge> : null}
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              /{project.slug}
            </Text.H6>
          </>
        }
        trailing={resolvedTrailing}
      />
    </Link>
  )
}
