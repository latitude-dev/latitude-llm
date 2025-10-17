import { type InferSelectModel } from 'drizzle-orm'

import { documentSuggestions } from '../documentSuggestions'
import { EvaluationV2 } from '@latitude-data/constants'

export type DocumentSuggestion = InferSelectModel<typeof documentSuggestions>
export type DocumentSuggestionWithDetails = DocumentSuggestion & {
  evaluation: EvaluationV2
}
