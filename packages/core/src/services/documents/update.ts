import { scan } from 'promptl-ai'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { DocumentType } from '../../constants'
import { TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
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
  return await transaction.call(async (tx) => {
    const canEditCheck = await assertCanEditCommit(commit, tx)
    if (canEditCheck.error) return canEditCheck

    // Delegate to unsafe version that does the actual work
    return updateDocumentUnsafe(
      {
        commit,
        document,
        data: {
          path,
          content,
          promptlVersion,
          deletedAt,
        },
      },
      transaction,
    )
  })
}
