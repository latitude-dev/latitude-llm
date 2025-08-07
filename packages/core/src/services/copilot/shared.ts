import type { Commit, DocumentVersion, Workspace } from '../../browser'

export type Copilot = {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}
