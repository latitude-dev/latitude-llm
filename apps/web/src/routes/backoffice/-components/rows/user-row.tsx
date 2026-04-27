import { Avatar, Badge, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import type { AdminUserSearchDto } from "../../../../domains/admin/search.functions.ts"
import { useRecentlyViewedAt } from "../../-lib/recently-viewed.ts"
import { PlatformStaffBadge } from "../role-badges.tsx"
import { Row } from "./row.tsx"
import { ViewedAgo } from "./viewed-ago.tsx"

const MAX_MEMBERSHIP_CHIPS = 3

/**
 * Listing row for a backoffice user — used in search results and (with a
 * `trailing` override) wherever a user appears in a sub-list, e.g. an
 * organisation's members section.
 */
export interface UserRowProps {
  readonly user: Pick<AdminUserSearchDto, "id" | "email" | "name" | "image" | "role"> & {
    readonly memberships?: AdminUserSearchDto["memberships"]
    readonly createdAt?: string
  }
  /**
   * Override for the right-edge metadata. Defaults to the relative
   * created-at if `user.createdAt` is provided, undefined otherwise. Used
   * by org-detail's members list to render per-org role badges instead.
   */
  readonly trailing?: ReactNode
}

export function UserRow({ user, trailing }: UserRowProps) {
  const displayName = user.name?.trim() ? user.name : user.email
  const memberships = user.memberships ?? []
  const visibleMemberships = memberships.slice(0, MAX_MEMBERSHIP_CHIPS)
  const overflowCount = memberships.length - visibleMemberships.length

  // Trailing precedence (same across all backoffice row components):
  // 1. Explicit `trailing` prop wins — used by callers that want to
  //    surface their own metadata (per-org role on a memberships list,
  //    status pill, etc.). When the caller cares, the caller decides.
  // 2. Otherwise, if the entity is in the user's recently-viewed
  //    storage, render "viewed Xh ago". This nudge is more useful on a
  //    list of search results than the entity's creation date — staff
  //    care more about "have I been here?" than "when was it created?".
  // 3. Fall back to relative created-at if available.
  const viewedAt = useRecentlyViewedAt("user", user.id)
  const resolvedTrailing =
    trailing !== undefined ? (
      trailing
    ) : viewedAt ? (
      <ViewedAgo at={viewedAt} />
    ) : user.createdAt ? (
      <Text.H6 color="foregroundMuted" noWrap>
        {relativeTime(user.createdAt)}
      </Text.H6>
    ) : undefined

  return (
    <Link to="/backoffice/users/$userId" params={{ userId: user.id }} className="block">
      <Row
        leading={<Avatar name={displayName} imageSrc={user.image} size="lg" />}
        primary={
          <Text.H5 weight="medium" ellipsis noWrap>
            {displayName}
          </Text.H5>
        }
        primaryBadges={user.role === "admin" ? <PlatformStaffBadge /> : null}
        secondary={
          <>
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              {user.email}
            </Text.H6>
            {memberships.length > 0 && (
              <>
                <Text.H6 color="foregroundMuted">·</Text.H6>
                <div className="flex items-center gap-1 min-w-0">
                  {visibleMemberships.map((m) => (
                    <Badge key={m.organizationId} variant="muted">
                      {m.organizationName}
                    </Badge>
                  ))}
                  {overflowCount > 0 && <Badge variant="muted">+{overflowCount}</Badge>}
                </div>
              </>
            )}
          </>
        }
        trailing={resolvedTrailing}
      />
    </Link>
  )
}
