import { Result } from '@latitude-data/core/lib/Result'
import { env } from '@latitude-data/env'
import { LoopsClient } from 'loops'

import { type UserCreatedEvent } from '../events'

function getApiKey() {
  const apiKey = env.LOOPS_API_KEY

  if (apiKey === undefined) {
    throw new Error('LOOPS_API_KEY is not set')
  }

  return apiKey
}

export async function createLoopsContact({
  data: event,
}: {
  data: UserCreatedEvent
}) {
  // In dev is an empty string
  const apiKey = getApiKey()
  if (apiKey === '') return Result.nil()

  const client = new LoopsClient(apiKey)
  const data = event.data
  const response = await client.createContact(data.userEmail, {
    userId: data.id,
    firstName: data.name,
    workspaceId: data.workspaceId,
    source: 'latitudeLlmAppSignup',
    userGroup: 'LLMs',
    subscribed: true,
  })

  if (!response.success) {
    // This will be capture by Workers Sentry
    throw new Error(response.message)
  }

  return Result.ok(response.id)
}
