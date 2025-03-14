import {
  DocumentTriggerParameters,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { z } from 'zod'

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

export type InsertScheduledTriggerConfiguration = z.infer<
  typeof insertScheduledTriggerConfigurationSchema
>

export type ScheduledTriggerConfiguration = z.infer<
  typeof scheduledTriggerConfigurationSchema
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
  ],
)

export type DocumentTriggerConfiguration =
  | EmailTriggerConfiguration
  | ScheduledTriggerConfiguration

export type DocumentTriggerWithConfiguration = z.infer<
  typeof documentTriggerConfigurationSchema
>

export type InsertDocumentTriggerWithConfiguration = z.infer<
  typeof insertDocumentTriggerConfigurationSchema
>
