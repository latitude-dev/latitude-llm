export { handleEmailTrigger } from './handlers/email'
export * from './create'
export {
  emailTriggerConfigurationSchema,
  insertScheduledTriggerConfigurationSchema,
  scheduledTriggerConfigurationSchema,
  documentTriggerConfigurationSchema,
  insertDocumentTriggerConfigurationSchema,
  type EmailTriggerConfiguration,
  type InsertScheduledTriggerConfiguration,
  type ScheduledTriggerConfiguration,
  type DocumentTriggerConfiguration,
  type DocumentTriggerWithConfiguration,
  type InsertDocumentTriggerWithConfiguration,
} from './helpers/schema'
