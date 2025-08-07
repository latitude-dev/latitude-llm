import type { AgentToolsMap } from '@latitude-data/constants'
import { resolveRelativePath } from '@latitude-data/constants'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'
import type { AstError } from '@latitude-data/constants/promptl'
import {
  CompileError as PromptlCompileError,
  ConversationMetadata as PromptlConversationMetadata,
  scan,
} from 'promptl-ai'
import type { BlockRootNode } from '../components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'
import { fromAstToBlocks } from '../components/BlocksEditor/Editor/state/promptlToLexical/fromAstToBlocks'

type CompileError = PromptlCompileError

export type ReadMetadataWorkerProps = Parameters<typeof scan>[0] & {
  promptlVersion: number
  document?: any
  documents?: any[]
  providerNames?: string[]
  integrationNames?: string[]
  agentToolsMap?: AgentToolsMap
  noOutputSchemaConfig?: { message: string }
  origin?: 'blocksEditor' | 'latteCopilot' | string
}

function readDocument(document?: any, documents?: any[], prompt?: string) {
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
  metadata,
  origin,
}: {
  prompt: string
  metadata: PromptlConversationMetadata
  origin?: ReadMetadataWorkerProps['origin']
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

  let rootBlock: BlockRootNode | undefined = undefined
  if (metadata.ast) {
    rootBlock = fromAstToBlocks({ ast: metadata.ast, prompt, errors })
  }

  return {
    ...(returnedMetadata as PromptlConversationMetadata),
    errors,
    // We lie with `!` but is ok because this is used only when visual editor
    rootBlock,
    origin,
  }
}

export type ResolvedMetadata = Awaited<ReturnType<typeof handleMetadata>>

self.onmessage = async function (event: { data: ReadMetadataWorkerProps }) {
  const {
    prompt,
    document,
    documents,
    providerNames,
    agentToolsMap,
    integrationNames,
    noOutputSchemaConfig,
    origin,
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

  self.postMessage(handleMetadata({ metadata, prompt, origin }))
}
