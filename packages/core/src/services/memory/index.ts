import { env } from '@latitude-data/env'
import MemoryClient from 'mem0ai'

let _client: MemoryClient

export function memoryClient() {
  if (_client) return _client

  _client = new MemoryClient({ apiKey: env.MEM0_API_KEY! })

  return _client
}
