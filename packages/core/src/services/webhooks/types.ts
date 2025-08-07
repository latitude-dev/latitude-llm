export type WebhookWithoutSecrets = Omit<Webhook, 'signingSecret'>

export interface WebhookTestResponse {
  success: boolean
  statusCode: number
  message: string
}
import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm'

import { webhookDeliveries, webhooks } from '../../schema/models/webhooks'

export type Webhook = InferSelectModel<typeof webhooks>
export type NewWebhook = InferInsertModel<typeof webhooks>

export type WebhookDelivery = InferSelectModel<typeof webhookDeliveries>
export type NewWebhookDelivery = InferInsertModel<typeof webhookDeliveries>

export type WebhookStatus = 'success' | 'failed' | 'retrying'

export type CreateWebhookParams = {
  workspaceId: number
  name: string
  url: string
  projectIds: number[]
  isActive: boolean
}

export type UpdateWebhookParams = {
  webhook: Webhook
  name?: string
  url?: string
  projectIds?: number[]
  isActive?: boolean
}

export type DeleteWebhookParams = {
  id: string
  workspaceId: string
}

export type GetWebhookParams = {
  id: string
  workspaceId: string
}

export type ListWebhooksParams = {
  workspaceId: string
  projectId?: string
}

export type CreateWebhookDeliveryParams = {
  webhookId: string
  workspaceId: string
  eventType: string
  payload: unknown
  status: 'pending' | 'success' | 'failed'
  error?: string
  retryCount?: number
  nextRetryAt?: Date
}

export type UpdateWebhookDeliveryParams = {
  id: string
  webhookId: string
  workspaceId: string
  status: 'pending' | 'success' | 'failed'
  error?: string
  retryCount?: number
  nextRetryAt?: Date
}

export type GetWebhookDeliveryParams = {
  id: string
  webhookId: string
  workspaceId: string
}

export type ListWebhookDeliveriesParams = {
  webhookId: string
  workspaceId: string
  limit?: number
  offset?: number
}

export type DeleteWebhookDeliveryParams = {
  id: string
  webhookId: string
  workspaceId: string
}

export type WebhookPayload = {
  eventType: string
  payload: unknown
}
