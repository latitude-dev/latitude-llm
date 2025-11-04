import { env } from '@latitude-data/env'
import { LoopsClient } from 'loops'

import { type UserCreatedEvent } from '../events'
import { Result } from '../../lib/Result'

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
  const userEmail = data.userEmail
  const response = await client.createContact(userEmail, {
    userId: data.id,
    firstName: data.name,
    workspaceId: data.workspaceId,
    source: 'latitudeLlmAppSignup',
    userGroup: 'LLMs',
    subscribed: true,
    ...(data.title && { jobTitle: data.title }),
  })

  if (!response.success) {
    if (response.message.match('Email or userId is already on list')) return

    throw new Error(`For email: ${userEmail}: ${response.message}`)
  }
}
