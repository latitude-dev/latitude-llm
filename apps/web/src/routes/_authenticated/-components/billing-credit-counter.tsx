import { PRO_PLAN_CONFIG } from "@domain/billing"
import { Button, cn, Icon, Text, Tooltip, useToast } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { Flame } from "lucide-react"
import { useState } from "react"
import { createBillingCheckoutSession, getBillingOverview } from "../../../domains/billing/billing.functions.ts"
import { toUserMessage } from "../../../lib/errors.ts"

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const BILLING_COUNTER_RADIUS = 8
const BILLING_COUNTER_CIRCUMFERENCE = 2 * Math.PI * BILLING_COUNTER_RADIUS
const FREE_PLAN_UPGRADE_USAGE_THRESHOLD = 0.8

type BillingOverview = Awaited<ReturnType<typeof getBillingOverview>>

export function BillingCreditCounter({
  organizationId,
  initialOverview,
  collapsed = false,
}: {
  readonly organizationId: string
  readonly initialOverview?: BillingOverview | null
  /** Hides the row entirely — there's no room for it in the collapsed sidebar rail. */
  readonly collapsed?: boolean
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

  if (!overview || collapsed) return null

  const includedCredits = overview.includedCredits
  const totalUsedCredits = overview.consumedCredits + overview.overageCredits
  const hasIncludedCredits = includedCredits !== null && includedCredits > 0
  const progress = hasIncludedCredits ? Math.min(totalUsedCredits / includedCredits, 1) : 1
  const isOverage = overview.overageCredits > 0
  const isAtIncludedLimit = hasIncludedCredits && totalUsedCredits >= includedCredits
  const showLimitState = isOverage || (overview.planSlug === "free" && isAtIncludedLimit)
  const strokeOffset = BILLING_COUNTER_CIRCUMFERENCE * (1 - progress)
  const consumedLabel = numberFormatter.format(totalUsedCredits)
  const includedLabel = includedCredits === null ? "custom" : numberFormatter.format(includedCredits)
  const usageLabel = includedCredits === null ? consumedLabel : `${consumedLabel}/${includedLabel}`
  const tooltip = isOverage
    ? `${numberFormatter.format(totalUsedCredits)} credits used: ${numberFormatter.format(overview.consumedCredits)} included credits plus ${numberFormatter.format(overview.overageCredits)} metered overage credits. Usage can exceed the included limit because this plan allows overage billing.`
    : `${numberFormatter.format(overview.consumedCredits)} of ${includedLabel} credits used this period`
  const showUpgradeCta =
    overview.planSlug === "free" &&
    hasIncludedCredits &&
    totalUsedCredits / includedCredits >= FREE_PLAN_UPGRADE_USAGE_THRESHOLD

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
    <div className="flex flex-col gap-2">
      {showUpgradeCta ? (
        <Button size="sm" className="w-full" isLoading={isUpgradePending} onClick={() => void openUpgrade()}>
          Upgrade now
        </Button>
      ) : null}
      <Tooltip
        asChild
        trigger={
          <div className="flex items-center justify-between gap-2">
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
          </div>
        }
      >
        {tooltip}
      </Tooltip>
    </div>
  )
}
