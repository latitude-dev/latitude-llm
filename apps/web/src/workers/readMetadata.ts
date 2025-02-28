import { readMetadata } from '@latitude-data/compiler'
import {
  AgentToolsMap,
  promptConfigSchema,
  resolveRelativePath,
} from '@latitude-data/constants'
import type { DocumentVersion } from '@latitude-data/core/browser'

import { scan } from 'promptl-ai'

export type ReadMetadataWorkerProps = Parameters<typeof readMetadata>[0] & {
  promptlVersion: number
  document?: DocumentVersion
  documents?: DocumentVersion[]
  providerNames?: string[]
  integrationNames?: string[]
  agentToolsMap?: AgentToolsMap
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
    ...rest
  } = event.data

  const referenceFn = readDocument(document, documents, prompt)
  const configSchema =
    document && providerNames
      ? promptConfigSchema({
          providerNames,
          integrationNames,
          fullPath: document.path,
          agentToolsMap,
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

  const errorsWithPositions = errors.map((error) => {
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
