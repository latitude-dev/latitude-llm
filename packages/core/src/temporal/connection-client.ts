import { Connection } from '@temporalio/client'
import { env } from '@latitude-data/env'
import fs from 'fs'

type TlsOptions = {
  clientCertPair?: {
    crt: Buffer
    key: Buffer
  }
  serverNameOverride?: string
}

export type ConnectionOptions = {
  address: string
  namespace: string
  apiKey?: string
  tls?: boolean | TlsOptions
}

export function getConnectionOptions(): ConnectionOptions {
  const options: ConnectionOptions = {
    address: env.TEMPORAL_ADDRESS,
    namespace: env.TEMPORAL_NAMESPACE,
  }

  if (env.TEMPORAL_API_KEY) {
    options.apiKey = env.TEMPORAL_API_KEY
  }

  if (env.TEMPORAL_TLS_CERT_PATH && env.TEMPORAL_TLS_KEY_PATH) {
    options.tls = {
      clientCertPair: {
        crt: fs.readFileSync(env.TEMPORAL_TLS_CERT_PATH),
        key: fs.readFileSync(env.TEMPORAL_TLS_KEY_PATH),
      },
    }
    if (env.TEMPORAL_TLS_SERVER_NAME) {
      options.tls.serverNameOverride = env.TEMPORAL_TLS_SERVER_NAME
    }
  } else if (env.TEMPORAL_TLS) {
    options.tls = true
  }

  return options
}

let clientConnection: Connection | null = null

export async function getClientConnection(): Promise<Connection> {
  if (!clientConnection) {
    const options = getConnectionOptions()
    clientConnection = await Connection.connect({
      address: options.address,
      tls: options.tls,
      apiKey: options.apiKey,
    })
  }
  return clientConnection
}

export async function closeClientConnection(): Promise<void> {
  if (clientConnection) {
    await clientConnection.close()
    clientConnection = null
  }
}
