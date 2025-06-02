import { DocumentVersion } from '@latitude-data/core/browser'

export interface LatteEvents {
  DraftUpdatedByLatte: { draftUuid: string; updates: DocumentVersion[] }
}
