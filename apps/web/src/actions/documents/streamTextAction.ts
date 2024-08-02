'use server'

import { Message, readMetadata } from '@latitude-data/compiler'
import {
  ai,
  ProviderApiKeysRepository,
  streamToGenerator,
  validateConfig,
} from '@latitude-data/core'
import { DocumentVersion, PROVIDER_EVENT } from '@latitude-data/core/browser'
import { getDocumentByIdCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { createStreamableValue } from 'ai/rsc'

export async function streamTextAction({
  id,
  messages,
}: {
  id: number
  messages: Message[]
}) {
  const document = await getDocumentByIdCached(id)
  const { config, apiKey } = await getConfigAndApiKey(document)
  const stream = createStreamableValue()

  ;(async () => {
    const result = await ai({
      apiKey: apiKey.token,
      messages,
      model: config.model,
      provider: apiKey.provider,
    })

    try {
      for await (const value of streamToGenerator(result.fullStream)) {
        stream.update({
          event: PROVIDER_EVENT,
          data: value,
        })
      }

      stream.done()
    } catch (error) {
      const err = error as Error
      stream.error({
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    }
  })()

  return {
    output: stream.value,
  }
}

async function getConfigAndApiKey(document: DocumentVersion) {
  const { workspace } = await getCurrentUser()
  const metadata = await readMetadata({ prompt: document.content })
  const config = validateConfig(metadata.config)
  const providerApiKeysScope = new ProviderApiKeysRepository(workspace.id)
  const apiKey = await providerApiKeysScope
    .findByName(config.apiKey)
    .then((r) => r.unwrap())

  return { config, apiKey }
}
