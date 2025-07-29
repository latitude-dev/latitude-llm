import { z } from 'zod'
import { DocumentTriggerParameters, DocumentTriggerType } from '..'

export const emailTriggerConfigurationSchema = z.object({
  name: z.string().optional(),
  replyWithResponse: z.boolean(),
  emailWhitelist: z.array(z.string()).optional(),
  domainWhitelist: z.array(z.string()).optional(),
  parameters: z.record(z.nativeEnum(DocumentTriggerParameters)).optional(),
})

export type EmailTriggerConfiguration = z.infer<
  typeof emailTriggerConfigurationSchema
>

export const insertScheduledTriggerConfigurationSchema = z.object({
  cronExpression: z.string(),
})
export const scheduledTriggerConfigurationSchema = z.object({
  cronExpression: z.string(),
  lastRun: z.date(),
  nextRunTime: z.date().or(z.undefined()),
  parameters: z.record(z.string(), z.unknown()).optional(),
})
export const integrationTriggerConfigurationSchema = z.object({
  integrationId: z.number(),
  componentId: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  payloadParameters: z.array(z.string()),
  triggerId: z.string(),
})

const insertIntegrationTriggerConfigurationSchema =
  integrationTriggerConfigurationSchema.omit({
    triggerId: true,
  })

export type InsertIntegrationTriggerConfiguration = z.infer<
  typeof insertIntegrationTriggerConfigurationSchema
>

export type InsertScheduledTriggerConfiguration = z.infer<
  typeof insertScheduledTriggerConfigurationSchema
>

export type ScheduledTriggerConfiguration = z.infer<
  typeof scheduledTriggerConfigurationSchema
>

export type IntegrationTriggerConfiguration = z.infer<
  typeof integrationTriggerConfigurationSchema
>

export const documentTriggerConfigurationSchema = z.discriminatedUnion(
  'triggerType',
  [
    z.object({
      triggerType: z.literal(DocumentTriggerType.Email),
      configuration: emailTriggerConfigurationSchema,
    }),
    z.object({
      triggerType: z.literal(DocumentTriggerType.Scheduled),
      configuration: scheduledTriggerConfigurationSchema,
    }),
    z.object({
      triggerType: z.literal(DocumentTriggerType.Integration),
      configuration: integrationTriggerConfigurationSchema,
    }),
  ],
)

export const insertDocumentTriggerConfigurationSchema = z.discriminatedUnion(
  'triggerType',
  [
    z.object({
      triggerType: z.literal(DocumentTriggerType.Email),
      configuration: emailTriggerConfigurationSchema,
    }),
    z.object({
      triggerType: z.literal(DocumentTriggerType.Scheduled),
      configuration: insertScheduledTriggerConfigurationSchema,
    }),
    z.object({
      triggerType: z.literal(DocumentTriggerType.Integration),
      configuration: insertIntegrationTriggerConfigurationSchema,
    }),
  ],
)

export type DocumentTriggerConfiguration =
  | EmailTriggerConfiguration
  | ScheduledTriggerConfiguration
  | IntegrationTriggerConfiguration

export type DocumentTriggerWithConfiguration = z.infer<
  typeof documentTriggerConfigurationSchema
>

export type InsertDocumentTriggerWithConfiguration = z.infer<
  typeof insertDocumentTriggerConfigurationSchema
>
