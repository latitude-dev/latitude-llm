import { PRO_PLAN_CONFIG } from "@domain/billing"
import { Badge, Button, Container, Text, useToast } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { getBillingOverview } from "../../../domains/billing/billing.functions.ts"
import { AUTH_BASE_PATH } from "../../../lib/auth-config.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { useAuthenticatedOrganizationId } from "../-route-data.ts"

export const Route = createFileRoute("/_authenticated/settings/billing")({
  loader: async () => ({
    overview: await getBillingOverview(),
  }),
  component: BillingSettingsPage,
})

const numberFormatter = new Intl.NumberFormat("en-US")
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const formatCredits = (value: number) => (Number.isFinite(value) ? numberFormatter.format(value) : "Custom contract")

const formatPeriodDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const formatOverageAmount = (microcents: number) => {
  if (microcents <= 0) return "No overage yet"

  const dollars = microcents / 100_000_000
  return dollars < 0.01 ? `< ${currencyFormatter.format(0.01)}` : currencyFormatter.format(dollars)
}

const postBillingEndpoint = async <T,>(path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${AUTH_BASE_PATH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  })

  const data = (await response.json()) as T & { message?: string }

  if (!response.ok) {
    throw new Error(typeof data.message === "string" ? data.message : `Billing request failed (${response.status})`)
  }

  return data
}

function BillingOverviewCards() {
  const overview = Route.useLoaderData({ select: (data) => data.overview })
  const remainingCredits = Number.isFinite(overview.includedCredits)
    ? Math.max(overview.includedCredits - overview.consumedCredits, 0)
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
      label: "Usage this period",
      value: (
        <div className="flex items-baseline gap-2">
          <Text.H3 weight="bold">{numberFormatter.format(overview.consumedCredits)}</Text.H3>
          <Text.H3 weight="medium" color="foregroundMuted">
            / {formatCredits(overview.includedCredits)}
          </Text.H3>
        </div>
      ),
      detail: Number.isFinite(remainingCredits)
        ? `${numberFormatter.format(remainingCredits)} credits remaining`
        : "Unlimited / custom allowance",
    },
    {
      label: "Overage",
      value: numberFormatter.format(overview.overageCredits),
      detail: formatOverageAmount(overview.overageAmountMicrocents),
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
  const organizationId = useAuthenticatedOrganizationId()
  const { toast } = useToast()
  const [pendingAction, setPendingAction] = useState<"upgrade" | "portal" | null>(null)

  const returnUrl = "/settings/billing"

  const openUpgrade = async () => {
    setPendingAction("upgrade")
    try {
      const data = await postBillingEndpoint<{ url: string; redirect: boolean }>("/subscription/upgrade", {
        plan: PRO_PLAN_CONFIG.slug,
        customerType: "organization",
        referenceId: organizationId,
        successUrl: returnUrl,
        cancelUrl: returnUrl,
        returnUrl,
        disableRedirect: true,
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
      const data = await postBillingEndpoint<{ url: string; redirect: boolean }>("/subscription/billing-portal", {
        customerType: "organization",
        referenceId: organizationId,
        returnUrl,
        disableRedirect: true,
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

  const freeState = (
    <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-6">
      <div className="flex flex-col gap-2">
        <Text.H4 weight="bold" color="primary">
          Upgrade to Pro
        </Text.H4>
        <Text.H6 color="primary">
          Move to {currencyFormatter.format(PRO_PLAN_CONFIG.priceCents / 100)}/month for{" "}
          {numberFormatter.format(PRO_PLAN_CONFIG.includedCredits)} included credits, {PRO_PLAN_CONFIG.retentionDays}
          -day retention, and automatic overage billing instead of a hard cap.
        </Text.H6>
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
        <Text.H6 color="foregroundMuted">
          Update payment methods, download invoices, or review your subscription directly in Stripe Billing Portal.
        </Text.H6>
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
        <Text.H6 color="foregroundMuted">
          This organization is on a manual billing contract. Included credits, retention, and any overage terms are
          managed directly by Latitude staff.
        </Text.H6>
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
            {overview.planSlug}
          </Badge>
        </div>
        <Text.H6 color="foregroundMuted">
          Current period: {formatPeriodDate(overview.periodStart)} to {formatPeriodDate(overview.periodEnd)}
        </Text.H6>
      </div>

      <BillingOverviewCards />
      <BillingActionsSection />
    </Container>
  )
}
