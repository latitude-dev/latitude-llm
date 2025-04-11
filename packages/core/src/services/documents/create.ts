import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import {
  DOCUMENT_PATH_REGEXP,
  EvaluationConfigurationNumerical,
  EvaluationMetadataLlmAsJudgeSimple,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationType,
  findFirstModelForProvider,
  LlmEvaluationMetric,
  User,
  Workspace,
  type Commit,
  type DocumentVersion,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { DocumentVersionsRepository } from '../../repositories'
import { documentVersions } from '../../schema'
import { connectEvaluations, createEvaluation } from '../evaluations'
import { createEvaluationV2 } from '../evaluationsV2'
import { pingProjectUpdate } from '../projects'
import {
  findDefaultEvaluationProvider,
  findDefaultProvider,
} from '../providerApiKeys/findDefaultProvider'
import { getDocumentType } from './update'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function createNewDocument(
  {
    workspace,
    user,
    commit,
    path,
    content,
    promptlVersion = 1,
    createDemoEvaluation: demoEvaluation = false,
    evaluationsV2Enabled = false,
  }: {
    workspace: Workspace
    user?: User
    commit: Commit
    path: string
    content?: string
    promptlVersion?: number
    createDemoEvaluation?: boolean
    evaluationsV2Enabled?: boolean
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
    const docContent =
      content ?? defaultContent.metadata + defaultContent.content

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

    if (user && demoEvaluation) {
      await createDemoEvaluation(
        { commit, document, evaluationsV2Enabled, user, workspace },
        tx,
      )
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

  let content = ''

  return {
    metadata: metadata ? `---\n${metadata}\n---\n\n` : '',
    content: content,
  }
}

async function createDemoEvaluation(
  {
    commit,
    document,
    evaluationsV2Enabled,
    user,
    workspace,
  }: {
    commit: Commit
    document: DocumentVersion
    evaluationsV2Enabled: boolean
    user: User
    workspace: Workspace
  },
  db = database,
) {
  // Note: failing silently to avoid not letting the user create the document
  const result = await findDefaultEvaluationProvider(workspace, db)
  if (result.error || !result.value) return
  const provider = result.value

  const model = findFirstModelForProvider({
    provider: provider,
    defaultProviderName: env.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
  })
  if (!model) return

  if (evaluationsV2Enabled) {
    return await createEvaluationV2({
      document: document,
      commit: commit,
      settings: {
        name: `Accuracy`,
        description: `Evaluates how well the given instructions are followed.`,
        type: EvaluationType.Llm,
        metric: LlmEvaluationMetric.Rating,
        configuration: {
          reverseScale: false,
          provider: provider.name,
          model: model,
          criteria:
            'Assess how well the response follows the given instructions.',
          minRating: 1,
          minRatingDescription:
            "Not faithful, doesn't follow the instructions.",
          maxRating: 5,
          maxRatingDescription: 'Very faithful, does follow the instructions.',
          minThreshold: 4,
        },
      },
      options: {
        evaluateLiveLogs: true,
        enableSuggestions: true,
        autoApplySuggestions: true,
      },
      workspace: workspace,
    }).then((r) => r.unwrap())
  }

  const evaluation = await createEvaluation(
    {
      workspace: workspace,
      user: user,
      name: `Accuracy`,
      description: `Evaluates how well the given instructions are followed.`,
      metadataType: EvaluationMetadataType.LlmAsJudgeSimple,
      metadata: {
        objective:
          'Assess how well the response follows the given instructions.',
      } as EvaluationMetadataLlmAsJudgeSimple,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: {
        minValue: 1,
        maxValue: 5,
        minValueDescription: "Not faithful, doesn't follow the instructions.",
        maxValueDescription: 'Very faithful, does follow the instructions.',
      } as EvaluationConfigurationNumerical,
    },
    db,
  ).then((r) => r.unwrap())

  await connectEvaluations(
    {
      workspace: workspace,
      documentUuid: document.documentUuid,
      evaluationUuids: [evaluation.uuid],
      user: user,
      live: true,
    },
    db,
  ).then((r) => r.unwrap())
}
