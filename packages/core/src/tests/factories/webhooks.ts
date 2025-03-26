import { faker } from '@faker-js/faker'

import { createWebhook as createWebhookFn } from '../../services/webhooks/createWebhook'
import { CreateWebhookParams } from '../../services/webhooks/types'

export type ICreateWebhook = {
  name?: string
  url?: string
  projectIds?: number[]
  isActive?: boolean
  workspaceId: number
}

export async function createWebhook(
  webhookData: Partial<ICreateWebhook> & { workspaceId: number },
) {
  const randomWebhookData = {
    name: faker.word.words(3),
    url: faker.internet.url(),
    projectIds: [],
    isActive: true,
  }

  const data = { ...randomWebhookData, ...webhookData }

  const result = await createWebhookFn(data as unknown as CreateWebhookParams)
  return result.unwrap()
}
