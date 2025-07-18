import { AgentToolsMap, LogSources } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Tool } from 'ai'
import { JSONSchema7 } from 'json-schema'
import { scan } from 'promptl-ai'
import { Commit, DocumentVersion, Workspace } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { telemetry, TelemetryContext } from '../../telemetry'
import { runDocumentAtCommit } from '../commits'
import { getAgentToolName } from './helpers'

const DEFAULT_PARAM_DEFINITION: JSONSchema7 = {
  type: 'string',
}

export async function getToolDefinitionFromDocument({
  workspace,
  commit,
  document,
  referenceFn,
  context,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  referenceFn: (
    target: string,
    from?: string,
  ) => Promise<{ path: string; content: string } | undefined>
  context: TelemetryContext
}): Promise<Tool> {
  const metadata = await scan({
    prompt: document.content,
    fullPath: document.path,
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

  return {
    description: description ?? 'An AI agent',
    parameters: {
      type: 'object',
      properties: params,
      required: Object.keys(params),
      additionalProperties: false,
    },
    execute: async (args: Record<string, unknown>, toolCall) => {
      const $span = telemetry.tool(context, {
        name: getAgentToolName(document.path),
        call: {
          id: toolCall.toolCallId,
          arguments: args,
        },
      })

      try {
        const { response, error } = await runDocumentAtCommit({
          context,
          workspace,
          document,
          commit,
          parameters: args,
          source: LogSources.AgentAsTool,
        }).then((r) => r.unwrap())

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

        $span?.end({ result: { value, isError: false } })

        return {
          value,
          isError: false,
        }
      } catch (e) {
        const result = {
          value: (e as Error).message,
          isError: true,
        }

        $span?.end({ result })

        return result
      }
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
