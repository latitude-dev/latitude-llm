import {
  AgentToolsMap,
  ChainEvent,
  StreamEventTypes,
} from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Tool } from 'ai'
import { jsonSchema } from '@ai-sdk/provider-utils'
import { JSONSchema7, JSONSchema7TypeName } from 'json-schema'
import { ConversationMetadata, scan } from 'promptl-ai'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { StreamManager } from '../../lib/streamManager'
import { PromisedResult } from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { telemetry, TelemetryContext } from '../../telemetry'
import { runDocumentAtCommit } from '../commits'
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
  workspace,
  commit,
  document,
  referenceFn,
  streamManager,
  context,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  referenceFn: (
    target: string,
    from?: string,
  ) => Promise<{ path: string; content: string } | undefined>
  streamManager: StreamManager
  context: TelemetryContext
}): Promise<{ name: string; toolDefinition: Tool }> {
  const metadata = (await scan({
    prompt: document.content,
    fullPath: document.path,
    referenceFn,
  })) as ConversationMetadata

  const name = metadata.config['name'] as string | undefined
  const description = metadata.config['description'] as string | undefined
  const params = Object.fromEntries(
    Object.entries(
      (metadata.config['parameters'] ?? {}) as Record<string, JSONSchema7>,
    ).map(([key, schema]) => [
      key,
      {
        ...schema,
        type:
          schema.type && !Array.isArray(schema.type)
            ? (JSON_SCHEMA_TYPES[schema.type] ?? 'string')
            : schema.type,
      },
    ]),
  ) as Record<string, JSONSchema7>
  metadata.parameters.forEach((param) => {
    if (param in params) return
    params[param] = DEFAULT_PARAM_DEFINITION
  })

  const toolDefinition: Tool = {
    description: description ?? 'An AI agent',
    inputSchema: jsonSchema({
      type: 'object',
      properties: params,
      required: Object.keys(params),
      additionalProperties: false,
    }),
    execute: async (args: Record<string, unknown>, toolCall) => {
      const $tool = telemetry.tool(context, {
        name: getAgentToolName(document.path),
        call: {
          id: toolCall.toolCallId,
          arguments: args,
        },
      })

      try {
        // prettier-ignore
        const { response, stream, error, runUsage } = await runDocumentAtCommit({
          context: $tool.context,
          workspace,
          document,
          commit,
          parameters: args,
          tools: streamManager.tools,
          abortSignal: streamManager.abortSignal,
          simulationSettings: streamManager.simulationSettings,
          // TODO: Review this. We are forwarding the parent's source so that
          // tool calls are automatically handled in playground and evaluation
          // contexts. This is not ideal. Spoiler: a boolean prop to control
          // this is also not ideal.
          //
          // On the other hand, it's actually useful to konw the context from
          // which a subagent was called, rather than just "agentAsTool".
          //
          // So... I'm not sure what to do here yet.
          source: streamManager.source,
        }).then((r) => r.unwrap())

        await forwardToolEvents({
          source: stream,
          target: streamManager.controller,
        })

        const usage = await runUsage
        streamManager.incrementRunUsage(usage)

        const res = await response
        if (!res) {
          const err = await error
          if (err) {
            throw err
          } else {
            const error = new ChainError({
              code: RunErrorCodes.AIRunError,
              message: `Subagent ${document.path} failed unexpectedly.`,
            })

            throw error
          }
        }

        const value = res.streamType === 'text' ? res.text : res.object

        $tool?.end({ result: { value, isError: false } })

        return {
          value,
          isError: false,
        }
      } catch (e) {
        const result = {
          value: (e as Error).message,
          isError: true,
        }

        $tool?.end({ result })

        return result
      }
    },
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

async function forwardToolEvents({
  source,
  target,
}: {
  source?: ReadableStream<ChainEvent>
  target?: ReadableStreamDefaultController<ChainEvent>
}) {
  if (!source || !target) return

  const reader = source.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const { event, data } = value
    if (event === StreamEventTypes.Provider) {
      if (data.type === 'tool-call' || data.type === 'tool-result') {
        target.enqueue(value)
      }
    }
  }
}
