import { env } from '@latitude-data/env'
import { ErrorResult, Result, TypedResult } from '../../../lib/Result'
import { LatitudeError, NotImplementedError } from '../../../lib/errors'
import { Project, Workspace, DocumentVersion, Commit } from '../../../browser'
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

export async function getCopilotDocument(): PromisedResult<
  {
    workspace: Workspace
    project: Project
    commit: Commit
    document: DocumentVersion
  },
  LatitudeError
> {
  const supportResult = assertCopilotIsSupported()
  if (!supportResult.ok) return supportResult as ErrorResult<LatitudeError>

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

  const commitScope = new CommitsRepository(workspace.id)
  const commitResult = await commitScope.getHeadCommit(project.id)
  if (!commitResult.ok || !commitResult.value) {
    return Result.error(
      new NotImplementedError(
        `Copilot is not supported in this environment. There is no commit for project with ID $COPILOT_PROJECT_ID`,
      ),
    )
  }
  const commit = commitResult.unwrap()!

  const documentScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentScope.getDocumentByPath({
    path: env.COPILOT_LATTE_PROMPT_PATH!,
    commit,
  })
  if (!documentResult.ok) {
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
}: {
  workspace: Workspace
  threadUuid: string
  stream: ReadableStream<ChainEvent>
}) {
  for await (const payload of streamToGenerator(stream)) {
    const { event, data } = payload
    if (event !== StreamEventTypes.Latitude) continue

    if (
      data.type === ChainEventTypes.ProviderCompleted ||
      data.type === ChainEventTypes.ToolCompleted
    ) {
      const message = data.messages.at(-1)!
      WebsocketClient.sendEvent('latteMessage', {
        workspaceId: workspace.id,
        data: {
          threadUuid,
          message,
        },
      })
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
  if (!providersResult.ok) {
    return Result.error(providersResult.error!)
  }
  const providers = providersResult.unwrap()

  const integrationsScope = new IntegrationsRepository(workspace.id, db)
  const integrationsResult = await integrationsScope.findAll()
  if (!integrationsResult.ok) {
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
  if (!agentsToolMapResult.ok) {
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

      return scan({
        prompt: document.content,
        fullPath: document.path,
        referenceFn,
        // @ts-expect-error – TODO: fix "Type instantiation is excessively deep and possibly infinite"
        configSchema,
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
