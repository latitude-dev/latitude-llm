import { LatitudeGoal } from '@latitude-data/constants/users'
import { captureException } from '../../utils/datadogCapture'

const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2'

const LATITUDE_GOAL_TO_CAMPAIGN_ID: Partial<Record<LatitudeGoal, string>> = {
  [LatitudeGoal.JustExploring]: '61c8f29c-2846-4730-a9b8-4f2770b0b93f',
  [LatitudeGoal.ManagingPromptVersions]: '082db951-8d9f-410f-acc1-2e5d22794c8c',
  [LatitudeGoal.ObservingTraces]: '03881291-726f-4aaf-9f88-871392f9dfaa',
  [LatitudeGoal.ImprovingAccuracy]: 'df56b6eb-a71b-4be9-99d9-75d5b0cb5ce3',
  [LatitudeGoal.SettingUpEvaluations]: 'ef299a4f-99df-4bea-b5a4-581e09010adc',
}

const FALLBACK_CAMPAIGN_ID =
  LATITUDE_GOAL_TO_CAMPAIGN_ID[LatitudeGoal.JustExploring]!

const LATITUDE_GOAL_TO_TRIAL_FINISHING_CAMPAIGN_ID: Partial<
  Record<LatitudeGoal, string>
> = {
  [LatitudeGoal.JustExploring]: '3484a5e3-8ea6-4332-812d-e7a60d227da8',
  [LatitudeGoal.ManagingPromptVersions]: '1045b488-e74c-4d09-a560-a474ae7f339d',
  [LatitudeGoal.ObservingTraces]: '072effca-26b2-4039-a87b-a62f406053a6',
  [LatitudeGoal.ImprovingAccuracy]: 'ecea8072-0c56-4846-84d6-2d75bfd5e1d6',
  [LatitudeGoal.SettingUpEvaluations]: '6c584c30-f494-4fcc-b479-b04dc82f3019',
}

const FALLBACK_TRIAL_FINISHING_CAMPAIGN_ID =
  '3484a5e3-8ea6-4332-812d-e7a60d227da8'

export function getCampaignIdForGoal(
  goal: LatitudeGoal | null | undefined,
): string {
  if (goal && goal in LATITUDE_GOAL_TO_CAMPAIGN_ID) {
    return LATITUDE_GOAL_TO_CAMPAIGN_ID[
      goal as keyof typeof LATITUDE_GOAL_TO_CAMPAIGN_ID
    ]!
  }
  return FALLBACK_CAMPAIGN_ID
}

export function getCampaignIdForTrialFinishingGoal(
  goal: string | LatitudeGoal | null | undefined,
): string {
  if (goal && goal in LATITUDE_GOAL_TO_TRIAL_FINISHING_CAMPAIGN_ID) {
    return LATITUDE_GOAL_TO_TRIAL_FINISHING_CAMPAIGN_ID[
      goal as keyof typeof LATITUDE_GOAL_TO_TRIAL_FINISHING_CAMPAIGN_ID
    ]!
  }
  return FALLBACK_TRIAL_FINISHING_CAMPAIGN_ID
}

export function parseName(name: string | null | undefined): {
  first_name?: string
  last_name?: string
} {
  if (!name?.trim()) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0] }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

export type CreateInstantlyLeadUser = {
  email: string
  name?: string | null
  latitudeGoal?: LatitudeGoal | null
}

export type CreateInstantlyLeadOptions = {
  campaignContext: 'trial_finishing'
  goalForCampaign?: string | null
}

export async function createInstantlyLead(
  user: CreateInstantlyLeadUser,
  apiKey: string,
  options?: CreateInstantlyLeadOptions,
): Promise<void> {
  const email = user.email?.trim()
  if (!email) return

  const campaignId =
    options?.campaignContext === 'trial_finishing'
      ? getCampaignIdForTrialFinishingGoal(options?.goalForCampaign)
      : getCampaignIdForGoal(user.latitudeGoal ?? undefined)
  const { first_name } = parseName(user.name)

  const body = {
    campaign: campaignId,
    email,
    ...(first_name && { first_name }),
    skip_if_in_campaign: true,
  }

  try {
    const response = await fetch(`${INSTANTLY_API_BASE}/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      captureException(
        new Error(
          `Instantly create lead failed for ${email}: ${response.status} ${text}`,
        ),
      )
    }
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)))
  }
}
