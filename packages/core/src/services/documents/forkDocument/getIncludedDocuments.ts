import { resolveRelativePath } from '@latitude-data/constants'
import type { ConversationMetadata as LegacyMetadata } from '@latitude-data/constants/legacyCompiler'
import type { ConversationMetadata as PromptlMetadata } from 'promptl-ai'
import type { Commit, DocumentVersion, Workspace } from '../../../browser'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { DocumentVersionsRepository } from '../../../repositories'
import { scanCommitDocumentContents } from '../scan'

type ConversationMetadata = PromptlMetadata | LegacyMetadata

function getIncludedAgentsPaths({
  documentPath,
  documentsMetadata,
  acc = [],
}: {
  documentPath: string
  documentsMetadata: Record<string, ConversationMetadata>
  acc?: string[]
}): string[] {
  const docMetadata = documentsMetadata[documentPath]
  const agentsRelativePaths = (docMetadata?.config.agents as string[]) ?? []

  const agentsFullPaths = agentsRelativePaths.map((relativePath) =>
    resolveRelativePath(relativePath, documentPath),
  )

  const notEvaluatedAgentPaths = agentsFullPaths.filter((path) => !acc.includes(path))
  acc.push(...notEvaluatedAgentPaths)

  notEvaluatedAgentPaths.forEach((path) => {
    getIncludedAgentsPaths({ documentPath: path, documentsMetadata, acc })
  })

  return acc
}

export async function getIncludedDocuments({
  workspace,
  commit,
  document,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}) {
  const scannedDocuments = await scanCommitDocumentContents({
    workspaceId: workspace.id,
    commit,
  }).then((r) => r.unwrap())

  const metadata = scannedDocuments[document.path]

  if (!metadata) {
    return Result.error(new NotFoundError('Document not found in commit'))
  }

  const includedAgentsPaths = getIncludedAgentsPaths({
    documentPath: document.path,
    documentsMetadata: scannedDocuments,
  })
  const referencedPaths = Array.from(metadata.includedPromptPaths)
  const includedPaths = [...includedAgentsPaths, ...referencedPaths]
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const allDocs = await documentScope.getDocumentsAtCommit(commit).then((r) => r.unwrap())

  const includedDocs = allDocs.filter((doc) => includedPaths.includes(doc.path))

  return Result.ok(includedDocs)
}
