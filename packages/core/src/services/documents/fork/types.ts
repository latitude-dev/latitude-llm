import { type DocumentTrigger } from '../../../schema/models/types/DocumentTrigger'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { IntegrationDto } from '../../../schema/models/types/Integration'

export type ImportProps = {
  document: DocumentVersion
  snippets: DocumentVersion[]
  agents: DocumentVersion[]
  triggers: DocumentTrigger[]
  integrations: IntegrationDto[]
}

export type IntegrationMapping = {
  // For each original integration name/id, the new integration
  name: {
    [name: string]: IntegrationDto
  }
  id: {
    [id: number]: IntegrationDto
  }
}
