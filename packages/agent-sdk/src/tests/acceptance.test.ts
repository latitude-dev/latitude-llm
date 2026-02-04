import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

import { runAgent } from '../index'

const shouldRunAcceptance = process.env.RUN_ACCEPTANCE_TESTS === '1'
const describeAcceptance = shouldRunAcceptance ? describe : describe.skip
const require = createRequire(import.meta.url)

const promptPath = 'src/tests/prompts/acceptance'

type ProviderCase = {
  label: string
  model: string
  envKeys: string[]
  packageName: string
}

const providers: ProviderCase[] = [
  {
    label: 'OpenAI',
    model: 'openai/gpt-4o-mini',
    envKeys: ['OPENAI_API_KEY'],
    packageName: '@ai-sdk/openai',
  },
  {
    label: 'Anthropic',
    model: 'anthropic/claude-opus-4-5',
    envKeys: ['ANTHROPIC_API_KEY'],
    packageName: '@ai-sdk/anthropic',
  },
  {
    label: 'Gemini',
    model: 'google/gemini-2.5-flash',
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    packageName: '@ai-sdk/google',
  },
  {
    label: 'OpenRouter',
    model: 'openrouter/moonshotai/kimi-k2',
    envKeys: ['OPENROUTER_API_KEY'],
    packageName: '@ai-sdk/openai-compatible',
  },
]

const hasAnyEnv = (keys: string[]) =>
  keys.some((key) => Boolean(process.env[key]))

const hasModule = (packageName: string) => {
  try {
    require.resolve(packageName)
    return true
  } catch {
    return false
  }
}

describeAcceptance('Agent SDK acceptance', { timeout: 90000 }, () => {
  for (const provider of providers) {
    const canRun =
      hasAnyEnv(provider.envKeys) && hasModule(provider.packageName)
    const providerTest = canRun ? it : it.skip

    providerTest(`runs prompt against ${provider.label}`, async () => {
      const result = await runAgent(promptPath, {
        model: provider.model,
      })

      const response = result as { text: string }
      expect(response).toBeDefined()
      expect(typeof response.text).toBe('string')
      expect(response.text.length).toBeGreaterThan(0)
      expect(response.text.toLowerCase()).toContain('pong')
    })
  }
})
