import {
  DocumentTrigger,
  DocumentVersion,
  IntegrationDto,
} from '../../../browser'

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
