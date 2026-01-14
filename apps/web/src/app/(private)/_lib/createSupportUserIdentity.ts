import crypto from 'crypto'
import { env } from '@latitude-data/env'
import { User } from '@latitude-data/core/schema/models/types/User'

function getCredentials() {
  if (!env.SUPPORT_APP_ID || !env.SUPPORT_APP_SECRET_KEY) return

  return {
    appId: env.SUPPORT_APP_ID,
    secretKey: env.SUPPORT_APP_SECRET_KEY,
  }
}

function toUnixTimestampInSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000)
}

export function createSupportUserIdentity(user: User) {
  const credentials = getCredentials()
  if (!credentials) return null

  const { appId, secretKey } = credentials
  const identifier = user.email
  const userHash = crypto
    .createHmac('sha256', secretKey)
    .update(identifier)
    .digest('hex')
  return {
    appId,
    userHash,
    identifier,
    userData: {
      email: user.email,
      name: user.name ?? 'No name',
      id: user.id,
      createdAt: toUnixTimestampInSeconds(user.createdAt),
      jobTitle: user.title ?? undefined,
      aiUsageStage: user.aiUsageStage ?? undefined,
      latitudeGoal: user.latitudeGoalOther || user.latitudeGoal || undefined,
    },
  }
}

export type SupportUserIdentity = ReturnType<typeof createSupportUserIdentity>
