import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { PROJECT_MAIN_DOCUMENT } from '@latitude-data/constants/dualScope'

/**
 * We normally don't show main document in the UI.
 */
export function filterMainDocument({
  documents,
}: {
  documents: DocumentVersion[]
}) {
  return documents.filter((d) => d.path !== PROJECT_MAIN_DOCUMENT)
}
