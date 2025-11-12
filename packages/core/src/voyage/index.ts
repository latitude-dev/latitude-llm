import { env } from '@latitude-data/env'
import { VoyageAIClient } from 'voyageai'

let connection: VoyageAIClient

export const voyage = async () => {
  if (connection) return connection
  if (!env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is not set')
  }

  connection = new VoyageAIClient({
    apiKey: env.VOYAGE_API_KEY,
  })

  return connection
}
