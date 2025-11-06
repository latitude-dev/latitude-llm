import {
  resolveRelativePath,
  ToolDefinitionsMap,
  ToolManifestDict,
  ToolsItem,
} from '@latitude-data/constants'
import { PromisedResult } from '../../../lib/Transaction'
import { LatitudeError, NotFoundError } from '@latitude-data/constants/errors'
import { scan } from 'promptl-ai'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'
import { Result } from '../../../lib/Result'
import { lookupTools } from './lookup'
import { Workspace } from '../../../schema/models/types/Workspace'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'

async function scanDocumentToolsRecursively({
  referenceFn,
  document,
  documents,
  scannedDocumentPaths = [],
}: {
  referenceFn: (
    refPath: string,
    from?: string,
  ) => Promise<{ path: string; content: string } | undefined>
  document: DocumentVersion
  documents: DocumentVersion[]
  scannedDocumentPaths?: string[]
}): PromisedResult<ToolsItem[], LatitudeError> {
  const metadata = await scan({
    prompt: document.content,
    fullPath: document.path,
    referenceFn,
  })

  const config = metadata.config as LatitudePromptConfig

  const tools: ToolsItem[] = []
  if (config.tools) {
    if (Array.isArray(config.tools)) {
      // New schema
      tools.push(...(config.tools as ToolsItem[]))
    } else {
      // Old schema
      tools.push(
        ...Object.entries(config.tools as ToolDefinitionsMap).map(
          ([toolName, toolDefinition]) =>
            ({
              [toolName]: toolDefinition,
            }) as ToolsItem,
        ),
      )
    }
  }

  // Add tools from subagents
  const fullSubagentPaths =
    config.agents?.map((relativePath) =>
      resolveRelativePath(relativePath, document.path),
    ) ?? []

  for (const subagentPath of fullSubagentPaths) {
    const subagentDocument = documents.find((doc) => doc.path === subagentPath)
    if (!subagentDocument) {
      return Result.error(
        new NotFoundError(`Subagent document not found: '${subagentPath}'`),
      )
    }

    if (scannedDocumentPaths.includes(subagentPath)) continue
    scannedDocumentPaths.push(subagentPath)

    const subagentTools = await scanDocumentToolsRecursively({
      referenceFn,
      document: subagentDocument,
      documents,
      scannedDocumentPaths,
    })
    if (subagentTools.error) return subagentTools
    tools.push(...subagentTools.unwrap())
  }

  return Result.ok(tools)
}

/**
 * Returns a tool manifest for all tools that could be executed when running this document, including tools from subagents.
 */
export async function lookupDocumentToolsRecursively({
  documentUuid,
  documents,
  workspace,
}: {
  documentUuid: string
  documents: DocumentVersion[]
  workspace: Workspace
}): PromisedResult<ToolManifestDict, LatitudeError> {
  const referenceFn = async (refPath: string, from?: string) => {
    const fullPath = resolveRelativePath(refPath, from)
    const document = documents.find((doc) => doc.path === fullPath)
    if (!document) return undefined
    return {
      path: document.path,
      content: document.content,
    }
  }

  const toolsResult = await scanDocumentToolsRecursively({
    referenceFn,
    document: documents.find((doc) => doc.documentUuid === documentUuid)!,
    documents,
  })
  if (toolsResult.error) return toolsResult

  return lookupTools({
    config: {
      tools: toolsResult.unwrap(),
    },
    documentUuid,
    documents,
    workspace,
  })
}
