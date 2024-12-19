import { DiffValue } from '@latitude-data/core/browser'

export type DraftChange = {
  newDocumentPath: string
  oldDocumentPath: string
  content: DiffValue
}
