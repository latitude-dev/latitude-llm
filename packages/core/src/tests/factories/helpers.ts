import { faker } from '@faker-js/faker'

import { ProviderApiKey } from '../../browser'

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

function createPrompt({
  provider,
  model,
  content,
  steps,
}: {
  provider: ProviderApiKey | string
  model?: string
  content?: string
  steps?: number
}) {
  const prompt = `
---
provider: ${typeof provider === 'string' ? provider : provider.name}
model: ${model ?? faker.internet.domainName()}
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
