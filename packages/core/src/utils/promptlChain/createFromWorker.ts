import { LatitudeError } from '@latitude-data/constants/errors'
import { Worker } from 'worker_threads'

import os from 'os'
import {
  Chain as PromptlChain,
  ProviderAdapter,
  AdapterMessageType,
  Adapters,
} from 'promptl-ai'
import { env } from '@latitude-data/env'

let workers: Worker[] = []

fillWorkersPool() // Fill the pool with workers on startup

function fillWorkersPool() {
  if (env.NODE_ENV === 'test') return

  const numCpus = os.cpus().length
  for (let i = workers.length; i < numCpus; i++) {
    const url =
      env.NODE_ENV === 'development'
        ? `./node_modules/@latitude-data/core/src/public/workers/promptlChain.js`
        : './dist/workers/promptlChain.js'

    try {
      workers.push(new Worker(url))
    } catch (e) {
      if (env.NODE_ENV === 'development') {
        console.error('Failed to create worker', e)
      }
    }
  }

  if (workers.length > 0) {
    console.log(`Started ${workers.length} workers`)
  }
}

function removeWorkerFromPool(worker: Worker) {
  const index = workers.indexOf(worker)
  if (index !== -1) {
    workers.splice(index, 1)
  }
}

let currentWorkerIndex = 0

function assignTask(task: {
  prompt: string
  parameters: Record<string, unknown> | undefined
  includeSourceMap: boolean
  adapterKey?: keyof typeof Adapters
}) {
  const worker = workers[currentWorkerIndex]
  if (!worker) throw new LatitudeError('No workers available')

  worker.postMessage(task)

  currentWorkerIndex = (currentWorkerIndex + 1) % workers.length

  return worker
}

async function createPromptlChainInWorker({
  prompt,
  parameters,
  includeSourceMap,
  adapter,
}: {
  prompt: string
  parameters: Record<string, unknown> | undefined
  includeSourceMap: boolean
  adapter?: ProviderAdapter<AdapterMessageType>
}): Promise<PromptlChain> {
  return new Promise((resolve, reject) => {
    try {
      const worker = assignTask({
        prompt,
        parameters,
        includeSourceMap,
        adapterKey: adapter?.type,
      })

      worker.on('message', async (serializedChain) => {
        const chain = PromptlChain.deserialize({ serialized: serializedChain })
        if (!chain) return reject(new LatitudeError('Invalid chain'))

        resolve(chain)
      })

      worker.on('error', (err) => {
        reject(err)
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`))

          removeWorkerFromPool(worker)
          fillWorkersPool() // Refill the workers pool
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

export async function createPromptlChain({
  prompt,
  parameters,
  includeSourceMap,
  adapter = Adapters.default,
}: {
  prompt: string
  parameters: Record<string, unknown> | undefined
  includeSourceMap: boolean
  adapter?: ProviderAdapter<AdapterMessageType>
}): Promise<PromptlChain> {
  try {
    return await createPromptlChainInWorker({
      prompt,
      parameters,
      includeSourceMap,
      adapter,
    })
  } catch (error) {
    console.error(error)

    return new PromptlChain({
      prompt,
      parameters,
      includeSourceMap,
      adapter,
    }) as PromptlChain
  }
}
