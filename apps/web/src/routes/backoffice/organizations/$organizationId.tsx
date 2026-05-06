import { Avatar, Badge, CopyButton, Icon, Switch, Text, Tooltip, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router"
import { Flag, SparklesIcon } from "lucide-react"
import { useMemo, useState } from "react"
import {
  type AdminOrganizationFeatureFlagDto,
  type AdminOrganizationFeatureFlagsDto,
  adminDisableFeatureFlagForOrganization,
  adminEnableFeatureFlagForOrganization,
  adminListOrganizationFeatureFlags,
} from "../../../domains/admin/feature-flags.functions.ts"
import {
  type AdminOrganizationMemberDto,
  type AdminOrganizationProjectDto,
  adminGetOrganization,
} from "../../../domains/admin/organizations.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
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
      const [organization, featureFlags] = await Promise.all([
        adminGetOrganization({ data: { organizationId: params.organizationId } }),
        adminListOrganizationFeatureFlags({ data: { organizationId: params.organizationId } }),
      ])
      return { organization, featureFlags }
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
  const featureFlags = Route.useLoaderData({ select: (data) => data.featureFlags })

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

      <FeatureFlagsSection organizationId={organization.id} featureFlags={featureFlags} />

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

type FeatureFlagRowState = {
  readonly flag: AdminOrganizationFeatureFlagDto
  readonly isEnabled: boolean
  readonly globalOnly: boolean
}

function FeatureFlagsSection({
  organizationId,
  featureFlags,
}: {
  readonly organizationId: string
  readonly featureFlags: AdminOrganizationFeatureFlagsDto
}) {
  const rows = useMemo<FeatureFlagRowState[]>(() => {
    const enabled: FeatureFlagRowState[] = featureFlags.enabled.map((flag) => ({
      flag,
      isEnabled: true,
      globalOnly: false,
    }))
    const available: FeatureFlagRowState[] = featureFlags.available.map((flag) => ({
      flag,
      isEnabled: flag.enabledForAll,
      globalOnly: flag.enabledForAll,
    }))
    return [...enabled, ...available].sort((a, b) => a.flag.identifier.localeCompare(b.flag.identifier))
  }, [featureFlags])

  return (
    <DashboardSection
      title={
        <span className="flex items-center gap-2">
          <Icon icon={Flag} size="sm" />
          Feature Flags
        </span>
      }
      count={rows.filter((row) => row.isEnabled).length}
    >
      {rows.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-4">
          <Text.H6 weight="medium">No feature flags</Text.H6>
          <Text.H6 color="foregroundMuted">
            Active flags appear here once you create them on the Backoffice feature flags page.
          </Text.H6>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <FeatureFlagToggleRow key={row.flag.id} row={row} organizationId={organizationId} />
          ))}
        </div>
      )}
    </DashboardSection>
  )
}

function FeatureFlagToggleRow({
  row,
  organizationId,
}: {
  readonly row: FeatureFlagRowState
  readonly organizationId: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, setIsPending] = useState(false)
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null)
  const checked = optimisticEnabled ?? row.isEnabled

  const handleToggle = async (next: boolean) => {
    if (row.globalOnly) return
    setOptimisticEnabled(next)
    setIsPending(true)
    try {
      if (next) {
        await adminEnableFeatureFlagForOrganization({
          data: { organizationId, identifier: row.flag.identifier },
        })
        toast({ description: `Enabled "${row.flag.identifier}" for this organization.` })
      } else {
        await adminDisableFeatureFlagForOrganization({
          data: { organizationId, identifier: row.flag.identifier },
        })
        toast({ description: `Disabled "${row.flag.identifier}" for this organization.` })
      }
      void router.invalidate()
    } catch (error) {
      setOptimisticEnabled(null)
      toast({
        variant: "destructive",
        title: "Could not change feature flag",
        description: toUserMessage(error),
      })
    } finally {
      setIsPending(false)
    }
  }

  const switchEl = (
    <Switch
      checked={checked}
      disabled={row.globalOnly || isPending}
      loading={isPending}
      onCheckedChange={(next) => void handleToggle(next)}
      aria-label={`Toggle ${row.flag.identifier} for this organization`}
    />
  )

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-background px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {row.flag.name ? (
            <Text.H5 weight="semibold" ellipsis>
              {row.flag.name}
            </Text.H5>
          ) : null}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{row.flag.identifier}</code>
          <CopyButton value={row.flag.identifier} tooltip="Copy identifier" />
        </div>
        {row.flag.description ? (
          <Text.H6 color="foregroundMuted">{row.flag.description}</Text.H6>
        ) : (
          <Text.H6 color="foregroundMuted">No description.</Text.H6>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.globalOnly ? (
          <Badge variant="outlineSuccessMuted" noWrap>
            Global
          </Badge>
        ) : null}
        {row.globalOnly ? (
          <Tooltip asChild trigger={<span>{switchEl}</span>}>
            <Text.Mono size="h6">Enabled for every organization. Manage from the global feature flags page.</Text.Mono>
          </Tooltip>
        ) : (
          switchEl
        )}
      </div>
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
