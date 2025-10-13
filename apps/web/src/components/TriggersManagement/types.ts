import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import {
  DocumentTrigger,
  DocumentVersion,
} from '@latitude-data/core/schema/types'

// TODO: Migrate chat (old share document to be a document trigger)
// This requires a data migration although not sure how much people are using it
export type TriggerIntegrationType = DocumentTriggerType | 'Chat'

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

export type RunDocumentProps = {
  document: DocumentVersion
  parameters: Record<string, unknown>
  userMessage?: string
  aiParameters?: boolean
}

export const RUNNABLE_TRIGGERS = [DocumentTriggerType.Scheduled]
