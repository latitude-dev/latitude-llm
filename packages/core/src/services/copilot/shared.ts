import { Commit, DocumentVersion, Workspace } from '../../schema/types'

export type Copilot = {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}
