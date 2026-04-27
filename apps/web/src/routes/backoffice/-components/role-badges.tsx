import { Badge, LatitudeLogo } from "@repo/ui"
import { CrownIcon, ShieldCheckIcon, UserIcon } from "lucide-react"

/**
 * Visual treatments for the two distinct concepts of "role" in the
 * backoffice:
 *
 * - **Per-organisation role** (`members.role`: owner / admin / member) —
 *   answers "what can this user do inside this org?". Rendered with
 *   {@link MemberRoleBadge}: outline-muted pill + role-specific icon.
 *   The three badges look identical except for the icon, which signals
 *   "same kind of thing, different flavor".
 *
 * - **Global platform-staff flag** (`users.role === "admin"`) — answers
 *   "is this a Latitude employee?". Rendered with
 *   {@link PlatformStaffBadge}: accent-tinted pill with the Latitude
 *   logo and the word "staff". Visually distinct on purpose — it's
 *   not a role within a tenant, it's a system-wide identity, and
 *   treating it like another flavor of role would obscure the
 *   difference at a glance. The logo carries the "this is a Latitude
 *   employee" semantics directly without needing the heavier
 *   destructive treatment of the impersonation banner (which
 *   communicates a temporary hazardous state, not an identity).
 *
 * Both are intended to live next to each other in row trailing slots —
 * see the org detail page's members list, where a member's per-org
 * role and their staff status appear side by side.
 */

const ROLE_ICONS = {
  owner: CrownIcon,
  admin: ShieldCheckIcon,
  member: UserIcon,
} as const

const ROLE_LABELS = {
  owner: "owner",
  admin: "admin",
  member: "member",
} as const

export type MemberRole = keyof typeof ROLE_ICONS

export function MemberRoleBadge({ role }: { role: MemberRole }) {
  return (
    <Badge variant="outlineMuted" iconProps={{ icon: ROLE_ICONS[role], placement: "start" }}>
      {ROLE_LABELS[role]}
    </Badge>
  )
}

/**
 * Accent-tinted pill carrying the Latitude logo + "staff". Not a role
 * variant — see the file-level comment for why this is shaped
 * differently from {@link MemberRoleBadge}.
 */
export function PlatformStaffBadge() {
  return (
    <Badge variant="accent">
      <div className="flex items-center gap-1">
        <LatitudeLogo className="h-3 w-3 shrink-0" />
        staff
      </div>
    </Badge>
  )
}
