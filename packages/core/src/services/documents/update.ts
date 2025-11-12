import { scan } from 'promptl-ai'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { DocumentType } from '../../constants'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { updateDocumentUnsafe } from './updateUnsafe'

export async function getDocumentType({
  content,
}: {
  content: string
}): Promise<DocumentType> {
  if (!content || !content.trim().length) return DocumentType.Prompt

  const metadata = await scan({ prompt: content })
  const hasFrontmatter =
    metadata.config && Object.keys(metadata.config).length > 0

  if (!hasFrontmatter) return DocumentType.Prompt

  // Allow users to explicitly set type: prompt to override agent classification
  if (metadata.config.type === DocumentType.Prompt) return DocumentType.Prompt

  return DocumentType.Agent
}

export async function updateDocument(
  {
    commit,
    document,
    path,
    content,
    promptlVersion,
    deletedAt,
  }: {
    commit: Commit
    document: DocumentVersion
    path?: string
    content?: string | null
    promptlVersion?: number
    deletedAt?: Date | null
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  // Check if commit is draft
  const assertResult = assertCommitIsDraft(commit)
  if (assertResult.error) return assertResult

  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }

  // Delegate to unsafe version that does the actual work
  return updateDocumentUnsafe(
    {
      commit,
      document,
      path,
      content,
      promptlVersion,
      deletedAt,
    },
    transaction,
  )
}
