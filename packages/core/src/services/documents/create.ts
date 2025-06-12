import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
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
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { documentVersions } from '../../schema'
import { createDemoEvaluation } from '../evaluationsV2/createDemoEvaluation'
import { pingProjectUpdate } from '../projects'
import { findDefaultProvider } from '../providerApiKeys/findDefaultProvider'
import { getDocumentType } from './update'

async function hasMetadata(content: string) {
  try {
    const doc = await scan({ prompt: content })

    if (!doc.config) return false

    return Object.keys(doc.config).length > 0
  } catch (e) {
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

export async function createNewDocument(
  {
    workspace,
    user,
    commit,
    path,
    content,
    promptlVersion = 1,
    createDemoEvaluation: demoEvaluation = false,
  }: {
    workspace: Workspace
    user?: User
    commit: Commit
    path: string
    content?: string
    promptlVersion?: number
    createDemoEvaluation?: boolean
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
    const docContent = await applyContent({ content, defaultContent })
    const documentType = await getDocumentType({
      content: docContent,
      promptlVersion,
    })

    const newDoc = await tx
      .insert(documentVersions)
      .values({
        commitId: commit.id,
        path,
        content: docContent,
        promptlVersion,
        documentType,
      })
      .returning()

    const document = newDoc[0]!

    // Invalidate all resolvedContent for this commit
    await tx
      .update(documentVersions)
      .set({ resolvedContent: null })
      .where(eq(documentVersions.commitId, commit.id))

    await pingProjectUpdate({ projectId: commit.projectId }, tx)

    publisher.publishLater({
      type: 'documentCreated',
      data: {
        document: document,
        workspaceId: workspace.id,
        userEmail: user?.email,
      },
    })

    if (demoEvaluation && user) {
      await createDemoEvaluation({ commit, document, workspace }, tx)
    }

    return Result.ok(document)
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
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (model) metadata += `\nmodel: ${model}`

  const content = ''

  return {
    metadata: metadata ? `---\n${metadata}\n---\n\n` : '',
    content: content,
  }
}
