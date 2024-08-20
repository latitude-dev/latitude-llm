import { faker } from '@faker-js/faker'
import { ProviderApiKey } from '$core/browser'

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
  steps,
}: {
  provider: ProviderApiKey
  model?: string
  steps?: number
}) {
  const prompt = `
---
provider: ${provider.name}
model: ${model ?? faker.internet.domainName()}
---
${Array.from({ length: steps ?? 1 })
  .map(() => randomSentence())
  .join('\n<step />\n')}
`.trim()

  return prompt
}

export const helpers = {
  randomSentence,
  createPrompt,
}
