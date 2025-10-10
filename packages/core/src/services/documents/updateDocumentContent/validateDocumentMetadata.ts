import {
  CompileError,
  ConversationMetadata as PromptlConversationMetadata,
  scan,
} from 'promptl-ai'
import type { AstError } from '@latitude-data/constants/promptl'
import { AgentToolsMap, resolveRelativePath } from '@latitude-data/constants'
import { Commit, DocumentVersion, Workspace } from '../../../schema/types'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'
import {
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
} from '../../../repositories'
import { listIntegrations } from '../../integrations/list'
import { getAgentToolName } from '../../agents/helpers'

function readDocument(
  document: DocumentVersion,
  documents: DocumentVersion[],
  prompt: string,
) {
  return async (refPath: string, from?: string) => {
    const fullPath = resolveRelativePath(refPath, from)

    if (fullPath === document.path) {
      return {
        path: fullPath,
        content: prompt,
      }
    }

    const content = documents.find((d) => d.path === fullPath)?.content
    if (content === undefined) return undefined

    return {
      path: fullPath,
      content,
    }
  }
}

function buildAgentsToolMap(documents: DocumentVersion[] = []) {
  if (!documents) return {}

  return documents.reduce((acc: AgentToolsMap, document) => {
    // TODO: Remove when we remove agent type and make all documents agents
    if (document.documentType === 'agent') {
      acc[getAgentToolName(document.path)] = document.path
    }
    return acc
  }, {})
}

async function getProvderNames({ workspace }: { workspace: Workspace }) {
  const scope = new ProviderApiKeysRepository(workspace.id)
  const providers = await scope.findAll().then((r) => r.unwrap())
  return providers.map((provider) => provider.name)
}

function parseMetadataErrors({
  metadata,
}: {
  metadata: PromptlConversationMetadata
}) {
  const { setConfig: _, errors: rawErrors, ...returnedMetadata } = metadata
  const errors = rawErrors.map((error: CompileError) => {
    return {
      startIndex: error.startIndex,
      endIndex: error.endIndex,
      start: {
        line: error.start?.line ?? 0,
        column: error.start?.column ?? 0,
      },
      end: {
        line: error.end?.line ?? 0,
        column: error.end?.column ?? 0,
      },
      message: error.message,
      name: error.name,
    } satisfies AstError
  })

  return {
    ...(returnedMetadata as PromptlConversationMetadata),
    errors,
  }
}

export async function validateDocumentMetadata({
  commit,
  document,
  workspace,
  prompt,
}: {
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
  prompt: string
}) {
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const documents = await docsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())
  const agentToolsMap = buildAgentsToolMap(documents)
  const providerNames = await getProvderNames({ workspace })
  const integrations = await listIntegrations(workspace).then((r) => r.unwrap())
  const integrationNames = integrations.map((i) => i.name)
  const referenceFn = readDocument(document, documents, prompt)
  const configSchema = latitudePromptConfigSchema({
    providerNames,
    integrationNames,
    fullPath: document?.path,
    agentToolsMap,
  })
  const scanParams = {
    prompt,
    fullPath: document?.path,
    referenceFn,
    requireConfig: true,
    configSchema,
  }
  const metadata = await scan(scanParams)

  return parseMetadataErrors({ metadata })
}
