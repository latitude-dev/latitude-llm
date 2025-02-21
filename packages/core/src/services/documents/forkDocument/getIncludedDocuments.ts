import { resolveRelativePath } from '@latitude-data/constants'
import { Commit, DocumentVersion, Workspace } from '../../../browser'
import { Result } from '../../../lib'
import { DocumentVersionsRepository } from '../../../repositories'
import { scanDocumentContent } from '../scan'

export async function getIncludedDocuments({
  workspace,
  commit,
  document,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}) {
  const metadata = await scanDocumentContent({
    workspaceId: workspace.id,
    document,
    commit,
  }).then((r) => r.unwrap())

  const includedAgents: string[] = (metadata.config.agents as string[]) ?? []
  const includedAgentsFullPaths = includedAgents.map((agentPath) =>
    resolveRelativePath(agentPath, document.path),
  )
  const referencedPaths = Array.from(metadata.includedPromptPaths)
  const includedPaths = [...includedAgentsFullPaths, ...referencedPaths]
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const allDocs = await documentScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  const includedDocs = allDocs.filter((doc) => includedPaths.includes(doc.path))

  return Result.ok(includedDocs)
}
