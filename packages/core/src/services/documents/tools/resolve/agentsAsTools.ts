import { ChainEvent, StreamEventTypes } from '@latitude-data/constants'
import {
  BadRequestError,
  ChainError,
  LatitudeError,
  NotFoundError,
  RunErrorCodes,
} from '../../../../lib/errors'
import { PromisedResult } from '../../../../lib/Transaction'
import { Result } from '../../../../lib/Result'
import { ToolManifest } from '@latitude-data/constants/tools'
import { ToolSource } from '@latitude-data/constants/toolSources'
import { Tool } from 'ai'
import { StreamManager } from '../../../../lib/streamManager'
import { telemetry } from '../../../../telemetry'
import { runDocumentAtCommit } from '../../../commits'
import { DocumentVersionsRepository } from '../../../../repositories'

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

export async function resolveAgentAsToolDefinition({
  toolName,
  toolManifest,
  streamManager,
}: {
  toolName: string
  toolManifest: ToolManifest<ToolSource.Agent>
  streamManager: StreamManager
}): PromisedResult<Tool, LatitudeError> {
  const { $context, workspace, promptSource } = streamManager
  const context = $context

  if (!('commit' in promptSource)) {
    return Result.error(
      new BadRequestError('Sub agents are not supported in this context'),
    )
  }
  const { commit } = promptSource
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (docsResult.error) return Result.error(docsResult.error)
  const docs = docsResult.unwrap()
  const document = docs.find(
    (doc) => doc.documentUuid === toolManifest.sourceData.documentUuid,
  )
  if (!document) {
    return Result.error(new NotFoundError('Document not found'))
  }

  return Result.ok({
    ...toolManifest.definition,
    execute: async (args: Record<string, unknown>, toolCall) => {
      const $tool = telemetry.span.tool(
        {
          name: toolName,
          call: {
            id: toolCall.toolCallId,
            arguments: args,
          },
        },
        context,
      )

      try {
        // prettier-ignore
        const { response, stream, error, runUsage } = await runDocumentAtCommit({
        context: $tool.context,
        workspace,
        commit,
        document,
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
  })
}
