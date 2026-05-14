import { PRO_PLAN_CONFIG } from "@domain/billing"
import { Badge, Button, Container, Icon, Input, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { PencilIcon } from "lucide-react"
import { useState } from "react"
import {
  createBillingCheckoutSession,
  createBillingPortalSession,
  getFreshBillingOverview,
  updateBillingSpendingLimit,
} from "../../../domains/billing/billing.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../lib/form-server-action.ts"

export const Route = createFileRoute("/_authenticated/settings/billing")({
  loader: async () => ({
    overview: await getFreshBillingOverview(),
  }),
  component: BillingSettingsPage,
  errorComponent: BillingUnavailableFallback,
})

function BillingUnavailableFallback({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <Container className="flex flex-col gap-6 pt-14">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Text.H4 weight="bold">Billing</Text.H4>
          <Text.H5 color="foregroundMuted">
            We couldn't load your billing data right now. This usually clears up after a refresh. If it keeps happening,
            contact support.
          </Text.H5>
        </div>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
        <Text.H6 color="destructive">Billing data unavailable</Text.H6>
        <Text.H6 color="foregroundMuted">{toUserMessage(error)}</Text.H6>
      </div>
      <div>
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </Container>
  )
}

const numberFormatter = new Intl.NumberFormat("en-US")
const compactNumberFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const formatCredits = (value: number) => (Number.isFinite(value) ? numberFormatter.format(value) : "Custom contract")

const formatCurrency = (dollars: number) => currencyFormatter.format(dollars)

const formatCurrencyFromCents = (cents: number) => formatCurrency(cents / 100)

const formatCurrencyFromMills = (mills: number) => formatCurrency(mills / 1000)

const formatPeriodDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

function BillingOverviewCards() {
  const overview = Route.useLoaderData({ select: (data) => data.overview })
  const totalUsedCredits = overview.consumedCredits + overview.overageCredits
  const hasOverageCredits = overview.overageCredits > 0
  const remainingCredits = Number.isFinite(overview.includedCredits)
    ? Math.max(overview.includedCredits - totalUsedCredits, 0)
    : Number.POSITIVE_INFINITY

  const cards = [
    {
      label: "Current plan",
      value: overview.planSlug === "enterprise" ? "Enterprise" : overview.planSlug === "pro" ? "Pro" : "Free",
      detail:
        overview.planSource === "subscription"
          ? "Managed through Stripe"
          : overview.planSource === "override"
            ? "Manual contract / override"
            : "Internal free plan",
    },
    {
      label: "Credits used this period",
      value: (
        <div className="flex items-baseline gap-2">
          <Text.H3 weight="bold">{numberFormatter.format(totalUsedCredits)}</Text.H3>
          <Text.H3 weight="medium" color="foregroundMuted">
            / {formatCredits(overview.includedCredits)} credits
          </Text.H3>
        </div>
      ),
      detail: hasOverageCredits
        ? `${compactNumberFormatter.format(overview.overageCredits)} overage credits this period`
        : Number.isFinite(remainingCredits)
          ? `${numberFormatter.format(remainingCredits)} credits remaining`
          : "Unlimited / custom allowance",
    },
    {
      label: "Current spend this month",
      value:
        overview.currentSpendMills === null ? "Custom contract" : formatCurrencyFromMills(overview.currentSpendMills),
      detail: "Subscription and metered usage for this billing period",
    },
  ] as const

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
          <Text.H6 color="foregroundMuted">{card.label}</Text.H6>
          {typeof card.value === "string" ? <Text.H3 weight="bold">{card.value}</Text.H3> : card.value}
          <Text.H6 color="foregroundMuted">{card.detail}</Text.H6>
        </div>
      ))}
    </div>
  )
}

function BillingActionsSection() {
  const overview = Route.useLoaderData({ select: (data) => data.overview })
  const { toast } = useToast()
  const [pendingAction, setPendingAction] = useState<"upgrade" | "portal" | null>(null)

  const returnUrl = "/settings/billing"

  const openUpgrade = async () => {
    setPendingAction("upgrade")
    try {
      const data = await createBillingCheckoutSession({
        data: { plan: PRO_PLAN_CONFIG.slug, returnUrl },
      })

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setPendingAction(null)
    }
  }

  const openPortal = async () => {
    setPendingAction("portal")
    try {
      const data = await createBillingPortalSession({ data: { returnUrl } })

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setPendingAction(null)
    }
  }

  const freeState = (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
      <div className="flex flex-col gap-2">
        <Text.H4 weight="bold" color="primary">
          Upgrade to Pro
        </Text.H4>
        <Text.H5 color="primary">
          Move to {currencyFormatter.format(PRO_PLAN_CONFIG.priceCents / 100)}/month for{" "}
          {numberFormatter.format(PRO_PLAN_CONFIG.includedCredits)} included credits, {PRO_PLAN_CONFIG.retentionDays}
          -day retention, and automatic overage billing instead of a hard cap.
        </Text.H5>
      </div>
      <div>
        <Button disabled={pendingAction !== null} onClick={() => void openUpgrade()}>
          {pendingAction === "upgrade" ? "Opening Checkout..." : "Upgrade to Pro"}
        </Button>
      </div>
    </div>
  )

  const proState = (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-2">
        <Text.H4 weight="bold">Manage subscription</Text.H4>
        <Text.H5 color="foregroundMuted">
          Update payment methods, download invoices, or review your subscription directly in Stripe Billing Portal.
        </Text.H5>
      </div>
      <div>
        <Button variant="outline" disabled={pendingAction !== null} onClick={() => void openPortal()}>
          {pendingAction === "portal" ? "Opening Portal..." : "Open Billing Portal"}
        </Button>
      </div>
    </div>
  )

  const enterpriseState = (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-2">
        <Text.H4 weight="bold">Enterprise contract</Text.H4>
        <Text.H5 color="foregroundMuted">
          This organization is on a manual billing contract. Included credits, retention, and any overage terms are
          managed directly by Latitude staff.
        </Text.H5>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">Manual provisioning</Badge>
        <Badge variant="secondary">Custom retention</Badge>
        <Badge variant="secondary">Support-assisted changes</Badge>
      </div>
    </div>
  )

  if (overview.planSlug === "enterprise") return enterpriseState
  if (overview.planSlug === "pro") return proState
  return freeState
}

function SpendingLimitSection() {
  const overview = Route.useLoaderData({ select: (data) => data.overview })
  const router = useRouter()
  const { toast } = useToast()
  const [clearing, setClearing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const form = useForm({
    defaultValues: {
      spendingLimit: overview.spendingLimitCents === null ? "" : (overview.spendingLimitCents / 100).toFixed(2),
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const trimmed = value.spendingLimit.trim()
        await updateBillingSpendingLimit({
          data: { spendingLimitDollars: trimmed ? Number(trimmed) : null },
        })
        return { cleared: !trimmed }
      },
      {
        onSuccess: async ({ cleared }) => {
          await router.invalidate()
          toast({ description: cleared ? "Spending limit cleared" : "Spending limit updated" })
          setIsEditing(false)
        },
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  if (overview.planSlug !== "pro" || overview.currentSpendMills === null) {
    return null
  }

  const clearSpendingLimit = async () => {
    setClearing(true)
    try {
      await updateBillingSpendingLimit({ data: { spendingLimitDollars: null } })
      await router.invalidate()
      toast({ description: "Spending limit cleared" })
      setIsEditing(false)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setClearing(false)
    }
  }

  return (
    <form
      key={overview.spendingLimitCents ?? "no-limit"}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <Text.H4 weight="bold">Monthly spend limit</Text.H4>
          <Text.H5 color="foregroundMuted">Caps this organization's total Pro spend for the billing period.</Text.H5>
        </div>

        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <form.Field name="spendingLimit">
                {(field) => (
                  <Input
                    type="number"
                    step="0.01"
                    min={(PRO_PLAN_CONFIG.priceCents / 100).toFixed(2)}
                    aria-label="Spend limit in USD"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    errors={fieldErrorsAsStrings(field.state.meta.errors)}
                    placeholder="Unlimited"
                    className="w-32"
                  />
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || clearing || overview.spendingLimitCents === null}
                      onClick={() => void clearSpendingLimit()}
                    >
                      {clearing ? "Clearing..." : "Clear"}
                    </Button>
                    <Button type="submit" disabled={isSubmitting || clearing}>
                      {isSubmitting ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </form.Subscribe>
            </>
          ) : (
            <>
              <Text.H5 weight="medium">
                {overview.spendingLimitCents === null
                  ? "Unlimited"
                  : formatCurrencyFromCents(overview.spendingLimitCents)}
              </Text.H5>
              <Button type="button" variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
                <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
              </Button>
            </>
          )}
        </div>
      </div>
    </form>
  )
}

function BillingSettingsPage() {
  const overview = Route.useLoaderData({ select: (data) => data.overview })

  return (
    <Container className="flex flex-col gap-8 pt-14">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Text.H4 weight="bold">Billing</Text.H4>
          <Badge
            variant={overview.planSlug === "free" ? "secondary" : overview.planSlug === "pro" ? "default" : "outline"}
          >
            {overview.planSlug?.toUpperCase()}
          </Badge>
        </div>
        <Text.H5 color="foregroundMuted">
          Current period: {formatPeriodDate(overview.periodStart)} to {formatPeriodDate(overview.periodEnd)}
        </Text.H5>
      </div>

      <BillingOverviewCards />
      <BillingActionsSection />
      <SpendingLimitSection key={overview.spendingLimitCents ?? "no-limit"} />
    </Container>
  )
}
