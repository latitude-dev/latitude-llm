import { Avatar, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type { ReactNode } from "react"
import type { AdminOrganizationSearchDto } from "../../../../domains/admin/search.functions.ts"
import { Row } from "./row.tsx"

/**
 * Listing row for a backoffice organisation. Used in search results and
 * in cross-entity sections (e.g. a user's memberships list, where the
 * `trailing` slot is overridden to show the user's per-org role).
 *
 * Wrapped in a plain anchor (rather than `<Link>`) until the
 * `/backoffice/organizations/$organizationId` route file lands in a
 * later commit of this PR — TanStack Router's `<Link>` is strictly
 * typed against the registered route table and would error before the
 * route exists. Once the route ships, swap `<a>` for `<Link>` here.
 */
export interface OrganizationRowProps {
  readonly organization: Pick<AdminOrganizationSearchDto, "id" | "name" | "slug"> & {
    readonly createdAt?: string
  }
  readonly trailing?: ReactNode
}

export function OrganizationRow({ organization, trailing }: OrganizationRowProps) {
  const resolvedTrailing =
    trailing !== undefined ? (
      trailing
    ) : organization.createdAt ? (
      <Text.H6 color="foregroundMuted" noWrap>
        {relativeTime(organization.createdAt)}
      </Text.H6>
    ) : undefined

  return (
    <a href={`/backoffice/organizations/${organization.id}`} className="block">
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
    </a>
  )
}
