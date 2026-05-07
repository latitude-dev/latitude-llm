import { type PlanSlug, PRO_PLAN_CONFIG } from "@domain/billing"
import {
  Avatar,
  Badge,
  Button,
  CopyButton,
  FormWrapper,
  Icon,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useForm } from "@tanstack/react-form"
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
  type AdminOrganizationBillingDto,
  type AdminOrganizationMemberDto,
  type AdminOrganizationProjectDto,
  adminClearOrganizationBillingOverride,
  adminGetOrganization,
  adminGetOrganizationBilling,
  adminUpdateOrganizationBillingOverride,
} from "../../../domains/admin/organizations.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"
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

const numberFormatter = new Intl.NumberFormat("en-US")
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

export const Route = createFileRoute("/backoffice/organizations/$organizationId")({
  staleTime: 0,
  loader: async ({ params }) => {
    try {
      const [organization, featureFlags, billing] = await Promise.all([
        adminGetOrganization({ data: { organizationId: params.organizationId } }),
        adminListOrganizationFeatureFlags({ data: { organizationId: params.organizationId } }),
        adminGetOrganizationBilling({ data: { organizationId: params.organizationId } }),
      ])
      return { organization, featureFlags, billing }
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
  const loaderBilling = Route.useLoaderData({ select: (data) => data.billing })
  const [billingSnapshot, setBillingSnapshot] = useState<AdminOrganizationBillingDto | null>(null)
  const billing = billingSnapshot ?? loaderBilling

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

      <DashboardSplit
        ratio="wide-primary"
        primary={<BillingSummarySection billing={billing} />}
        secondary={
          <BillingOverrideSection
            key={`${organization.id}:${billing.override?.updatedAt ?? "no-override"}:${billing.effectivePlanSlug}`}
            organizationId={organization.id}
            billing={billing}
            onBillingChange={setBillingSnapshot}
          />
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

function BillingSummarySection({ billing }: { billing: AdminOrganizationBillingDto }) {
  const currentSpendLabel =
    billing.currentSpendMills === null
      ? "Not tracked for this plan"
      : currencyFormatter.format(billing.currentSpendMills / 1000)

  const summaryRows = [
    { label: "Effective plan", value: billing.effectivePlanSlug, muted: `Source: ${billing.effectivePlanSource}` },
    {
      label: "Stripe subscription",
      value: billing.stripeSubscriptionStatus ?? "(none)",
      muted: billing.stripeSubscriptionPlan
        ? `Mapped plan: ${billing.stripeSubscriptionPlan}`
        : "No active Stripe subscription",
    },
    {
      label: "Billing period",
      value: `${new Date(billing.periodStart).toLocaleDateString()} - ${new Date(billing.periodEnd).toLocaleDateString()}`,
      muted: `${billing.retentionDays} day retention entitlement`,
    },
    {
      label: "Included / consumed",
      value: `${formatCredits(billing.includedCredits)} / ${numberFormatter.format(billing.consumedCredits)}`,
      muted:
        billing.includedCredits === null
          ? "No fixed monthly bundle — entitlement scales with contract"
          : `${numberFormatter.format(Math.max(billing.includedCredits - billing.consumedCredits, 0))} credits remaining`,
    },
    {
      label: "Overage",
      value: numberFormatter.format(billing.overageCredits),
      muted:
        billing.overageAmountMills > 0
          ? currencyFormatter.format(billing.overageAmountMills / 1000)
          : "No overage reported",
    },
    {
      label: "Spend cap",
      value:
        billing.spendingLimitCents === null ? "No cap" : currencyFormatter.format(billing.spendingLimitCents / 100),
      muted:
        billing.effectivePlanSlug === PRO_PLAN_CONFIG.slug
          ? `Current spend: ${currentSpendLabel}`
          : "Customer-managed spending caps only apply to self-serve Pro billing",
    },
  ] as const

  return (
    <DashboardSection title="Billing state">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={
              billing.effectivePlanSlug === "enterprise"
                ? "outline"
                : billing.effectivePlanSlug === "pro"
                  ? "default"
                  : "secondary"
            }
          >
            {billing.effectivePlanSlug}
          </Badge>
          {billing.override ? <Badge variant="secondary">manual override active</Badge> : null}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {summaryRows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 rounded-md border border-border/70 bg-background p-4">
              <Text.H6 color="foregroundMuted">{row.label}</Text.H6>
              <Text.H5 weight="medium">{row.value}</Text.H5>
              <Text.H6 color="foregroundMuted">{row.muted}</Text.H6>
            </div>
          ))}
        </div>
      </div>
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

function BillingOverrideSection({
  organizationId,
  billing,
  onBillingChange,
}: {
  organizationId: string
  billing: AdminOrganizationBillingDto
  onBillingChange: (billing: AdminOrganizationBillingDto) => void
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [clearing, setClearing] = useState(false)

  const form = useForm({
    defaultValues: {
      plan: (billing.override?.plan ?? billing.effectivePlanSlug) as PlanSlug,
      includedCredits: billing.override?.includedCredits?.toString() ?? "",
      retentionDays: billing.override?.retentionDays?.toString() ?? "",
      notes: billing.override?.notes ?? "",
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        await adminUpdateOrganizationBillingOverride({
          data: {
            organizationId,
            plan: value.plan,
            includedCredits: value.includedCredits.trim() ? Number(value.includedCredits) : null,
            retentionDays: value.retentionDays.trim() ? Number(value.retentionDays) : null,
            notes: value.notes.trim() ? value.notes.trim() : null,
          },
        })
        const freshBilling = await adminGetOrganizationBilling({ data: { organizationId } })
        return { freshBilling }
      },
      {
        onSuccess: async ({ freshBilling }) => {
          onBillingChange(freshBilling)
          toast({ description: "Billing override updated" })
          await router.invalidate()
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  const clearOverride = async () => {
    setClearing(true)
    try {
      await adminClearOrganizationBillingOverride({ data: { organizationId } })
      const freshBilling = await adminGetOrganizationBilling({ data: { organizationId } })
      onBillingChange(freshBilling)
      toast({ description: "Billing override cleared" })
      await router.invalidate()
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setClearing(false)
    }
  }

  return (
    <DashboardSection title="Manual override controls">
      <form
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FormWrapper>
          <Text.H6 color="foregroundMuted">
            Use this to force an effective plan for enterprise contracts or support-led overrides. Empty included-credit
            or retention fields fall back to the selected plan defaults.
          </Text.H6>
          <form.Field name="plan">
            {(field) => (
              <Select
                name="billing-plan"
                label="Override plan"
                value={field.state.value}
                onChange={(value) => field.handleChange(value as PlanSlug)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                options={[
                  { label: "Free", value: "free" },
                  { label: "Pro", value: "pro" },
                  { label: "Enterprise", value: "enterprise" },
                ]}
              />
            )}
          </form.Field>
          <form.Field name="includedCredits">
            {(field) => (
              <Input
                type="number"
                label="Included credits override"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                placeholder="Leave empty to use plan default"
              />
            )}
          </form.Field>
          <form.Field name="retentionDays">
            {(field) => (
              <Input
                type="number"
                label="Retention days override"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                placeholder="Leave empty to use plan default"
              />
            )}
          </form.Field>
          <form.Field name="notes">
            {(field) => (
              <Textarea
                label="Internal notes"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={fieldErrorsAsStrings(field.state.meta.errors)}
                placeholder="Contract notes, override reason, or support context"
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isSubmitting || clearing}>
                  {isSubmitting ? "Saving..." : "Save override"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting || clearing || billing.override === null}
                  onClick={() => void clearOverride()}
                >
                  {clearing ? "Clearing..." : "Clear override"}
                </Button>
              </div>
            )}
          </form.Subscribe>
        </FormWrapper>
      </form>
    </DashboardSection>
  )
}

function formatCredits(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unlimited"
  return Number.isFinite(value) ? numberFormatter.format(value) : "Custom contract"
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
