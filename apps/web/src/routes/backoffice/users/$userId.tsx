import { Avatar, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { EyeIcon } from "lucide-react"
import type { AdminUserDetailsDto, AdminUserDetailsMembershipDto } from "../../../domains/admin/users.functions.ts"
import { adminGetUser } from "../../../domains/admin/users.functions.ts"
import { AccountActionRow, AccountActionsSection } from "../-components/account-actions/section.tsx"
import {
  DashboardHero,
  DashboardSection,
  PropertiesStrip,
  type PropertiesStripEntry,
} from "../-components/dashboard/index.ts"
import { ImpersonateUserButton } from "../-components/impersonate-user-button.tsx"
import { MemberRoleBadge, PlatformStaffBadge } from "../-components/role-badges.tsx"
import { useTrackRecentBackofficeView } from "../-lib/recently-viewed.ts"

export const Route = createFileRoute("/backoffice/users/$userId")({
  loader: async ({ params }) => {
    try {
      const user = await adminGetUser({ data: { userId: params.userId } })
      return { user }
    } catch (error) {
      // Only collapse `NotFoundError` into `notFound()` — covers the two
      // cases we want indistinguishable from any unknown URL: "user
      // doesn't exist" and "caller isn't an admin". Anything else (DB
      // outage, connectivity, serialization bug) bubbles to the router
      // error boundary so ops can see it.
      const tag = (error as { _tag?: string } | null | undefined)?._tag
      if (tag === "NotFoundError") {
        throw notFound()
      }
      throw error
    }
  },
  component: BackofficeUserDetailPage,
})

function BackofficeUserDetailPage() {
  const user = Route.useLoaderData({ select: (data) => data.user })

  // Record the visit so this user surfaces in the recently-viewed
  // strip + per-row "viewed Xh ago" indicator on subsequent searches.
  useTrackRecentBackofficeView({
    kind: "user",
    id: user.id,
    primary: user.email,
    secondary: user.name?.trim() ? user.name : undefined,
  })

  const displayName = user.name?.trim() ? user.name : user.email
  const memberships = user.memberships
  const ownedCount = memberships.filter((m: AdminUserDetailsMembershipDto) => m.role === "owner").length

  // Properties strip — boring metadata that doesn't merit its own
  // panel. Stripe customer id / banned status / email verified are
  // stored on the `users` row but not surfaced through
  // `AdminUserDetails` today; pulling them in would mean expanding
  // the domain DTO and the repo. Worth a follow-up but out of scope
  // for the dashboard refactor.
  const propertyEntries: PropertiesStripEntry[] = [
    { label: "User id", value: user.id },
    { label: "Email", value: user.email },
    { label: "Created", value: new Date(user.createdAt).toISOString() },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-8 pb-12">
      <DashboardHero
        leading={<Avatar name={displayName} imageSrc={user.image} size="xl" />}
        title={displayName}
        badges={user.role === "admin" ? <PlatformStaffBadge /> : null}
        meta={
          <>
            <span>{user.email}</span>
            <span aria-hidden="true">·</span>
            <span>
              joined <span className="font-medium text-foreground">{relativeTime(user.createdAt)}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="font-medium text-foreground tabular-nums">{memberships.length}</span>{" "}
              {memberships.length === 1 ? "membership" : "memberships"}
              {ownedCount > 0 && (
                <span>
                  {" "}
                  (<span className="font-medium text-foreground tabular-nums">{ownedCount}</span> as owner)
                </span>
              )}
            </span>
          </>
        }
        actions={<ImpersonateUserButton userId={user.id} userEmail={user.email} />}
      />

      <DashboardSection title="Memberships" count={memberships.length}>
        {memberships.length === 0 ? (
          <Text.H6 color="foregroundMuted">This user is not a member of any organization.</Text.H6>
        ) : (
          <MembershipsGrid memberships={memberships} />
        )}
      </DashboardSection>

      <AccountActionsSection>
        <AccountActionRow
          icon={EyeIcon}
          title="Impersonate user"
          description="Sign in as this user for support purposes. The impersonation banner shows on every page until you stop."
          action={<ImpersonateUserButton userId={user.id} userEmail={user.email} />}
        />
      </AccountActionsSection>

      <PropertiesStrip entries={propertyEntries} />
    </div>
  )
}

const MAX_VISIBLE_MEMBERSHIPS = 8

/**
 * Memberships grid for the user-detail page.
 *
 * Three columns at `lg` and above (one per ~340 px of available
 * width), two at `md`, single column on narrow viewports. Cap at
 * `MAX_VISIBLE_MEMBERSHIPS` visible — anything beyond collapses into
 * a "+N more" tile that just sits inert. We don't paginate or
 * disclose them: a user with 30 orgs is rare, and when staff need
 * the full list they can search the org name directly.
 *
 * Each card is its own clickable target into the org detail page —
 * with hover lift, role badge inline, and a chevron affordance on
 * the right.
 */
function MembershipsGrid({ memberships }: { memberships: AdminUserDetailsDto["memberships"] }) {
  const visible = memberships.slice(0, MAX_VISIBLE_MEMBERSHIPS)
  const overflow = memberships.length - visible.length

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((m: AdminUserDetailsMembershipDto) => (
        <MembershipCard key={m.organizationId} membership={m} />
      ))}
      {overflow > 0 && (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-3">
          <Text.H6 color="foregroundMuted">
            +<span className="tabular-nums">{overflow}</span> more
          </Text.H6>
        </div>
      )}
    </div>
  )
}

function MembershipCard({ membership }: { membership: AdminUserDetailsMembershipDto }) {
  return (
    <Link
      to="/backoffice/organizations/$organizationId"
      params={{ organizationId: membership.organizationId }}
      className={[
        "group flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3",
        "transition-all duration-150",
        "hover:bg-muted/60 hover:shadow-sm hover:-translate-y-px",
      ].join(" ")}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Text.H5 weight="semibold" color="foregroundMuted">
          {membership.organizationName.trim()[0]?.toUpperCase() ?? "?"}
        </Text.H5>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Text.H5 weight="medium" ellipsis noWrap>
          {membership.organizationName}
        </Text.H5>
        <Text.H6 color="foregroundMuted" ellipsis noWrap>
          /{membership.organizationSlug}
        </Text.H6>
      </div>
      <MemberRoleBadge role={membership.role} />
    </Link>
  )
}
