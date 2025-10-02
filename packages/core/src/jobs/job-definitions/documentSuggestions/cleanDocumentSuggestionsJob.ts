import { documentSuggestions } from '../../../schema/models/documentSuggestions'
import { Job } from 'bullmq'
import { subDays } from 'date-fns'
import { lt } from 'drizzle-orm'
import { DOCUMENT_SUGGESTION_EXPIRATION_DAYS } from '../../../constants'
import { database } from '../../../client'

export type CleanDocumentSuggestionsJobData = {}

// TODO(evalsv2): Add tests
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
