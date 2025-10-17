import { stringify as stringifyObjectToYaml } from 'yaml'
import { faker } from '@faker-js/faker'

import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { LatitudePromptConfig } from '@latitude-data/constants/latitudePromptSchema'

const randomSentence = () => {
  const randomSentenceGenerators = [
    faker.commerce.productDescription,
    faker.hacker.phrase,
    faker.company.catchPhrase,
    faker.lorem.sentence,
  ]

  return randomSentenceGenerators[
    Math.floor(Math.random() * randomSentenceGenerators.length)
  ]!()
}

type ExtraConfig = Omit<LatitudePromptConfig, 'provider' | 'model'>

function createFrontMatter({
  provider,
  model,
  extraConfig = {},
}: {
  provider: ProviderApiKey | string
  model?: string
  extraConfig?: ExtraConfig
}) {
  const providerName = typeof provider === 'string' ? provider : provider.name
  const modelName = model ?? faker.internet.domainName()

  const base = `
provider: ${providerName}
model: ${modelName}
`
  if (!Object.keys(extraConfig).length) return base

  const extraConfigYaml = stringifyObjectToYaml(extraConfig)

  return `${base}${extraConfigYaml}`
}

function createPrompt({
  provider,
  model,
  content,
  steps,
  extraConfig = {},
}: {
  provider: ProviderApiKey | string
  model?: string
  content?: string
  steps?: number
  extraConfig?: ExtraConfig
}) {
  const frontMatter = createFrontMatter({ provider, model, extraConfig })
  const prompt = `
---
${frontMatter.trim()}
---
${content ?? ''}
${Array.from({ length: steps ?? 1 })
  .map(() => randomSentence())
  .join('\n<response />\n')}
`.trim()

  return prompt
}

export const helpers = {
  randomSentence,
  createPrompt,
}
