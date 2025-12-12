import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { WorkspaceDto } from '../../schema/models/types/Workspace'

export type Copilot = {
  workspace: WorkspaceDto
  commit: Commit
  document: DocumentVersion
}
