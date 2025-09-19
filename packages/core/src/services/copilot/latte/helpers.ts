import { env } from '@latitude-data/env'
import { ErrorResult, Result, TypedResult } from '../../../lib/Result'
import {
  LatitudeError,
  NotFoundError,
  NotImplementedError,
} from '../../../lib/errors'
import {
  Project,
  Workspace,
  DocumentVersion,
  Commit,
  LatteThreadUpdateArgs,
} from '../../../browser'
import {
  unsafelyFindProject,
  unsafelyFindWorkspace,
} from '../../../data-access'
import { PromisedResult } from '../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  IntegrationsRepository,
  ProviderApiKeysRepository,
} from '../../../repositories'
import {
  ChainEvent,
  ChainEventTypes,
  StreamEventTypes,
} from '@latitude-data/constants'
import { streamToGenerator } from '../../../lib/streamToGenerator'
import { WebsocketClient } from '../../../websockets/workers'
import {
  type ConversationMetadata,
  scan,
  type Document as RefDocument,
} from 'promptl-ai'
import { database } from '../../../client'
import { buildAgentsToolsMap } from '../../agents/agentsAsTools'
import path from 'path'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'

function missingKeyError(key: string): ErrorResult<LatitudeError> {
  return Result.error(
    new NotImplementedError(
      `Copilot is not supported in this environment. Please set the ${key} environment variable.`,
    ),
  )
}

export function assertCopilotIsSupported(): TypedResult<
  undefined,
  LatitudeError
> {
  if (!env.COPILOT_PROJECT_ID) return missingKeyError('COPILOT_PROJECT_ID')
  if (!env.COPILOT_LATTE_PROMPT_PATH) {
    return missingKeyError('COPILOT_LATTE_PROMPT_PATH')
  }

  return Result.nil()
}

async function getCommitResult({
  workspaceId,
  projectId,
  debugVersionUuid,
}: {
  workspaceId: number
  projectId: number
  debugVersionUuid?: string
}): PromisedResult<Commit> {
  const commitScope = new CommitsRepository(workspaceId)

  if (debugVersionUuid) {
    return commitScope.getCommitByUuid({
      projectId,
      uuid: debugVersionUuid,
    })
  }

  const headCommitResult = await commitScope.getHeadCommit(projectId)
  if (!Result.isOk(headCommitResult)) return headCommitResult
  const headCommit = headCommitResult.unwrap()

  if (!headCommit) {
    return Result.error(
      new NotFoundError('Live commit not found in Latte project'),
    )
  }

  return Result.ok(headCommit)
}

export async function getCopilotDocument(
  debugVersionUuid?: string,
): PromisedResult<
  {
    workspace: Workspace
    project: Project
    commit: Commit
    document: DocumentVersion
  },
  LatitudeError
> {
  const supportResult = assertCopilotIsSupported()
  if (!Result.isOk(supportResult))
    return supportResult as ErrorResult<LatitudeError>

  const project = await unsafelyFindProject(env.COPILOT_PROJECT_ID!)
  if (!project) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. There is no project with ID $COPILOT_PROJECT_ID`,
      ),
    )
  }
  const workspace = await unsafelyFindWorkspace(project.workspaceId).then(
    (w) => w!,
  )

  const commitResult = await getCommitResult({
    workspaceId: workspace.id,
    projectId: project.id,
    debugVersionUuid,
  })
  if (!Result.isOk(commitResult)) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. The desired commit does not exist in $COPILOT_PROJECT_ID`,
      ),
    )
  }
  const commit = commitResult.unwrap()

  const documentScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentScope.getDocumentByPath({
    path: env.COPILOT_LATTE_PROMPT_PATH!,
    commit,
  })
  if (!Result.isOk(documentResult)) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. There is no document with path $COPILOT_LATTE_PROMPT_PATH`,
      ),
    )
  }
  const document = documentResult.unwrap()

  return Result.ok({ workspace, project, commit, document })
}

export async function sendWebsockets({
  workspace,
  threadUuid,
  stream,
  isLatteDebugSession,
}: {
  workspace: Workspace
  threadUuid: string
  stream: ReadableStream<ChainEvent>
  isLatteDebugSession: boolean
}) {
  for await (const payload of streamToGenerator(stream)) {
    const { event, data } = payload

    if (event === StreamEventTypes.Provider) {
      if (data.type === 'tool-result') {
        WebsocketClient.sendEvent('latteThreadUpdate', {
          workspaceId: workspace.id,
          data: {
            threadUuid,
            type: 'toolCompleted',
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            result: data.result,
          } as LatteThreadUpdateArgs,
        })
      }

      if (data.type === 'tool-call') {
        WebsocketClient.sendEvent('latteThreadUpdate', {
          workspaceId: workspace.id,
          data: {
            threadUuid,
            type: 'toolStarted',
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            args: data.args,
            debugMode: isLatteDebugSession,
          } as LatteThreadUpdateArgs,
        })
      }

      if (data.type === 'text-delta') {
        WebsocketClient.sendEvent('latteThreadUpdate', {
          workspaceId: workspace.id,
          data: {
            threadUuid,
            type: 'responseDelta',
            delta: data.textDelta,
          } as LatteThreadUpdateArgs,
        })
      }
    }

    if (event === StreamEventTypes.Latitude) {
      if (data.type === ChainEventTypes.ProviderCompleted) {
        const textResponse = data.response.text

        WebsocketClient.sendEvent('latteThreadUpdate', {
          workspaceId: workspace.id,
          data: {
            threadUuid,
            type: 'fullResponse',
            response: textResponse,
          } as LatteThreadUpdateArgs,
        })
      }
    }
  }
}

export async function scanDocuments(
  {
    documents,
    commit,
    workspace,
  }: {
    documents: DocumentVersion[]
    commit: Commit
    workspace: Workspace
  },
  db = database,
): PromisedResult<{
  [path: string]: ConversationMetadata
}> {
  const providersScope = new ProviderApiKeysRepository(workspace.id, db)
  const providersResult = await providersScope.findAll()
  if (!Result.isOk(providersResult)) {
    return Result.error(providersResult.error!)
  }
  const providers = providersResult.unwrap()

  const integrationsScope = new IntegrationsRepository(workspace.id, db)
  const integrationsResult = await integrationsScope.findAll()
  if (!Result.isOk(integrationsResult)) {
    return Result.error(integrationsResult.error!)
  }
  const integrations = integrationsResult.unwrap()

  const agentsToolMapResult = await buildAgentsToolsMap(
    {
      commit,
      workspace,
    },
    db,
  )
  if (!Result.isOk(agentsToolMapResult)) {
    return Result.error(agentsToolMapResult.error!)
  }
  const agentToolsMap = agentsToolMapResult.unwrap()

  const referenceFn = async (
    refPath: string,
    from?: string,
  ): Promise<RefDocument | undefined> => {
    const fullPath = path
      .resolve(path.dirname(`/${from ?? ''}`), refPath)
      .replace(/^\//, '')

    const doc = documents.find((doc) => doc.path === fullPath)
    if (!doc) return undefined

    return {
      path: fullPath,
      content: doc.content,
    }
  }

  const metadatas = await Promise.all(
    documents.map(async (document) => {
      const configSchema = latitudePromptConfigSchema({
        providerNames: providers.map((p) => p.name),
        integrationNames: integrations.map((i) => i.name),
        fullPath: document.path,
        agentToolsMap,
      })

      // FIXME: infinite recursion
      // @ts-ignore
      return scan({
        prompt: document.content,
        fullPath: document.path,
        referenceFn,
        // @ts-expect-error - TODO(compiler): fix types
        configSchema: configSchema,
      })
    }),
  )

  return Result.ok(
    metadatas.reduce(
      (acc, metadata, index) => {
        acc[documents[index]!.path] = metadata
        return acc
      },
      {} as { [path: string]: ConversationMetadata },
    ),
  )
}
