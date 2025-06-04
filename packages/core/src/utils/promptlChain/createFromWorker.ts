import { LatitudeError, OverloadedError } from '@latitude-data/constants/errors'

import os from 'os'
import {
  Chain as PromptlChain,
  ProviderAdapter,
  AdapterMessageType,
  Adapters,
} from 'promptl-ai'
import { env } from '@latitude-data/env'
import Piscina from 'piscina'
import { Result, TypedResult } from '../../lib/Result'

let pool: Piscina | undefined
if (env.NODE_ENV !== 'test') {
  const url =
    env.NODE_ENV === 'development'
      ? `../../public/workers/promptlChain.js`
      : './workers/promptlChain.js'

  pool = new Piscina({
    filename: new URL(url, import.meta.url).href,
    maxThreads: os.cpus().length,
    maxQueue: 200,
  })
}

async function createPromptlChainInWorker({
  prompt,
  parameters,
  includeSourceMap,
  adapter,
}: {
  prompt: string
  parameters: Record<string, unknown> | undefined
  includeSourceMap: boolean
  adapter?: ProviderAdapter<AdapterMessageType>
}): Promise<TypedResult<PromptlChain, Error>> {
  try {
    if (!pool) {
      return Result.error(new LatitudeError('Worker pool not initialized'))
    }
    if (pool.queueSize >= pool.options.maxQueue) {
      return Result.error(new OverloadedError('Worker queue is full'))
    }

    const serializedChain = await pool.run({
      prompt,
      parameters,
      includeSourceMap,
      adapterKey: adapter?.type,
    })

    const chain = PromptlChain.deserialize({ serialized: serializedChain })
    if (!chain) return Result.error(new LatitudeError('Invalid chain'))

    return Result.ok(chain)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function createPromptlChain({
  prompt,
  parameters,
  includeSourceMap,
  adapter = Adapters.default,
}: {
  prompt: string
  parameters: Record<string, unknown> | undefined
  includeSourceMap: boolean
  adapter?: ProviderAdapter<AdapterMessageType>
}): Promise<TypedResult<PromptlChain, Error>> {
  const result = await createPromptlChainInWorker({
    prompt,
    parameters,
    includeSourceMap,
    adapter,
  })

  if (result.error && !(result.error instanceof OverloadedError)) {
    console.error(result.error)
    return Result.ok(
      new PromptlChain({
        prompt,
        parameters,
        includeSourceMap,
        adapter,
      }) as PromptlChain,
    )
  }

  return result
}
