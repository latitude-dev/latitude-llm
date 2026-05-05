import { Avatar, Badge, Button, CloseTrigger, Icon, Modal, Select, Text, useToast } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router"
import { Flag, Plus, SparklesIcon } from "lucide-react"
import { useState } from "react"
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

function FeatureFlagsSection({
  organizationId,
  featureFlags,
}: {
  readonly organizationId: string
  readonly featureFlags: AdminOrganizationFeatureFlagsDto
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [removingIdentifier, setRemovingIdentifier] = useState<string | null>(null)

  const handleRemove = async (featureFlag: AdminOrganizationFeatureFlagDto) => {
    if (!window.confirm(`Remove feature flag "${featureFlag.identifier}" from this organization?`)) return

    setRemovingIdentifier(featureFlag.identifier)
    try {
      await adminDisableFeatureFlagForOrganization({
        data: { organizationId, identifier: featureFlag.identifier },
      })
      toast({ description: `Removed "${featureFlag.identifier}" from this organization.` })
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not remove feature flag",
        description: toUserMessage(error),
      })
    } finally {
      setRemovingIdentifier(null)
    }
  }

  return (
    <DashboardSection
      title={
        <span className="flex items-center gap-2">
          <Icon icon={Flag} size="sm" />
          Feature Flags
        </span>
      }
      count={featureFlags.enabled.length}
      aside={<AddFeatureFlagButton organizationId={organizationId} availableFlags={featureFlags.available} />}
    >
      {featureFlags.enabled.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-4">
          <Text.H6 weight="medium">No active feature flags</Text.H6>
          <Text.H6 color="foregroundMuted">
            Enable a flag when this organization should get access to behavior that is still gated.
          </Text.H6>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {featureFlags.enabled.map((featureFlag) => (
            <div
              key={featureFlag.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{featureFlag.identifier}</code>
                  <Badge variant="outlineSuccessMuted" noWrap>
                    Enabled
                  </Badge>
                </div>
                <Text.H6 color={featureFlag.name ? "foreground" : "foregroundMuted"} weight="medium">
                  {featureFlag.name ?? "Unnamed flag"}
                </Text.H6>
                {featureFlag.description ? (
                  <Text.H6 color="foregroundMuted">{featureFlag.description}</Text.H6>
                ) : (
                  <Text.H6 color="foregroundMuted">No description.</Text.H6>
                )}
              </div>
              <Button
                variant="destructive-soft"
                size="sm"
                disabled={removingIdentifier === featureFlag.identifier}
                onClick={() => void handleRemove(featureFlag)}
              >
                {removingIdentifier === featureFlag.identifier ? "Removing…" : "Remove"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </DashboardSection>
  )
}

function AddFeatureFlagButton({
  organizationId,
  availableFlags,
}: {
  readonly organizationId: string
  readonly availableFlags: AdminOrganizationFeatureFlagDto[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selectedFeatureFlag = availableFlags.find((featureFlag) => featureFlag.identifier === selectedIdentifier)

  const options = availableFlags.map((featureFlag) => ({
    label: featureFlag.name ? `${featureFlag.identifier} — ${featureFlag.name}` : featureFlag.identifier,
    value: featureFlag.identifier,
  }))

  const handleAdd = async () => {
    if (!selectedIdentifier) return

    setIsSubmitting(true)
    try {
      await adminEnableFeatureFlagForOrganization({
        data: { organizationId, identifier: selectedIdentifier },
      })
      toast({ description: `Enabled "${selectedIdentifier}" for this organization.` })
      setIsOpen(false)
      setSelectedIdentifier(undefined)
      void router.invalidate()
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not enable feature flag",
        description: toUserMessage(error),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
        <Icon icon={Plus} size="sm" />
        Add feature flag
      </Button>
      <Modal.Root
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) setSelectedIdentifier(undefined)
          setIsOpen(next)
        }}
      >
        <Modal.Content dismissible size="large">
          <Modal.Header
            title="Add feature flag"
            description="Choose one active flag to enable for this organization."
          />
          <Modal.Body>
            {availableFlags.length === 0 ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-4">
                <Text.H6 weight="medium">No available feature flags</Text.H6>
                <Text.H6 color="foregroundMuted">
                  Every active flag is already enabled for this organization, or no active flags exist yet.
                </Text.H6>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Select
                  name="featureFlag"
                  label="Feature flag"
                  options={options}
                  value={selectedIdentifier}
                  onChange={setSelectedIdentifier}
                  placeholder="Select a feature flag"
                  disabled={isSubmitting}
                  searchable
                  searchPlaceholder="Search feature flags..."
                  searchableEmptyMessage="No matching feature flags."
                  contentWidth="trigger"
                />
                {selectedFeatureFlag ? (
                  <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-background px-1.5 py-0.5 font-mono text-sm">
                        {selectedFeatureFlag.identifier}
                      </code>
                      <Text.H6 weight="medium">{selectedFeatureFlag.name ?? "Unnamed flag"}</Text.H6>
                    </div>
                    <Text.H6 color="foregroundMuted">{selectedFeatureFlag.description ?? "No description."}</Text.H6>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-3">
                    <Text.H6 weight="medium">Select a flag to preview it</Text.H6>
                    <Text.H6 color="foregroundMuted">
                      The flag identifier, name, and description will be shown before enabling it.
                    </Text.H6>
                  </div>
                )}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <CloseTrigger />
            <Button
              size="sm"
              disabled={!selectedIdentifier || isSubmitting || availableFlags.length === 0}
              onClick={() => void handleAdd()}
            >
              {isSubmitting ? "Enabling..." : "Enable feature flag"}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
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
