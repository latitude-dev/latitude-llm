import { DocumentTriggerType } from '@latitude-data/constants'
import { z } from 'zod'

export const emailTriggerConfigurationSchema = z.object({
  replyWithResponse: z.boolean(),
  emailWhitelist: z.array(z.string()).optional(),
  domainWhitelist: z.array(z.string()).optional(),
  subjectParameters: z.array(z.string()).optional(),
  contentParameters: z.array(z.string()).optional(),
  senderParameters: z.array(z.string()).optional(),
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

export type DocumentTriggerConfiguration = EmailTriggerConfiguration

export type DocumentTriggerWithConfiguration = z.infer<
  typeof documentTriggerConfigurationSchema
>
