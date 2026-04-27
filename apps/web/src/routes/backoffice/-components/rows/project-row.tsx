import { Avatar, Badge, Text } from "@repo/ui"
import { extractLeadingEmoji, relativeTime } from "@repo/utils"
import type { ReactNode } from "react"
import type { AdminProjectSearchDto } from "../../../../domains/admin/search.functions.ts"
import { Row } from "./row.tsx"

/**
 * Listing row for a backoffice project.
 *
 * Wrapped in a plain anchor (rather than `<Link>`) until the
 * `/backoffice/projects/$projectId` route file lands in a later commit
 * of this PR — see the note on `OrganizationRow`.
 */
export interface ProjectRowProps {
  readonly project: Pick<AdminProjectSearchDto, "id" | "name" | "slug" | "organizationName"> & {
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

  const resolvedTrailing =
    trailing !== undefined ? (
      trailing
    ) : project.createdAt ? (
      <Text.H6 color="foregroundMuted" noWrap>
        {relativeTime(project.createdAt)}
      </Text.H6>
    ) : undefined

  return (
    <a href={`/backoffice/projects/${project.id}`} className="block">
      <Row
        leading={<ProjectIcon name={project.name} />}
        primary={
          <Text.H5 weight="medium" ellipsis noWrap>
            {displayName}
          </Text.H5>
        }
        secondary={
          <>
            <Badge variant="muted">{project.organizationName}</Badge>
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              /{project.slug}
            </Text.H6>
          </>
        }
        trailing={resolvedTrailing}
      />
    </a>
  )
}
