import { AgentToolsMap, LogSources } from '@latitude-data/constants'
import { DocumentVersionsRepository } from '../../repositories'
import { Commit, DocumentVersion, Workspace } from '../../browser'
import { scan } from 'promptl-ai'
import { JSONSchema7 } from 'json-schema'
import { getAgentToolName } from './helpers'
import { database } from '../../client'
import { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'
import { Tool } from 'ai'
import { runDocumentAtCommit } from '../commits'

const DEFAULT_PARAM_DEFINITION: JSONSchema7 = {
  type: 'string',
}

export async function getToolDefinitionFromDocument({
  workspace,
  commit,
  document,
  referenceFn,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  referenceFn: (
    target: string,
    from?: string,
  ) => Promise<{ path: string; content: string } | undefined>
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
    execute: async (args: Record<string, unknown>) => {
      const { response } = await runDocumentAtCommit({
        workspace,
        document,
        commit,
        parameters: args,
        source: LogSources.AgentAsTool,
      }).then((r) => r.unwrap())

      const res = await response
      if (!res) return

      return res.streamType === 'text' ? res.text : res.object
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
