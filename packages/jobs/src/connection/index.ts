import IORedis from 'ioredis'

export type ConnectionParams = {
  port: number
  host: string
  password?: string
}
export function buildConnection({ host, port, password }: ConnectionParams) {
  console.log('🔥 Connecting to Redis', host, port)
  return new IORedis(port, host, {
    password: password ? password : undefined,
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
  })
}
