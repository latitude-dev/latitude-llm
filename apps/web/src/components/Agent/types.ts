import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
export type RunProps = {
  document: DocumentVersion
  trigger?: DocumentTrigger | undefined
  parameters: Record<string, unknown>
  userMessage?: string | undefined
  aiParameters?: boolean | undefined
}
