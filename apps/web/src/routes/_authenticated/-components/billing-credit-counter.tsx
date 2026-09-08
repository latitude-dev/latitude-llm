import { PRO_PLAN_CONFIG } from "@domain/billing"
import { Button, cn, Icon, Popover, PopoverContent, PopoverTrigger, Text, useToast } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { Flame } from "lucide-react"
import { useState } from "react"
import { createBillingCheckoutSession, getBillingOverview } from "../../../domains/billing/billing.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"
import { BillingUsageBreakdown } from "./billing-usage-breakdown.tsx"

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
// Period bounds are UTC midnights; local-time formatting would shift them a day back west of Greenwich.
const periodDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const BILLING_COUNTER_RADIUS = 8
const BILLING_COUNTER_CIRCUMFERENCE = 2 * Math.PI * BILLING_COUNTER_RADIUS
const FREE_PLAN_UPGRADE_USAGE_THRESHOLD = 0.8

type BillingOverview = Awaited<ReturnType<typeof getBillingOverview>>

const formatPeriodRange = (periodStart: string, periodEnd: string) =>
  `${periodDateFormatter.format(new Date(periodStart))} to ${periodDateFormatter.format(new Date(periodEnd))}`

export function BillingCreditCounter({
  organizationId,
  projectId,
  initialOverview,
}: {
  readonly organizationId: string
  readonly projectId: string
  readonly initialOverview?: BillingOverview | null
}) {
  const { toast } = useToast()
  const [isUpgradePending, setIsUpgradePending] = useState(false)
  // Seed from the layout loader's fetch so we don't re-hit billing on mount; a
  // null loader value (staff/impersonation) falls back to fetching client-side.
  const { data: overview } = useQuery({
    queryKey: ["billing", "overview", organizationId],
    queryFn: () => getBillingOverview(),
    staleTime: 30_000,
    ...(initialOverview ? { initialData: initialOverview } : {}),
  })

  if (!overview) return null

  const includedCredits = overview.includedCredits
  const hasIncludedCredits = includedCredits !== null && includedCredits > 0
  const isOverage = overview.overageCredits > 0
  const showLimitState = isOverage || (overview.planSlug === "free" && overview.isAtIncludedLimit)
  const strokeOffset = BILLING_COUNTER_CIRCUMFERENCE * (1 - overview.usageProgress)
  const consumedLabel = numberFormatter.format(overview.consumedCredits)
  const includedLabel = includedCredits === null ? "custom" : numberFormatter.format(includedCredits)
  const usageLabel = includedCredits === null ? consumedLabel : `${consumedLabel}/${includedLabel}`
  const headline = isOverage
    ? `${consumedLabel} credits used: ${numberFormatter.format(overview.includedUsedCredits)} included plus ${numberFormatter.format(overview.overageCredits)} metered overage`
    : `${consumedLabel} of ${includedLabel} credits used`
  const showUpgradeCta =
    overview.planSlug === "free" && hasIncludedCredits && overview.usageProgress >= FREE_PLAN_UPGRADE_USAGE_THRESHOLD

  const openUpgrade = async () => {
    setIsUpgradePending(true)
    try {
      const data = await createBillingCheckoutSession({
        data: { plan: PRO_PLAN_CONFIG.slug, returnUrl: "/" },
      })

      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsUpgradePending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Usage: ${headline}. Open breakdown.`}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted",
            )}
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              <Icon icon={Flame} size="xs" weight="L" />
              <Text.H6 color="foregroundMuted" weight="medium">
                Usage
              </Text.H6>
            </span>
            <span className="flex items-center gap-2">
              <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
                <svg aria-hidden="true" className="h-3.5 w-3.5 -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r={BILLING_COUNTER_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-muted"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r={BILLING_COUNTER_RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={BILLING_COUNTER_CIRCUMFERENCE}
                    strokeDashoffset={strokeOffset}
                    className={cn("transition-colors", {
                      "text-primary": !showLimitState,
                      "text-destructive": showLimitState,
                    })}
                  />
                </svg>
              </span>
              <Text.H6 weight="medium" color={showLimitState ? "destructive" : "foreground"}>
                {usageLabel}
              </Text.H6>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" sideOffset={12} className="w-80">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <Text.H5M color="foreground">Usage this period</Text.H5M>
                <Text.H7 color="foregroundMuted" noWrap>
                  {formatPeriodRange(overview.periodStart, overview.periodEnd)}
                </Text.H7>
              </div>
              <Text.H6 color={showLimitState ? "destructive" : "foregroundMuted"}>{headline}</Text.H6>
            </div>
            <BillingUsageBreakdown
              organizationId={organizationId}
              currentProjectId={projectId}
              consumedCredits={overview.consumedCredits}
            />
            {isOverage ? (
              <Text.H7 color="foregroundMuted">
                Usage can exceed the included limit because this plan allows overage billing.
              </Text.H7>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {showUpgradeCta ? (
        <Button size="sm" className="w-full" isLoading={isUpgradePending} onClick={() => void openUpgrade()}>
          Upgrade now
        </Button>
      ) : null}
    </div>
  )
}
