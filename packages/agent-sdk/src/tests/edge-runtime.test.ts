import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

import { registerPromptModules, runAgent } from '../edge'

const shouldRunEdge = process.env.RUN_ACCEPTANCE_TESTS === '1'
const describeEdge = shouldRunEdge ? describe : describe.skip
const require = createRequire(import.meta.url)

const hasEnv = Boolean(process.env.OPENAI_API_KEY)

const hasModule = () => {
  try {
    require.resolve('@ai-sdk/openai')
    return true
  } catch {
    return false
  }
}

describeEdge('Agent SDK edge runtime', { timeout: 90000 }, () => {
  const canRun = hasEnv && hasModule()
  const edgeTest = canRun ? it : it.skip
  const promptPath = 'edge/smoke'

  edgeTest('runs prompt using registry', async () => {
    await registerPromptModules({
      'edge/smoke':
        '<system>Respond with "pong".</system>\n<user>ping</user>\n',
    })

    const result = await runAgent(promptPath, {
      model: 'openai/gpt-4o-mini',
    })

    const response = result as { text: string }
    expect(response).toBeDefined()
    expect(typeof response.text).toBe('string')
    expect(response.text.length).toBeGreaterThan(0)
    expect(response.text.toLowerCase()).toContain('pong')
  })
})
