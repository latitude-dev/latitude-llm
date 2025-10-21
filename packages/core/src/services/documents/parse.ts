import { parse, type Fragment } from 'promptl-ai'
import { Result, TypedResult } from '../../lib/Result'
import { getOrSet } from '../../cache'
import { hashContent } from '../../lib/hashContent'

export async function parsePrompt(
  prompt: string,
): Promise<TypedResult<Fragment, Error>> {
  try {
    const cacheKey = `prompt-parse:${hashContent(prompt)}`
    const parsed = await getOrSet(
      cacheKey,
      () => Promise.resolve(parse(prompt)),
      3600, // 1 hour
    )

    return Result.ok(parsed)
  } catch (e) {
    return Result.error(e as Error)
  }
}
