import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { hashContent } from '../../../lib/hashContent'

export function createTriggerHash({
  configuration,
}: {
  configuration: DocumentTriggerConfiguration<DocumentTriggerType>
}): string {
  return hashContent(JSON.stringify(configuration))
}
