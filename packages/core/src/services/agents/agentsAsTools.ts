import { AgentToolsMap } from '@latitude-data/constants'
import { Tool } from 'ai'
import { jsonSchema } from '@ai-sdk/provider-utils'
import { JSONSchema7, JSONSchema7TypeName } from 'json-schema'
import { ConversationMetadata, scan } from 'promptl-ai'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { getAgentToolName } from './helpers'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

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
  document,
  referenceFn,
}: {
  document: DocumentVersion
  referenceFn: (
    target: string,
    from?: string,
  ) => Promise<{ path: string; content: string } | undefined>
}): Promise<{ name: string; toolDefinition: Tool }> {
  const metadata = (await scan({
    prompt: document.content,
    fullPath: document.path,
    referenceFn,
  })) as ConversationMetadata

  const {
    name,
    description,
    parameters: configuredParameters,
    schema,
  } = metadata.config as LatitudePromptConfig

  const parameters = configuredParameters
    ? Object.fromEntries(
        Object.entries(configuredParameters).map(([key, schema]) => [
          key,
          {
            ...schema,
            type:
              schema.type && !Array.isArray(schema.type)
                ? schema.type in JSON_SCHEMA_TYPES
                  ? JSON_SCHEMA_TYPES[
                      schema.type as keyof typeof JSON_SCHEMA_TYPES
                    ]
                  : 'string'
                : schema.type,
          } as JSONSchema7,
        ]),
      )
    : {}

  metadata.parameters.forEach((param) => {
    if (param in parameters) return
    parameters[param] = DEFAULT_PARAM_DEFINITION
  })

  const toolDefinition: Pick<
    Tool,
    'description' | 'inputSchema' | 'outputSchema'
  > = {
    description: description ?? 'An AI agent',
    inputSchema: jsonSchema({
      type: 'object',
      properties: parameters,
      required: Object.keys(parameters),
      additionalProperties: false,
    }),
    outputSchema: schema ? jsonSchema(schema) : undefined,
  }

  return {
    name: name ?? getAgentToolName(document.path),
    toolDefinition,
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
