import { Avatar, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { SparklesIcon } from "lucide-react"
import {
  type AdminOrganizationMemberDto,
  type AdminOrganizationProjectDto,
  adminGetOrganization,
} from "../../../domains/admin/organizations.functions.ts"
import {
  DashboardHero,
  DashboardSection,
  DashboardSplit,
  PropertiesStrip,
  type PropertiesStripEntry,
  StripeCustomerLink,
} from "../-components/dashboard/index.ts"
import { CreateDemoProjectButton } from "../-components/organization-actions/create-demo-project.tsx"
import { OrganizationActionRow, OrganizationActionsSection } from "../-components/organization-actions/section.tsx"
import { MemberRoleBadge, PlatformStaffBadge } from "../-components/role-badges.tsx"
import { ProjectRow, UserRow } from "../-components/rows/index.ts"
import { useTrackRecentBackofficeView } from "../-lib/recently-viewed.ts"

export const Route = createFileRoute("/backoffice/organizations/$organizationId")({
  loader: async ({ params }) => {
    try {
      const organization = await adminGetOrganization({ data: { organizationId: params.organizationId } })
      return { organization }
    } catch (error) {
      const tag = (error as { _tag?: string } | null | undefined)?._tag
      if (tag === "NotFoundError") {
        throw notFound()
      }
      throw error
    }
  },
  component: BackofficeOrganizationDetailPage,
})

function BackofficeOrganizationDetailPage() {
  const organization = Route.useLoaderData({ select: (data) => data.organization })

  useTrackRecentBackofficeView({
    kind: "organization",
    id: organization.id,
    primary: organization.name,
    secondary: organization.slug,
  })

  // The properties strip aggregates the "boring but sometimes needed"
  // fields. Stripe customer id is rendered through `StripeCustomerLink`
  // so it deeplinks into the Stripe dashboard — the most common
  // follow-on action when staff are debugging billing.
  const propertyEntries: PropertiesStripEntry[] = [
    { label: "Org id", value: organization.id },
    { label: "Created", value: new Date(organization.createdAt).toISOString() },
    { label: "Updated", value: new Date(organization.updatedAt).toISOString() },
    {
      label: "Stripe customer",
      value: organization.stripeCustomerId ? (
        <StripeCustomerLink customerId={organization.stripeCustomerId} />
      ) : (
        <span className="font-mono">(none)</span>
      ),
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pt-8 pb-12">
      <DashboardHero
        leading={<Avatar name={organization.name} size="xl" />}
        title={organization.name}
        meta={
          <>
            <span>/{organization.slug}</span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="font-medium text-foreground tabular-nums">{organization.members.length}</span>{" "}
              {organization.members.length === 1 ? "member" : "members"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="font-medium text-foreground tabular-nums">{organization.projects.length}</span>{" "}
              {organization.projects.length === 1 ? "project" : "projects"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              created <span className="font-medium text-foreground">{relativeTime(organization.createdAt)}</span>
            </span>
          </>
        }
      />

      <DashboardSplit
        ratio="wide-primary"
        primary={
          <DashboardSection title="Members" count={organization.members.length}>
            {organization.members.length === 0 ? (
              <Text.H6 color="foregroundMuted">This organization has no members.</Text.H6>
            ) : (
              <div className="flex flex-col gap-1.5">
                {organization.members.map((member: AdminOrganizationMemberDto) => (
                  <MemberRow key={member.membershipId} member={member} />
                ))}
              </div>
            )}
          </DashboardSection>
        }
        secondary={
          <DashboardSection title="Projects" count={organization.projects.length}>
            {organization.projects.length === 0 ? (
              <Text.H6 color="foregroundMuted">No active projects.</Text.H6>
            ) : (
              <div className="flex flex-col gap-1.5">
                {organization.projects.map((project: AdminOrganizationProjectDto) => (
                  <ProjectRow
                    key={project.id}
                    project={{
                      id: project.id,
                      name: project.name,
                      slug: project.slug,
                      // `organizationName` deliberately omitted — these
                      // rows are rendered inside the parent org's own
                      // detail page, so the chip would be redundant.
                      createdAt: project.createdAt,
                    }}
                  />
                ))}
              </div>
            )}
          </DashboardSection>
        }
      />

      <OrganizationActionsSection>
        <OrganizationActionRow
          icon={SparklesIcon}
          title="Create demo project"
          description="Spin up a fresh project on this org seeded with bootstrap content (datasets, evaluations, issues, ~30 days of telemetry). Runs in the background."
          action={<CreateDemoProjectButton organizationId={organization.id} />}
        />
      </OrganizationActionsSection>

      <PropertiesStrip entries={propertyEntries} />
    </div>
  )
}

/**
 * Member row used inside the organisation's Members panel. Wraps the
 * shared `<UserRow>` with a custom trailing slot:
 *
 * - Per-org role badge (always) — answers "what can they do here?"
 * - Plus a `platform admin` pill when the member is also a global
 *   admin — answers "are they staff?"
 *
 * The two badges live next to each other so the answer to both
 * questions is visible at a single glance, which is the entire point
 * of the org detail page.
 */
function MemberRow({ member }: { member: AdminOrganizationMemberDto }) {
  return (
    <UserRow
      user={{
        id: member.user.id,
        email: member.user.email,
        name: member.user.name,
        image: member.user.image,
        role: member.user.role,
        // No memberships chips here — the org context is implicit on
        // this page; rendering them would either be empty (we don't
        // have the data) or noisy (every member's membership list
        // would include this very org).
        memberships: [],
      }}
      trailing={
        <div className="flex items-center gap-1.5">
          {member.user.role === "admin" && <PlatformStaffBadge />}
          <MemberRoleBadge role={member.role} />
        </div>
      }
    />
  )
}
