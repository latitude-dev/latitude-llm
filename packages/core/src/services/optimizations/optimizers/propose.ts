import { env } from '@latitude-data/env'
import { omit } from 'lodash-es'
import { z } from 'zod'
import { cache as getCache } from '../../../cache'
import { database } from '../../../client'
import { Message, MessageContent } from '../../../constants'
import { hashObject } from '../../../lib/hashObject'
import { Result } from '../../../lib/Result'
import { Commit } from '../../../schema/models/types/Commit'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Workspace } from '../../../schema/models/types/Workspace'
import {
  formatModelsDevModel,
  getModelsDevForModel,
} from '../../ai/estimateCost/modelsDev'
import { runCopilot } from '../../copilot'
import { scanDocumentContent } from '../../documents'
import { buildProvidersMap } from '../../providerApiKeys/buildMap'
import { OptimizerProposeArgs } from './index'
import { Trajectory } from './shared'

const OPTIMIZATION_PROPOSER_CACHE_KEY = (hash: string) =>
  `optimizations:proposer:${hash}`

const proposerSchema = z.object({
  prompt: z.string(),
})
type ProposerSchema = z.infer<typeof proposerSchema>

const METADATA_KEYS = [
  '_promptlSourceMap',
  '_providerMetadata',
  '_provider_metadata',
  'providerOptions',
]

function sanitizeContent(content: MessageContent[]): MessageContent[] {
  return content.map((item) => {
    return omit(item, ...METADATA_KEYS) as MessageContent
  })
}

function sanitizeTrace(trace: Message[]): Message[] {
  return trace.map((message) => {
    const base = Array.isArray(message.content)
      ? { ...message, content: sanitizeContent(message.content) }
      : message
    return omit(base, ...METADATA_KEYS) as Message
  })
}

function sanitizeTrajectory(trajectory: Trajectory) {
  return {
    ...omit(trajectory, 'id', '_tjr'),
    trace: sanitizeTrace(trajectory.trace),
    usage: omit(trajectory.usage, 'inputTokens', 'outputTokens'),
  }
}

// BONUS(AO/OPT): Implement multi-document optimization
export async function proposeFactory({
  optimization,
  document,
  commit,
  workspace,
}: {
  optimization: Optimization
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
}) {
  if (!env.COPILOT_PROMPT_OPTIMIZATION_PROPOSER_PATH) {
    throw new Error('COPILOT_PROMPT_OPTIMIZATION_PROPOSER_PATH is not set')
  }

  const providers = await buildProvidersMap({ workspaceId: workspace.id })

  return async function (
    { prompt, context, abortSignal }: OptimizerProposeArgs, // TODO(AO/OPT): Implement cancellation
    _ = database,
  ) {
    const scanning = await scanDocumentContent({
      document: { ...document, content: prompt },
      commit: commit,
    })
    const provider = scanning.value?.config?.provider as string | undefined
    const model = scanning.value?.config?.model as string | undefined

    let modelInfo = undefined
    if (provider && model && providers.has(provider)) {
      const providerId = providers.get(provider)!.provider
      const modelData = getModelsDevForModel(providerId, model)
      if (modelData) modelInfo = formatModelsDevModel(modelData)
    }

    const trajectories = context.map(sanitizeTrajectory)

    const parameters = {
      path: document.path,
      model: modelInfo,
      prompt: prompt,
      trajectories: trajectories,
      scope: optimization.configuration.scope,
    }

    const cache = await getCache()
    const key = OPTIMIZATION_PROPOSER_CACHE_KEY(hashObject(parameters).hash)

    try {
      const item = await cache.get(key)
      if (item) {
        const result = JSON.parse(item) as ProposerSchema
        return Result.ok(result.prompt)
      }
    } catch (_) {
      // Note: doing nothing
    }

    const running = await runCopilot({
      path: env.COPILOT_PROMPT_OPTIMIZATION_PROPOSER_PATH!,
      parameters: parameters,
      schema: proposerSchema,
      abortSignal: abortSignal,
    })
    if (running.error) {
      return Result.error(running.error)
    }
    const result = running.value

    try {
      const item = JSON.stringify(result)
      await cache.set(key, item)
    } catch (_) {
      // Note: doing nothing
    }

    return Result.ok(result.prompt)
  }
}
