import { env } from '@latitude-data/env'
import { omit } from 'lodash-es'
import { Message, MessageContent } from 'promptl-ai'
import { z } from 'zod'
import { cache as getCache } from '../../../cache'
import { database } from '../../../client'
import { hashObject } from '../../../lib/hashObject'
import { Result } from '../../../lib/Result'
import { DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { Optimization } from '../../../schema/models/types/Optimization'
import { Workspace } from '../../../schema/models/types/Workspace'
import { runCopilot } from '../../copilot'
import { OptimizerProposeArgs } from './index'
import { Trajectory } from './shared'

const OPTIMIZATION_PROPOSER_CACHE_KEY = (hash: string) =>
  `optimizations:proposer:${hash}`

const proposerSchema = z.object({
  prompt: z.string(),
})
type ProposerSchema = z.infer<typeof proposerSchema>

function sanitizeContent(content: MessageContent[]): MessageContent[] {
  return content.map((item) => {
    return omit(item, '_promptlSourceMap') as MessageContent
  })
}

function sanitizeTrace(trace: Message[]): Message[] {
  return trace.map((message) => {
    if (Array.isArray(message.content)) {
      return { ...message, content: sanitizeContent(message.content) }
    }
    return message
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
}: {
  optimization: Optimization
  document: DocumentVersion
  workspace: Workspace
}) {
  if (!env.COPILOT_PROMPT_OPTIMIZATION_PROPOSER_PATH) {
    throw new Error('COPILOT_PROMPT_OPTIMIZATION_PROPOSER_PATH is not set')
  }

  return async function (
    { prompt, context, abortSignal }: OptimizerProposeArgs, // TODO(AO/OPT): Implement cancellation
    _ = database,
  ) {
    const trajectories = context.map(sanitizeTrajectory)

    const parameters = {
      path: document.path,
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
