import { NativeConnection } from '@temporalio/worker'
import { getConnectionOptions } from './connection-client'

let workerConnection: NativeConnection | null = null

export async function getWorkerConnection(): Promise<NativeConnection> {
  if (!workerConnection) {
    const options = getConnectionOptions()
    workerConnection = await NativeConnection.connect({
      address: options.address,
      tls: options.tls,
      apiKey: options.apiKey,
    })
  }
  return workerConnection
}

export async function closeWorkerConnection(): Promise<void> {
  if (workerConnection) {
    await workerConnection.close()
    workerConnection = null
  }
}

export { NativeConnection }
