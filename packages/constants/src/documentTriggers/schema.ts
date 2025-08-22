import { z } from 'zod'
import { DocumentTriggerParameters, DocumentTriggerType } from '..'

// ────────────────────────────────────────────────────────────────────────────────
// EMAIL TRIGGER
// ────────────────────────────────────────────────────────────────────────────────

export const emailTriggerConfigurationSchema = z.object({
  name: z.string().optional(),
  replyWithResponse: z.boolean(),
  emailWhitelist: z.array(z.string()).optional(),
  domainWhitelist: z.array(z.string()).optional(),
  parameters: z.record(z.nativeEnum(DocumentTriggerParameters)).optional(),
})

export const emailTriggerDeploymentSettingsSchema = z.object({
  // No settings, really
})

const promptLFileSchema = z.object({
  type: z.string(),
  mime: z.string(),
  mimeType: z.string(),
  isImage: z.boolean(),
  name: z.string(),
  size: z.number(),
  bytes: z.number(),
  url: z.string(),
})
export const emailTriggerEventPayloadSchema = z.object({
  recipient: z.string(),
  senderEmail: z.string(),
  senderName: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  messageId: z.string().optional(),
  parentMessageIds: z.array(z.string()).optional(),
  attachments: z.array(promptLFileSchema),
})

export type EmailTriggerConfiguration = z.infer<typeof emailTriggerConfigurationSchema> // prettier-ignore
export type EmailTriggerDeploymentSettings = z.infer<typeof emailTriggerDeploymentSettingsSchema> // prettier-ignore
export type EmailTriggerEventPayload = z.infer<typeof emailTriggerEventPayloadSchema> // prettier-ignore

// ────────────────────────────────────────────────────────────────────────────────
// SCHEDULED TRIGGER
// ────────────────────────────────────────────────────────────────────────────────

export const scheduledTriggerConfigurationSchema = z.object({
  cronExpression: z.string(),
})

export const scheduledTriggerDeploymentSettingsSchema = z.object({
  lastRun: z.date(),
  nextRunTime: z.date().or(z.undefined()),
})

export const scheduledTriggerEventPayloadSchema = z.object({
  // No event payload
})

export type ScheduledTriggerConfiguration = z.infer<typeof scheduledTriggerConfigurationSchema> // prettier-ignore
export type ScheduledTriggerDeploymentSettings = z.infer<typeof scheduledTriggerDeploymentSettingsSchema> // prettier-ignore
export type ScheduledTriggerEventPayload = z.infer<typeof scheduledTriggerEventPayloadSchema> // prettier-ignore

// ────────────────────────────────────────────────────────────────────────────────
// INTEGRATION TRIGGER
// ────────────────────────────────────────────────────────────────────────────────

export const integrationTriggerConfigurationSchema = z.object({
  integrationId: z.number(),
  componentId: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  payloadParameters: z.array(z.string()),
})

export const integrationTriggerDeploymentSettingsSchema = z.object({
  triggerId: z.string(),
})

export const integrationTriggerEventPayloadSchema = z.record(
  z.string(),
  z.unknown(),
)

export type IntegrationTriggerConfiguration = z.infer<typeof integrationTriggerConfigurationSchema> // prettier-ignore
export type IntegrationTriggerDeploymentSettings = z.infer<typeof integrationTriggerDeploymentSettingsSchema> // prettier-ignore
export type IntegrationTriggerEventPayload = z.infer<typeof integrationTriggerEventPayloadSchema> // prettier-ignore

// ────────────────────────────────────────────────────────────────────────────────
// CHAT TRIGGER
// ────────────────────────────────────────────────────────────────────────────────

export const chatTriggerConfigurationSchema = z.object({
  // No configuration for chat triggers
})

export const chatTriggerDeploymentSettingsSchema = z.object({
  // No deployment settings for chat triggers
})

export const chatTriggerEventPayloadSchema = z.object({
  // No event payload
})

export type ChatTriggerConfiguration = z.infer<typeof chatTriggerConfigurationSchema> // prettier-ignore
export type ChatTriggerDeploymentSettings = z.infer<typeof chatTriggerDeploymentSettingsSchema> // prettier-ignore
export type ChatTriggerEventPayload = z.infer<typeof chatTriggerEventPayloadSchema> // prettier-ignore

// ────────────────────────────────────────────────────────────────────────────────
// COMMON
// ────────────────────────────────────────────────────────────────────────────────

export const documentTriggerConfigurationSchema = z.union([
  emailTriggerConfigurationSchema,
  scheduledTriggerConfigurationSchema,
  integrationTriggerConfigurationSchema,
  chatTriggerConfigurationSchema,
])

// prettier-ignore
export type DocumentTriggerConfiguration<T extends DocumentTriggerType> =
  T extends DocumentTriggerType.Email ? EmailTriggerConfiguration :
  T extends DocumentTriggerType.Scheduled ? ScheduledTriggerConfiguration :
  T extends DocumentTriggerType.Integration ? IntegrationTriggerConfiguration :
  T extends DocumentTriggerType.Chat ? ChatTriggerConfiguration :
  never

// prettier-ignore
export type DocumentTriggerDeploymentSettings<T extends DocumentTriggerType> =
  T extends DocumentTriggerType.Email ? EmailTriggerDeploymentSettings :
  T extends DocumentTriggerType.Scheduled ? ScheduledTriggerDeploymentSettings :
  T extends DocumentTriggerType.Integration ? IntegrationTriggerDeploymentSettings :
  T extends DocumentTriggerType.Chat ? ChatTriggerDeploymentSettings :
  never

// prettier-ignore
export type DocumentTriggerEventPayload<T extends DocumentTriggerType> =
  T extends DocumentTriggerType.Email ? EmailTriggerEventPayload :
  T extends DocumentTriggerType.Scheduled ? ScheduledTriggerEventPayload :
  T extends DocumentTriggerType.Integration ? IntegrationTriggerEventPayload :
  T extends DocumentTriggerType.Chat ? ChatTriggerEventPayload :
  never
