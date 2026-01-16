import { getPlanFromSubscriptionSlug } from '$/data-access'
import { GetUsageOverviewRow } from '@latitude-data/core/services/workspaces/usageOverview/getUsageOverview'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { SubscriptionPlanData } from '@latitude-data/core/plans'

const TOLERANCE_PERCENT = 0.05
export type UsageTrend = {
  icon: IconName
  last30daysRuns: number
  twoMonthsAgoRuns: number
}

function getTrendIndicator({
  runsTwoMonthsAgo,
  runsLast30Days,
}: {
  runsTwoMonthsAgo: number
  runsLast30Days: number
  plan: SubscriptionPlanData
}): UsageTrend {
  const smallerValue = Math.min(runsTwoMonthsAgo, runsLast30Days)
  const tolerance = smallerValue * TOLERANCE_PERCENT
  const diff = runsLast30Days - runsTwoMonthsAgo

  const commonProps = {
    last30daysRuns: runsLast30Days,
    twoMonthsAgoRuns: runsTwoMonthsAgo,
  }

  if (Math.abs(diff) < tolerance || diff === 0) {
    return {
      icon: 'equalApproximately',
      ...commonProps,
    }
  } else if (diff > 0) {
    return { icon: 'arrowUp', ...commonProps }
  } else {
    return {
      icon: 'arrowDown',
      ...commonProps,
    }
  }
}

function getEmailsList(emails: string | null) {
  if (!emails) return { firstEmail: undefined, rest: [] }
  const [firstEmail, ...rest] = emails.split(',').map((email) => email.trim())
  return {
    firstEmail,
    rest,
  }
}

export function buildUsageInformation(usage: GetUsageOverviewRow) {
  const plan = getPlanFromSubscriptionSlug(usage.subscriptionPlan)
  const trend = getTrendIndicator({
    runsTwoMonthsAgo: usage.lastTwoMonthsRuns,
    runsLast30Days: usage.lastMonthRuns,
    plan,
  })

  return {
    plan,
    trend,
    emails: getEmailsList(usage.emails),
  }
}
