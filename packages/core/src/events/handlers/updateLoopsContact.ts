import { env } from '@latitude-data/env'
import { LoopsClient } from 'loops'

import { type UserOnboardingInfoUpdatedEvent } from '../events'
import { Result } from '../../lib/Result'

function getApiKey() {
  const apiKey = env.LOOPS_API_KEY

  if (apiKey === undefined) {
    throw new Error('LOOPS_API_KEY is not set')
  }

  return apiKey
}

export async function updateLoopsContact({
  data: event,
}: {
  data: UserOnboardingInfoUpdatedEvent
}) {
  const apiKey = getApiKey()
  if (apiKey === '') return Result.nil()

  const client = new LoopsClient(apiKey)
  const data = event.data
  const userEmail = data.userEmail

  const response = await client.updateContact(userEmail, {
    ...(data.title && { jobTitle: data.title }),
    ...(data.aiUsageStage && { aiUsageStage: data.aiUsageStage }),
    ...(data.latitudeGoal && {
      latitudeGoal: data.latitudeGoalOther || data.latitudeGoal,
    }),
  })

  if (!response.success) {
    throw new Error(`For email: ${userEmail}: ${response.message}`)
  }
}
