import { env } from '@latitude-data/env'
import { LoopsClient } from 'loops'

import { type UserOnboardingInfoUpdatedEvent } from '../events'
import { Result } from '../../lib/Result'

const LOOPS_FIELD_MAX_LENGTH = 255

function sanitizeLoopsField(value?: string | null) {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  return trimmed.length > LOOPS_FIELD_MAX_LENGTH
    ? trimmed.slice(0, LOOPS_FIELD_MAX_LENGTH)
    : trimmed
}

function getApiKey() {
  const apiKey = env.LOOPS_API_KEY

  if (apiKey === undefined) {
    throw new Error('LOOPS_API_KEY is not set')
  }

  return apiKey
}

/**
 * Updates Loops contact data after onboarding changes.
 */
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
  const jobTitle = sanitizeLoopsField(data.title)
  const aiUsageStage = sanitizeLoopsField(data.aiUsageStage)
  const latitudeGoal =
    sanitizeLoopsField(data.latitudeGoalOther) ??
    sanitizeLoopsField(data.latitudeGoal)

  const response = await client.updateContact(userEmail, {
    ...(jobTitle && { jobTitle }),
    ...(aiUsageStage && { aiUsageStage }),
    ...(latitudeGoal && { latitudeGoal }),
  })

  if (!response.success) {
    throw new Error(`For email: ${userEmail}: ${response.message}`)
  }
}
