import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTriggerConfiguration,
  DocumentTriggerDeploymentSettings,
} from '@latitude-data/constants/documentTriggers'
import { type InferSelectModel } from 'drizzle-orm'

import { documentTriggers } from '../documentTriggers'

type _DocumentTrigger = InferSelectModel<typeof documentTriggers>
export type DocumentTrigger<
  T extends DocumentTriggerType = DocumentTriggerType,
> = Omit<
  _DocumentTrigger,
  'triggerType' | 'configuration' | 'deploymentSettings'
> & {
  triggerType: T
  configuration: DocumentTriggerConfiguration<T>
  deploymentSettings: DocumentTriggerDeploymentSettings<T> | null
}
