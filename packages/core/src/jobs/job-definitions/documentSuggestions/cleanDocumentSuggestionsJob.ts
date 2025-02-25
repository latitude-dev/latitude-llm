import { Job } from 'bullmq'
import { subDays } from 'date-fns'
import { lt } from 'drizzle-orm'
import { DOCUMENT_SUGGESTION_EXPIRATION_DAYS } from '../../../browser'
import { database } from '../../../client'
import { documentSuggestions } from '../../../schema'

export type CleanDocumentSuggestionsJobData = {}

export const cleanDocumentSuggestionsJob = async (
  _: Job<CleanDocumentSuggestionsJobData>,
) => {
  await database
    .delete(documentSuggestions)
    .where(
      lt(
        documentSuggestions.createdAt,
        subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS),
      ),
    )
}
