import {
  type ElevenlabsWebhookEndpointId,
  elevenlabsWebhookEndpointIdSchema,
  organizationIdSchema,
  type ProjectId,
  projectIdSchema,
  userIdSchema,
} from "@domain/shared"
import { z } from "zod"

export const elevenlabsWebhookEndpointSchema = z.object({
  id: elevenlabsWebhookEndpointIdSchema,
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  webhookToken: z.string().min(1),
  signingSecret: z.string().min(1),
  createdByUserId: userIdSchema,
  revokedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type ElevenlabsWebhookEndpoint = z.infer<typeof elevenlabsWebhookEndpointSchema>

export interface ElevenlabsWebhookEndpointPublic {
  readonly id: ElevenlabsWebhookEndpointId
  readonly projectId: ProjectId
  readonly webhookToken: string
  readonly createdAt: Date
}
