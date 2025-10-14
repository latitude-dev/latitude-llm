import {
  DocumentTrigger,
  DocumentVersion,
} from '@latitude-data/core/schema/types'

export type RunProps = {
  document: DocumentVersion
  trigger?: DocumentTrigger | undefined
  parameters: Record<string, unknown>
  userMessage?: string | undefined
  aiParameters?: boolean | undefined
}
