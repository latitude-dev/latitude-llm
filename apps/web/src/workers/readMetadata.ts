import { AgentToolsMap, resolveRelativePath } from '@latitude-data/constants'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'
import {
  fromAstToBlocks,
  type BlockRootNode,
} from '@latitude-data/web-ui/fromAstToBlocks'
import type { DocumentVersion } from '@latitude-data/core/browser'
import { AstError } from '@latitude-data/constants/promptl'

import {
  CompileError as PromptlCompileError,
  ConversationMetadata as PromptlConversationMetadata,
  scan,
} from 'promptl-ai'

type CompileError = PromptlCompileError

type EditorType = 'code' | 'visual'
export type ReadMetadataWorkerProps = Parameters<typeof scan>[0] & {
  promptlVersion: number
  editorType: EditorType
  document?: DocumentVersion
  documents?: DocumentVersion[]
  providerNames?: string[]
  integrationNames?: string[]
  agentToolsMap?: AgentToolsMap
  noOutputSchemaConfig?: { message: string }
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

function handleMetadata({
  prompt,
  editorType,
  metadata,
}: {
  prompt: string
  editorType: EditorType
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

  let rootBlock: BlockRootNode

  if (metadata.ast && editorType === 'visual') {
    rootBlock = fromAstToBlocks({ ast: metadata.ast, prompt, errors })
  }

  return {
    ...(returnedMetadata as PromptlConversationMetadata),
    errors,
    // We lie with `!` but is ok because this is used only when visual editor
    rootBlock: rootBlock!,
  }
}

export type ResolvedMetadata = Awaited<ReturnType<typeof handleMetadata>>

self.onmessage = async function (event: { data: ReadMetadataWorkerProps }) {
  const {
    prompt,
    editorType,
    document,
    documents,
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

  const scanParams = {
    prompt,
    fullPath: document?.path,
    referenceFn: props.referenceFn,
    withParamters: props.withParameters,
    requireConfig: props.requireConfig,
    configSchema: props.configSchema as any,
  }
  const metadata = await scan(scanParams)

  self.postMessage(handleMetadata({ editorType, metadata, prompt }))
}
