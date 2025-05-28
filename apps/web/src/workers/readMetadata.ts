import {
  readMetadata,
  CompileError as CompilerCompileError,
} from '@latitude-data/compiler'
import { AgentToolsMap, resolveRelativePath } from '@latitude-data/constants'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'
import type { DocumentVersion } from '@latitude-data/core/browser'

import { CompileError as PromptlCompileError, scan } from 'promptl-ai'

type CompileError = PromptlCompileError | CompilerCompileError

export type ReadMetadataWorkerProps = Parameters<typeof readMetadata>[0] & {
  promptlVersion: number
  document?: DocumentVersion
  documents?: DocumentVersion[]
  providerNames?: string[]
  integrationNames?: string[]
  agentToolsMap?: AgentToolsMap
  noOutputSchemaConfig?: { message: string }
}

self.onmessage = async function (event: { data: ReadMetadataWorkerProps }) {
  const {
    document,
    documents,
    prompt,
    promptlVersion,
    providerNames,
    agentToolsMap,
    integrationNames,
    noOutputSchemaConfig,
    ...rest
  } = event.data

  const referenceFn =
    document && documents
      ? readDocument(document, documents, prompt)
      : undefined
  const configSchema = providerNames
    ? latitudePromptConfigSchema({
        providerNames,
        integrationNames,
        fullPath: document?.path,
        agentToolsMap,
        noOutputSchemaConfig,
      })
    : undefined

  const props = {
    ...rest,
    prompt,
    referenceFn,
    configSchema,
  }

  const metadata =
    promptlVersion === 0 ? await readMetadata(props) : await scan(props)

  const { setConfig: _, errors: errors, ...returnedMetadata } = metadata

  const errorsWithPositions = errors.map((error: CompileError) => {
    return {
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
    }
  })

  self.postMessage({
    ...returnedMetadata,
    errors: errorsWithPositions,
  })
}

function readDocument(
  document?: DocumentVersion,
  documents?: DocumentVersion[],
  prompt?: string,
) {
  if (!document || !documents || !prompt) return undefined

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
