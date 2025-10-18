import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
import { DOCUMENT_PATH_REGEXP } from '@latitude-data/constants'
import { findFirstModelForProvider } from '../ai/providers/models'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { documentVersions } from '../../schema/models/documentVersions'
import { createDemoEvaluation } from '../evaluationsV2/createDemoEvaluation'
import { pingProjectUpdate } from '../projects'
import { findDefaultProvider } from '../providerApiKeys/findDefaultProvider'
import { getDocumentType } from './update'
import { database } from '../../client'
import { updateListOfIntegrations } from './updateListOfIntegrations'
import { updateCommit } from '../commits'

async function hasMetadata(content: string) {
  try {
    const doc = await scan({ prompt: content })

    if (!doc.config) return false

    return Object.keys(doc.config).length > 0
  } catch (_e) {
    return false
  }
}

async function applyContent({
  content,
  defaultContent,
}: {
  content?: string
  defaultContent: {
    content: string
    metadata: string
  }
}) {
  if (content === undefined || content === null || content === '') {
    return defaultContent.metadata + defaultContent.content
  }

  const hasMeta = await hasMetadata(content)
  return hasMeta ? content : defaultContent.metadata + content
}

export async function defaultDocumentContent(
  {
    workspace,
    agent = false,
  }: {
    workspace: Workspace
    agent?: boolean
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
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (model) metadata += `\nmodel: ${model}`
  if (agent) metadata += `\ntype: agent`

  metadata += '\ntemperature: 1'

  const content = ''

  return {
    metadata: metadata ? `---\n${metadata}\n---\n\n` : '',
    content: content,
  }
}

/**
 * Creates a new document without checking if the commit is merged.
 * This should only be used in specific cases where you need to bypass
 * the commit state check (e.g., force updating live commits).
 *
 * For normal use cases, use `createNewDocument` instead.
 */
export async function createNewDocumentUnsafe(
  {
    workspace,
    user,
    commit,
    path,
    agent,
    content,
    promptlVersion = 1,
    createDemoEvaluation: demoEvaluation = false,
    includeDefaultContent = true,
  }: {
    workspace: Workspace
    user?: User
    commit: Commit
    path: string
    agent?: boolean
    content?: string
    promptlVersion?: number
    createDemoEvaluation?: boolean
    includeDefaultContent?: boolean
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion, Error>> {
  return await transaction.call(async (tx) => {
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

    let docContent = content ?? ''
    if (includeDefaultContent) {
      const defaultContent = await defaultDocumentContent(
        { workspace, agent },
        tx,
      )
      docContent = await applyContent({ content, defaultContent })
    }

    const documentType = await getDocumentType({ content: docContent })
    const [document] = await tx
      .insert(documentVersions)
      .values({
        commitId: commit.id,
        path,
        content: docContent,
        promptlVersion,
        documentType,
      })
      .returning()

    if (!document) {
      return Result.error(new BadRequestError('Failed to create document'))
    }

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, commit.id))

    // If there's no other main document in the commit, set this one
    if (!commit.mainDocumentUuid) {
      const commitUpdateResult = await updateCommit(
        {
          workspace,
          commit,
          data: {
            mainDocumentUuid: document.documentUuid,
          },
        },
        transaction,
      )

      if (commitUpdateResult.error) return commitUpdateResult
    }

    await updateListOfIntegrations(
      {
        workspace,
        projectId: commit.projectId,
        documentVersion: document,
      },
      transaction,
    )

    await pingProjectUpdate({ projectId: commit.projectId }, transaction)

    publisher.publishLater({
      type: 'documentCreated',
      data: {
        document: document,
        workspaceId: workspace.id,
        userEmail: user?.email,
      },
    })

    if (demoEvaluation && user) {
      await createDemoEvaluation({ commit, document, workspace }, transaction)
    }

    return Result.ok(document)
  })
}
