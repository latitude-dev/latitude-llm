import { AgentToolsMap, ToolDefinition } from '@latitude-data/constants'
import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
  PromisedResult,
  Result,
  TypedResult,
} from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'
import path from 'path'
import { Commit, DocumentVersion, Workspace } from '../../browser'
import { scan } from 'promptl-ai'
import { readMetadata } from '@latitude-data/compiler'
import { JSONSchema7 } from 'json-schema'
import { getAgentToolName } from './helpers'
import { database } from '../../client'

const DEFAULT_PARAM_DEFINITION: JSONSchema7 = {
  type: 'string',
}

function resolvePath(from: string, target: string): string {
  if (!from.startsWith('/')) from = '/' + from
  const result = path.resolve(path.dirname(from), target)
  return result.startsWith('/') ? result.slice(1) : result
}

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

async function getToolDefinitionFromDocument({
  doc,
  allDocs,
}: {
  doc: DocumentVersion
  allDocs: DocumentVersion[]
}): Promise<ToolDefinition> {
  const metadataFn = doc.promptlVersion === 1 ? scan : readMetadata
  const referenceFn = async (target: string, from?: string) => {
    const fullPath = from ? resolvePath(from, target) : target
    const refDoc = allDocs.find((doc) => doc.path === fullPath)
    return refDoc
      ? {
          path: refDoc.path,
          content: refDoc.content,
        }
      : undefined
  }

  const metadata = await metadataFn({
    prompt: doc.content,
    fullPath: doc.path,
    referenceFn,
  })

  const description = metadata.config['description'] as string | undefined

  const params = (metadata.config['parameters'] ?? {}) as Record<
    string,
    JSONSchema7
  >
  metadata.parameters.forEach((param) => {
    if (param in params) return
    params[param] = DEFAULT_PARAM_DEFINITION
  })

  const parametersSchema: JSONSchema7 = {
    type: 'object',
    properties: params,
    required: Object.keys(params),
    additionalProperties: false,
  }

  return {
    description: description ?? 'An AI agent',
    parameters: parametersSchema,
  }
}

export async function buildAgentsAsToolsDefinition({
  workspace,
  document,
  commit,
  agents,
}: {
  workspace: Workspace
  document: DocumentVersion
  commit: Commit
  agents: string[]
}): PromisedResult<Record<string, ToolDefinition>> {
  if (!agents.length) return Result.ok({})

  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (docsResult.error) return Result.error(docsResult.error)
  const docs = docsResult.unwrap()
  const configAgentPaths = agents.map((agentPath) =>
    resolvePath(document.path, agentPath),
  )

  const agentDocsResult = findAgentDocs({
    agentPaths: configAgentPaths,
    documents: docs,
  })
  if (agentDocsResult.error) return agentDocsResult
  const agentDocs = agentDocsResult.unwrap()

  const toolDefinitions = await Promise.all(
    agentDocs.map(async (doc) => {
      return {
        [getAgentToolName(doc.path)]: await getToolDefinitionFromDocument({
          doc,
          allDocs: docs,
        }),
      }
    }),
  ).then((definitions) => Object.assign({}, ...definitions))

  return Result.ok(toolDefinitions)
}

export async function buildAgentsToolsMap(
  {
    workspace,
    commit,
  }: {
    workspace: Workspace
    commit: Commit
  },
  db = database,
): PromisedResult<AgentToolsMap> {
  const docsScope = new DocumentVersionsRepository(workspace.id, db)
  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (docsResult.error) return Result.error(docsResult.error)
  const docs = docsResult.unwrap()

  const agentDocs = docs.filter((doc) => doc.documentType === 'agent')
  const agentToolsMap = agentDocs.reduce((acc: AgentToolsMap, doc) => {
    acc[getAgentToolName(doc.path)] = doc.path
    return acc
  }, {})

  return Result.ok(agentToolsMap)
}
