import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'

export type Copilot = {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}
