import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import {
  DOCUMENT_PATH_REGEXP,
  findFirstModelForProvider,
  User,
  Workspace,
  type Commit,
  type DocumentVersion,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction, TypedResult } from '../../lib'
import { BadRequestError } from '../../lib/errors'
import { DocumentVersionsRepository } from '../../repositories'
import { documentVersions } from '../../schema'
import { findDefaultProvider } from '../providerApiKeys/findDefaultProvider'
import { pingProjectUpdate } from '../projects'

export async function createNewDocument(
  {
    workspace,
    user,
    commit,
    path,
    content,
    promptlVersion = 1,
  }: {
    workspace: Workspace
    user?: User
    commit: Commit
    path: string
    content?: string
    promptlVersion?: number
  },
  db = database,
): Promise<TypedResult<DocumentVersion, Error>> {
  return await Transaction.call(async (tx) => {
    if (commit.mergedAt !== null) {
      return Result.error(new BadRequestError('Cannot modify a merged commit'))
    }

    if (!DOCUMENT_PATH_REGEXP.test(path)) {
      return Result.error(
        new BadRequestError(
          "Invalid path, no spaces. Only letters, numbers, '.', '-' and '_'",
        ),
      )
    }

    const docsScope = new DocumentVersionsRepository(workspace!.id, tx)

    const currentDocs = await docsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    if (currentDocs.find((d) => d.path === path)) {
      return Result.error(
        new BadRequestError('A document with the same path already exists'),
      )
    }

    const defaultContent = await defaultDocumentContent({ workspace }, tx)

    const newDoc = await tx
      .insert(documentVersions)
      .values({
        commitId: commit.id,
        path,
        content: content ?? defaultContent.metadata + defaultContent.content,
        promptlVersion,
      })
      .returning()

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, commit.id))

    await pingProjectUpdate({ projectId: commit.projectId }, tx)

    publisher.publishLater({
      type: 'documentCreated',
      data: {
        document: newDoc[0]!,
        workspaceId: workspace.id,
        userEmail: user?.email,
      },
    })

    return Result.ok(newDoc[0]!)
  }, db)
}

export async function defaultDocumentContent(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  db = database,
) {
  let metadata = ''

  const provider = await findDefaultProvider(workspace, db).then((r) =>
    r.unwrap(),
  )
  if (provider) metadata += `provider: ${provider.name}`

  const model = findFirstModelForProvider({
    provider: provider,
    latitudeProvider: env.DEFAULT_PROVIDER_ID,
  })
  if (model) metadata += `\nmodel: ${model}`

  let content = ''

  return {
    metadata: metadata ? `---\n${metadata}\n---\n\n` : '',
    content: content,
  }
}
