import { z } from 'zod'
import { DocumentTriggerParameters, DocumentTriggerType } from '..'

// --- Trigger Configuration ---

export const emailTriggerConfigurationSchema = z.object({
  name: z.string().optional(),
  replyWithResponse: z.boolean(),
  emailWhitelist: z.array(z.string()).optional(),
  domainWhitelist: z.array(z.string()).optional(),
  parameters: z.record(z.nativeEnum(DocumentTriggerParameters)).optional(),
})
export const scheduledTriggerConfigurationSchema = z.object({
  cronExpression: z.string(),
})
export const integrationTriggerConfigurationSchema = z.object({
  integrationId: z.number(),
  componentId: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  payloadParameters: z.array(z.string()),
})

export type EmailTriggerConfiguration = z.infer<
  typeof emailTriggerConfigurationSchema
>
export type ScheduledTriggerConfiguration = z.infer<
  typeof scheduledTriggerConfigurationSchema
>
export type IntegrationTriggerConfiguration = z.infer<
  typeof integrationTriggerConfigurationSchema
>

// prettier-ignore
export type DocumentTriggerConfiguration<T extends DocumentTriggerType> =
  T extends DocumentTriggerType.Email ? EmailTriggerConfiguration :
  T extends DocumentTriggerType.Scheduled ? ScheduledTriggerConfiguration :
  T extends DocumentTriggerType.Integration ? IntegrationTriggerConfiguration :
  never

// --- Trigger Deployment Settings ---

export const emailTriggerDeploymentSettingsSchema = z.object({
  // No settings, really
})
export const scheduledTriggerDeploymentSettingsSchema = z.object({
  lastRun: z.date(),
  nextRunTime: z.date().or(z.undefined()),
})
export const integrationTriggerDeploymentSettingsSchema = z.object({
  triggerId: z.string(),
})

export type EmailTriggerDeploymentSettings = z.infer<
  typeof emailTriggerDeploymentSettingsSchema
>
export type ScheduledTriggerDeploymentSettings = z.infer<
  typeof scheduledTriggerDeploymentSettingsSchema
>
export type IntegrationTriggerDeploymentSettings = z.infer<
  typeof integrationTriggerDeploymentSettingsSchema
>

// prettier-ignore
export type DocumentTriggerDeploymentSettings<T extends DocumentTriggerType> =
  T extends DocumentTriggerType.Email ? EmailTriggerDeploymentSettings :
  T extends DocumentTriggerType.Scheduled ? ScheduledTriggerDeploymentSettings :
  T extends DocumentTriggerType.Integration ? IntegrationTriggerDeploymentSettings :
  never
