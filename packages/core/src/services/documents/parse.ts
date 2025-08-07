import { OverloadedError } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'
import os from 'os'
import Piscina from 'piscina'
import { parse, type Fragment } from 'promptl-ai'
import { Result, TypedResult } from '../../lib/Result'

let pool: Piscina | undefined
if (env.NODE_ENV !== 'test') {
  const url =
    env.NODE_ENV === 'development'
      ? `../../public/workers/promptl/parse.js`
      : './workers/promptl/parse.js'

  const isNextJs = process.env.NEXT_RUNTIME !== undefined
  if (!isNextJs) {
    pool = new Piscina({
      filename: new URL(url, import.meta.url).href,
      maxThreads: os.cpus().length,
      maxQueue: 200,
    })
  }
}

export async function parsePrompt(
  prompt: string,
): Promise<TypedResult<Fragment, Error>> {
  try {
    if (!pool) return Result.ok(parse(prompt))
    if (pool.queueSize >= pool.options.maxQueue) {
      return Result.error(new OverloadedError('Worker queue is full'))
    }

    const value = await pool.run(prompt)

    return Result.ok(value)
  } catch (e) {
    return Result.error(e as Error)
  }
}
