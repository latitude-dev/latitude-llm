import { readMetadata } from '@latitude-data/compiler'
import {
  type AgentToolsMap,
  resolveRelativePath,
  type ToolDefinition,
} from '@latitude-data/constants'
import type { JSONSchema7, JSONSchema7TypeName } from 'json-schema'
import { scan } from 'promptl-ai'
import type { Commit, DocumentVersion, Workspace } from '../../../browser'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import type { PromisedResult } from '../../../lib/Transaction'
import { DocumentVersionsRepository } from '../../../repositories'
import { getAgentToolName } from './helpers'

const JSON_SCHEMA_TYPES = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  integer: 'integer',
  array: 'array',
  null: 'null',
} as const satisfies {
  [T in JSONSchema7TypeName]: T
}

const DEFAULT_PARAM_DEFINITION: JSONSchema7 = {
  type: 'string',
}

export async function getToolDefinitionFromDocument({
  doc,
  allDocs,
}: {
  doc: DocumentVersion
  allDocs: DocumentVersion[]
}): Promise<ToolDefinition> {
  // TODO: Fix this
  // @ts-ignore - type instantiation infinite loop
  const metadataFn = doc.promptlVersion === 1 ? scan : readMetadata
  const referenceFn = async (target: string, from?: string) => {
    const fullPath = from ? resolveRelativePath(from, target) : target
    const refDoc = allDocs.find((doc) => doc.path === fullPath)
    return refDoc
      ? {
          path: refDoc.path,
          content: refDoc.content,
        }
      : undefined
  }

  // TODO: Fix this
  // @ts-ignore - type instantiation infinite loop
  const metadata = await metadataFn({
    prompt: doc.content,
    fullPath: doc.path,
    referenceFn,
  })

  const description = metadata.config.description as string | undefined
  const params = Object.fromEntries(
    Object.entries((metadata.config.parameters ?? {}) as Record<string, JSONSchema7>).map(
      ([key, schema]) => [
        key,
        {
          ...schema,
          type:
            schema.type && !Array.isArray(schema.type)
              ? (JSON_SCHEMA_TYPES[schema.type] ?? 'string')
              : schema.type,
        },
      ],
    ),
  ) as Record<string, JSONSchema7>
  metadata.parameters.forEach((param) => {
    if (param in params) return
    params[param] = DEFAULT_PARAM_DEFINITION
  })

  return {
    description: description ?? 'An AI agent',
    parameters: {
      type: 'object',
      properties: params,
      required: Object.keys(params),
      additionalProperties: false,
    },
  }
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
