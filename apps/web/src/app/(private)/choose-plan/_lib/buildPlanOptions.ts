import {
  SubscriptionPlans,
  SubscriptionPlan,
  LEGACY_PLANS,
} from '@latitude-data/core/plans'
import { formatCount } from '@latitude-data/constants/formatCount'
import { ROUTES } from '$/services/routes'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function convertRequestPerSecondToPerMinute(rps: number) {
  return `${formatCount(rps * 60)} requests/minute`
}

export type PlanFeature = {
  text: string
  icon: IconName
  iconColor: TextColor
}

export type PlanOption = {
  plan: SubscriptionPlan
  name: string
  description: string
  price: string
  priceDescription?: string
  features: PlanFeature[]
  badge?: string
  recommended?: boolean
  isCurrentPlan?: boolean
  legacy?: boolean
  actionLabel: string
  actionUrl?: string
}

const PRO_V2 = SubscriptionPlans[SubscriptionPlan.ProV2]
const TEAM_V1 = SubscriptionPlans[SubscriptionPlan.TeamV1]
const TEAM_V2 = SubscriptionPlans[SubscriptionPlan.TeamV2]
const TEAM_V3 = SubscriptionPlans[SubscriptionPlan.TeamV3]
const TEAM_V4 = SubscriptionPlans[SubscriptionPlan.TeamV4]
const SCALE_V1 = SubscriptionPlans[SubscriptionPlan.ScaleV1]

type PlanConfig = {
  credits: number
  retention_period: number
  rate_limit: number
  latte_credits: number
  optimizationsMonth: number | 'unlimited'
}

function formatOptimizations(value: number | 'unlimited'): string {
  if (value === 'unlimited') return 'Unlimited'
  return String(value)
}

function buildTeamPlanFeatures(plan: PlanConfig): PlanFeature[] {
  return [
    {
      text: `${formatNumber(plan.credits)} runs/month`,
      icon: 'checkClean',
      iconColor: 'primary',
    },
    {
      text: `${plan.retention_period}-day log retention`,
      icon: 'checkClean',
      iconColor: 'primary',
    },
    {
      text: convertRequestPerSecondToPerMinute(plan.rate_limit),
      icon: 'checkClean',
      iconColor: 'primary',
    },
    { text: 'Prompt playground', icon: 'checkClean', iconColor: 'primary' },
    { text: 'Evals', icon: 'checkClean', iconColor: 'primary' },
    { text: 'Version control', icon: 'checkClean', iconColor: 'primary' },
    {
      text: 'Experiments & Observability',
      icon: 'checkClean',
      iconColor: 'primary',
    },
    { text: 'Annotations', icon: 'checkClean', iconColor: 'primary' },
    { text: 'Issue discovery', icon: 'checkClean', iconColor: 'primary' },
    {
      text: 'Automatic eval alignment',
      icon: 'checkClean',
      iconColor: 'primary',
    },
    {
      text: `${formatOptimizations(plan.optimizationsMonth)} prompt optimizations per month`,
      icon: plan.optimizationsMonth === 'unlimited' ? 'infinity' : 'checkClean',
      iconColor: 'primary',
    },
    { text: 'Dataset generator', icon: 'checkClean', iconColor: 'primary' },
    { text: 'Simulator', icon: 'checkClean', iconColor: 'primary' },
    { text: 'Team support', icon: 'headset', iconColor: 'primary' },
  ]
}

function getRecommendedPlan(currentPlan?: SubscriptionPlan): SubscriptionPlan {
  if (!currentPlan) return SubscriptionPlan.TeamV4

  const isLegacyOrTeam =
    LEGACY_PLANS.includes(currentPlan) ||
    currentPlan === SubscriptionPlan.TeamV4

  if (isLegacyOrTeam) return SubscriptionPlan.ScaleV1
  if (currentPlan === SubscriptionPlan.ScaleV1)
    return SubscriptionPlan.EnterpriseV1

  return SubscriptionPlan.TeamV4
}

export function buildPlanOptions({
  currentPlan,
}: {
  currentPlan: SubscriptionPlan
}): PlanOption[] {
  const recommendedPlan = getRecommendedPlan(currentPlan)

  const allPlans: PlanOption[] = [
    {
      plan: SubscriptionPlan.ProV2,
      name: 'Pro (Legacy)',
      description:
        'Your current legacy plan. Upgrade to a new plan for more features.',
      price: '$29',
      priceDescription: '/month',
      badge:
        currentPlan === SubscriptionPlan.ProV2 ? 'Current plan' : undefined,
      isCurrentPlan: currentPlan === SubscriptionPlan.ProV2,
      legacy: true,
      actionLabel: 'Current plan',
      features: buildTeamPlanFeatures(PRO_V2),
    },
    {
      plan: SubscriptionPlan.TeamV1,
      name: 'Team (Legacy)',
      description:
        'Your current legacy plan. Upgrade to a new plan for more features.',
      price: '$199',
      priceDescription: '/month',
      badge:
        currentPlan === SubscriptionPlan.TeamV1 ? 'Current plan' : undefined,
      isCurrentPlan: currentPlan === SubscriptionPlan.TeamV1,
      legacy: true,
      actionLabel: 'Current plan',
      features: buildTeamPlanFeatures(TEAM_V1),
    },
    {
      plan: SubscriptionPlan.TeamV2,
      name: 'Team (Legacy)',
      description:
        'Your current legacy plan. Upgrade to a new plan for more features.',
      price: '$199',
      priceDescription: '/month',
      badge:
        currentPlan === SubscriptionPlan.TeamV2 ? 'Current plan' : undefined,
      isCurrentPlan: currentPlan === SubscriptionPlan.TeamV2,
      legacy: true,
      actionLabel: 'Current plan',
      features: buildTeamPlanFeatures(TEAM_V2),
    },
    {
      plan: SubscriptionPlan.TeamV3,
      name: 'Team (Legacy)',
      description:
        'Your current legacy plan. Upgrade to a new plan for more features.',
      price: '$199',
      priceDescription: '/month',
      badge:
        currentPlan === SubscriptionPlan.TeamV3 ? 'Current plan' : undefined,
      isCurrentPlan: currentPlan === SubscriptionPlan.TeamV3,
      legacy: true,
      actionLabel: 'Current plan',
      features: buildTeamPlanFeatures(TEAM_V3),
    },
    {
      plan: SubscriptionPlan.TeamV4,
      name: 'Team',
      description:
        'Designed for teams building AI products collaboratively at scale.',
      price: '$299',
      priceDescription: '/month',
      badge:
        currentPlan === SubscriptionPlan.TeamV4 ? 'Current plan' : undefined,
      recommended: recommendedPlan === SubscriptionPlan.TeamV4,
      isCurrentPlan: currentPlan === SubscriptionPlan.TeamV4,
      actionLabel:
        currentPlan === SubscriptionPlan.TeamV4
          ? 'Current plan'
          : 'Get Team plan',
      actionUrl: ROUTES.api.pricings.detail(SubscriptionPlan.TeamV4).root,
      features: buildTeamPlanFeatures(TEAM_V4),
    },
    {
      plan: SubscriptionPlan.ScaleV1,
      name: 'Scale',
      description:
        'Designed for teams building AI products collaboratively at scale.',
      price: '$899',
      priceDescription: '/month',
      badge:
        currentPlan === SubscriptionPlan.ScaleV1 ? 'Current plan' : undefined,
      recommended: recommendedPlan === SubscriptionPlan.ScaleV1,
      isCurrentPlan: currentPlan === SubscriptionPlan.ScaleV1,
      actionLabel:
        currentPlan === SubscriptionPlan.ScaleV1 ? 'Current plan' : 'Get Scale',
      actionUrl: ROUTES.api.pricings.detail(SubscriptionPlan.ScaleV1).root,
      features: [
        {
          text: 'All features from Team',
          icon: 'checkCheck',
          iconColor: 'accentForeground',
        },
        {
          text: `${formatNumber(SCALE_V1.credits)} runs/month`,
          icon: 'checkClean',
          iconColor: 'primary',
        },
        {
          text: 'Unlimited log retention',
          icon: 'infinity',
          iconColor: 'primary',
        },
        {
          text: convertRequestPerSecondToPerMinute(SCALE_V1.rate_limit),
          icon: 'checkClean',
          iconColor: 'primary',
        },
        {
          text: `${formatOptimizations(SCALE_V1.optimizationsMonth)} prompt optimizations per month`,
          icon: 'infinity',
          iconColor: 'primary',
        },
        {
          text: 'Model distillation (lower cost and latency reduced x10)',
          icon: 'checkClean',
          iconColor: 'primary',
        },
        { text: 'Permissions', icon: 'checkClean', iconColor: 'primary' },
        {
          text: 'SOC2 & ISO27001 reports, BAA available (HIPAA compliant)',
          icon: 'checkClean',
          iconColor: 'primary',
        },
        { text: 'Priority support', icon: 'headset', iconColor: 'primary' },
      ],
    },
    {
      plan: SubscriptionPlan.EnterpriseV1,
      name: 'Enterprise',
      description:
        'Cloud with no limitations or self-host for maximum privacy.',
      price: 'Custom',
      badge:
        currentPlan === SubscriptionPlan.EnterpriseV1
          ? 'Current plan'
          : undefined,
      recommended: recommendedPlan === SubscriptionPlan.EnterpriseV1,
      isCurrentPlan: currentPlan === SubscriptionPlan.EnterpriseV1,
      actionLabel:
        currentPlan === SubscriptionPlan.EnterpriseV1
          ? 'Current plan'
          : 'Get in touch',
      actionUrl: ROUTES.api.pricings.detail(SubscriptionPlan.EnterpriseV1).root,
      features: [
        {
          text: 'Deploy in your infra with all features',
          icon: 'infinity',
          iconColor: 'primary',
        },
        {
          text: 'Volume discounts',
          icon: 'circleDollarSign',
          iconColor: 'primary',
        },
        { text: 'Priority support', icon: 'headset', iconColor: 'primary' },
      ],
    },
  ]

  const isAboveTeamPlan =
    currentPlan === SubscriptionPlan.ScaleV1 ||
    currentPlan === SubscriptionPlan.EnterpriseV1

  const teamAndProPlans = [
    SubscriptionPlan.ProV2,
    SubscriptionPlan.TeamV1,
    SubscriptionPlan.TeamV2,
    SubscriptionPlan.TeamV3,
    SubscriptionPlan.TeamV4,
  ]

  return allPlans.filter((plan) => {
    if (isAboveTeamPlan && teamAndProPlans.includes(plan.plan)) {
      return false
    }
    if (!plan.legacy) return true
    return plan.plan === currentPlan
  })
}
