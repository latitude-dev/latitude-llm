import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
export type SelectedIntegration = {
  slug: string
  type: DocumentTriggerType
}

export type OnTriggerCreated = (dt?: DocumentTrigger) => void

export type EditTriggerProps<T extends DocumentTriggerType> = {
  trigger: DocumentTrigger<T>
  document: DocumentVersion
  setConfiguration: ReactStateDispatch<DocumentTriggerConfiguration<T> | null>
  isUpdating: boolean
}

export type RunTriggerProps = {
  trigger: DocumentTrigger
  parameters: Record<string, unknown>
  userMessage?: string
  aiParameters?: boolean
}

export const RUNNABLE_TRIGGERS = [DocumentTriggerType.Scheduled]
