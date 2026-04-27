import { Avatar, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import type { AdminOrganizationSearchDto } from "../../../../domains/admin/search.functions.ts"
import { useRecentlyViewedAt } from "../../-lib/recently-viewed.ts"
import { Row } from "./row.tsx"
import { ViewedAgo } from "./viewed-ago.tsx"

/**
 * Listing row for a backoffice organisation. Used in search results and
 * in cross-entity sections (e.g. a user's memberships list, where the
 * `trailing` slot is overridden to show the user's per-org role).
 */
export interface OrganizationRowProps {
  readonly organization: Pick<AdminOrganizationSearchDto, "id" | "name" | "slug"> & {
    readonly createdAt?: string
  }
  readonly trailing?: ReactNode
}

export function OrganizationRow({ organization, trailing }: OrganizationRowProps) {
  // Trailing precedence: explicit prop > "viewed Xh ago" > created-at.
  // See `UserRow` for the full rationale.
  const viewedAt = useRecentlyViewedAt("organization", organization.id)
  const resolvedTrailing =
    trailing !== undefined ? (
      trailing
    ) : viewedAt ? (
      <ViewedAgo at={viewedAt} />
    ) : organization.createdAt ? (
      <Text.H6 color="foregroundMuted" noWrap>
        {relativeTime(organization.createdAt)}
      </Text.H6>
    ) : undefined

  return (
    <Link to="/backoffice/organizations/$organizationId" params={{ organizationId: organization.id }} className="block">
      <Row
        leading={<Avatar name={organization.name} size="lg" />}
        primary={
          <Text.H5 weight="medium" ellipsis noWrap>
            {organization.name}
          </Text.H5>
        }
        secondary={
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            /{organization.slug}
          </Text.H6>
        }
        trailing={resolvedTrailing}
      />
    </Link>
  )
}
