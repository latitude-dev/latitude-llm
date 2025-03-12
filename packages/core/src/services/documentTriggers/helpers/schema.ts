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

export const scheduledTriggerConfigurationSchema = z.object({
  name: z.string().optional(),
  cronExpression: z.string(),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
  lastRun: z.date().optional(),
  nextRunTime: z.date().optional(),
})

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

const configurationSchemas = documentTriggerConfigurationSchema.options.map(
  (schema) => schema.shape.configuration,
)

export const documentTriggerConfigurationsUnionSchema =
  configurationSchemas.length > 1
    ? z.union([
        configurationSchemas[0],
        configurationSchemas[1],
        ...configurationSchemas.slice(2),
      ] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
    : configurationSchemas[0]!

export type DocumentTriggerConfiguration =
  | EmailTriggerConfiguration
  | ScheduledTriggerConfiguration

export type DocumentTriggerWithConfiguration = z.infer<
  typeof documentTriggerConfigurationSchema
>
