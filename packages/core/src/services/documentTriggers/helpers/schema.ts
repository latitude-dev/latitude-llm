import {
  DocumentTriggerParameters,
  DocumentTriggerType,
} from '@latitude-data/constants'
import { z } from 'zod'

export const emailTriggerConfigurationSchema = z.object({
  replyWithResponse: z.boolean(),
  emailWhitelist: z.array(z.string()).optional(),
  domainWhitelist: z.array(z.string()).optional(),
  parameters: z.record(z.nativeEnum(DocumentTriggerParameters)).optional(),
})

export type EmailTriggerConfiguration = z.infer<
  typeof emailTriggerConfigurationSchema
>

export const documentTriggerConfigurationSchema = z.discriminatedUnion(
  'triggerType',
  [
    z.object({
      triggerType: z.literal(DocumentTriggerType.Email),
      configuration: emailTriggerConfigurationSchema,
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

export type DocumentTriggerConfiguration = EmailTriggerConfiguration

export type DocumentTriggerWithConfiguration = z.infer<
  typeof documentTriggerConfigurationSchema
>
