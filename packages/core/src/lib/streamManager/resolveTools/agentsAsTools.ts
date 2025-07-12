import { resolveRelativePath } from '@latitude-data/constants'
import { BadRequestError, LatitudeError, NotFoundError } from '../../errors'
import { PromisedResult } from '../../Transaction'
import { Result, TypedResult } from '../../Result'
import { ResolvedTools, ToolSource, ToolSourceData } from './types'
import { DocumentVersion } from '../../../browser'
import { DocumentVersionsRepository } from '../../../repositories'
import { getAgentToolName } from '../../../services/agents/helpers'
import { getToolDefinitionFromDocument } from '../../../services/agents/agentsAsTools'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Tool } from 'ai'
import { StreamManager } from '..'

function findAgentDocs({
  agentPaths,
  documents,
}: {
  agentPaths: string[]
  documents: DocumentVersion[]
}): TypedResult<DocumentVersion[], LatitudeError> {
  const [agentDocs, notfoundPaths] = agentPaths.reduce(
    ([agentDocs, notFoundPaths]: [DocumentVersion[], string[]], agentPath) => {
      const doc = documents.find((doc) => doc.path === agentPath)
      if (doc) {
        agentDocs.push(doc)
      } else {
        notFoundPaths.push(agentPath)
      }
      return [agentDocs, notFoundPaths]
    },
    [[], []],
  )

  if (notfoundPaths.length) {
    return Result.error(
      new NotFoundError(`Documents not found: '${notfoundPaths.join("', '")}'`),
    )
  }

  const notActuallyAgents = agentDocs.filter(
    (doc) => doc.documentType !== 'agent',
  )
  if (notActuallyAgents.length) {
    return Result.error(
      new BadRequestError(
        notActuallyAgents.length === 1
          ? `Document '${notActuallyAgents[0]!.path}' is not an agent`
          : `Documents are not agents: '${notActuallyAgents.map((doc) => doc.path).join("', '")}'`,
      ),
    )
  }

  return Result.ok(agentDocs)
}

export async function resolveAgentsAsTools({
  config,
  streamManager,
}: {
  config: LatitudePromptConfig
  streamManager: StreamManager
}): PromisedResult<ResolvedTools, LatitudeError> {
  const workspace = streamManager.workspace
  const promptSource = streamManager.promptSource

  const relativeAgentPaths = config.agents ?? []
  if (!relativeAgentPaths.length) return Result.ok({})

  // Only if the prompt source is a document
  if (!('commit' in promptSource)) {
    return Result.error(
      new BadRequestError('Sub agents are not supported in this context'),
    )
  }

  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docsResult = await docsScope.getDocumentsAtCommit(promptSource.commit)
  if (docsResult.error) return Result.error(docsResult.error)

  const docs = docsResult.unwrap()
  const absoluteAgentPaths = relativeAgentPaths.map((relativeAgentPath) =>
    resolveRelativePath(relativeAgentPath, promptSource.document.path),
  )
  const agentDocsResult = findAgentDocs({
    agentPaths: absoluteAgentPaths,
    documents: docs,
  })
  if (agentDocsResult.error) return agentDocsResult

  const referenceFn = async (target: string, from?: string) => {
    const fullPath = from ? resolveRelativePath(from, target) : target
    const refDoc = docs.find((doc) => doc.path === fullPath)
    return refDoc
      ? {
          path: refDoc.path,
          content: refDoc.content,
        }
      : undefined
  }

  const agentDocs = agentDocsResult.unwrap()
  const resolvedToolsEntries: [
    string,
    { definition: Tool; sourceData: ToolSourceData },
  ][] = await Promise.all(
    agentDocs.map(async (doc) => {
      return [
        getAgentToolName(doc.path),
        {
          definition: await getToolDefinitionFromDocument({
            workspace,
            commit: promptSource.commit,
            document: doc,
            referenceFn,
            context: streamManager.$context,
          }),
          sourceData: {
            source: ToolSource.AgentAsTool,
            agentPath: doc.path,
          },
        },
      ]
    }),
  )

  return Result.ok(Object.fromEntries(resolvedToolsEntries))
}
